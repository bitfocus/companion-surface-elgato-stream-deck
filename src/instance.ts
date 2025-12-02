import {
	CardGenerator,
	HostCapabilities,
	SurfaceDrawProps,
	SurfaceContext,
	SurfaceInstance,
	parseColor,
	SurfaceFirmwareUpdateCache,
	SurfaceFirmwareUpdateInfo,
	createModuleLogger,
	ModuleLogger,
} from '@companion-surface/base'
import { DeviceModelId, StreamDeck, StreamDeckLcdSegmentControlDefinition } from '@elgato-stream-deck/node'
import { setTimeout } from 'node:timers/promises'
import { getControlId, getControlIdFromXy, matchOffsetByControlId } from './util.js'
import { checkForFirmwareUpdatesForSurface } from './firmware.js'
import { StreamDeckTcp } from '@elgato-stream-deck/tcp'

export class StreamDeckWrapper implements SurfaceInstance {
	readonly #logger: ModuleLogger

	readonly #deck: StreamDeck | StreamDeckTcp
	readonly #surfaceId: string
	readonly #context: SurfaceContext

	/**
	 * Whether the LCD has been written to outside the button bounds that needs clearing
	 */
	#fullLcdDirty = true

	/**
	 * Whether to cleanup the deck on quit
	 */
	#shouldCleanupOnQuit = true

	#swipeToChangePage = false

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return this.#deck.PRODUCT_NAME
	}

	public constructor(surfaceId: string, deck: StreamDeck | StreamDeckTcp, context: SurfaceContext) {
		this.#logger = createModuleLogger(`Instance/${surfaceId}`)
		this.#deck = deck
		this.#surfaceId = surfaceId
		this.#context = context

		this.#deck.on('error', (e) => context.disconnect(e as any))

		this.#deck.on('down', (control) => {
			context.keyDownById(getControlId(control))
		})
		this.#deck.on('up', (control) => {
			context.keyUpById(getControlId(control))
		})
		this.#deck.on('rotate', (control, delta) => {
			if (delta < 0) {
				context.rotateLeftById(getControlId(control))
			} else if (delta > 0) {
				context.rotateRightById(getControlId(control))
			}
		})
		this.#deck.on('lcdShortPress', (control, position) => {
			if (context.isLocked) return

			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)
			const column = control.column + columnOffset

			context.keyDownUpById(getControlIdFromXy(column, control.row))
		})
		this.#deck.on('lcdLongPress', (control, position) => {
			if (context.isLocked) return

			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)
			const column = control.column + columnOffset

			context.keyDownUpById(getControlIdFromXy(column, control.row))
		})

		const getLCDButton = (control: StreamDeckLcdSegmentControlDefinition, x: number) => {
			// Button assignment is very permissive, but maybe more compatible with the graphics overhaul?
			// note: this doesn't take into account the SD Plus button offset, but that gives a little margin to the left, so maybe OK.
			// TODO: reexamine when double-width buttons are implemented?
			//   if using the margin, add Math.max(0, Math.min(control.columnSpan-1, ... ))
			const columnOffset = Math.floor((x / control.pixelSize.width) * control.columnSpan)
			return control.column + columnOffset
		}
		this.#deck.on('lcdSwipe', (control, from, to) => {
			const angle = Math.atan(Math.abs((from.y - to.y) / (from.x - to.x))) * (180 / Math.PI)
			const fromButton = getLCDButton(control, from.x)
			const toButton = getLCDButton(control, to.x)
			this.#logger.debug(
				`LCD #${control.id} swipe: (${from.x}, ${from.y}; button:${fromButton})->(${to.x}, ${to.y}; button: ${toButton}): Angle: ${angle.toFixed(1)}`,
			)
			// avoid ambiguous swipes, so vertical has to be "clearly vertical", so make it a bit more than 45
			if (angle >= 50 && toButton === fromButton) {
				//vertical swipe. note that y=0 is the top of the screen so for swipe up `from.y` is the higher
				const controlId = getControlIdFromXy(fromButton, control.row)
				if (from.y > to.y) {
					context.rotateRightById(controlId)
				} else {
					context.rotateLeftById(controlId)
				}
			} else if (angle <= 22.5 && this.#swipeToChangePage) {
				// horizontal swipe, change pages: (note that the angle of the SD+ screen diagonal is 7 degrees, i.e. atan 1/8)
				context.changePage(from.x > to.x) //swipe left moves to next page, as if your finger is moving a piece of paper under the screen
			}
		})

		const tcpStreamdeck = 'tcpEvents' in deck ? deck : null
		if (tcpStreamdeck) {
			// Don't call `close` upon quit, that gets handled automatically
			this.#shouldCleanupOnQuit = false

			// this.info.location = tcpStreamdeck.remoteAddress

			tcpStreamdeck.tcpEvents.on('disconnected', () => {
				this.#logger.warn(
					`Lost connection to TCP Streamdeck ${tcpStreamdeck.remoteAddress}:${tcpStreamdeck.remotePort} (${this.#deck.PRODUCT_NAME})`,
				)

				this.#context.disconnect(new Error('Stream Deck Disconnected'))
			})
		}
	}

	async init(): Promise<void> {
		// Start with blanking it
		await this.blank()
	}
	async close(): Promise<void> {
		if (!this.#shouldCleanupOnQuit) return

		await this.#deck.resetToLogo().catch(() => null)

		await this.#deck.close()
	}

	updateCapabilities(_capabilities: HostCapabilities): void {
		// Not used
	}

	async updateConfig(config: Record<string, any>): Promise<void> {
		this.#swipeToChangePage = !!config.swipe_can_change_page
	}

	async ready(): Promise<void> {}

	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent)
	}
	async blank(): Promise<void> {
		await this.#deck.clearPanel()
	}
	async draw(signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		const control = this.#deck.CONTROLS.find((control) => {
			if (getControlId(control) === drawProps.controlId) return true

			if (control.type === 'lcd-segment' && control.columnSpan > 1) {
				const offset = matchOffsetByControlId(drawProps.controlId, control)
				if (offset !== null) return true
			}

			return false
		})
		if (!control) return

		if (control.type === 'button') {
			if (control.feedbackType === 'lcd') {
				if (!drawProps.image) {
					this.#logger.error(`No image provided for lcd button: ${drawProps.controlId}`)
					return
				}

				if (control.pixelSize.width === 0 || control.pixelSize.height === 0) {
					return
				}

				const maxAttempts = 3
				for (let attempts = 1; attempts <= maxAttempts; attempts++) {
					try {
						if (signal.aborted) return

						await this.#deck.fillKeyBuffer(control.index, drawProps.image)
						break
					} catch (e) {
						if (attempts == maxAttempts) {
							this.#logger.error(`fillImage of ${drawProps.controlId} failed after ${attempts} attempts: ${e}`)
							return
						}
						await setTimeout(20, { signal })
					}
				}
			} else if (control.feedbackType === 'rgb') {
				const color = parseColor(drawProps.color)

				if (signal.aborted) return

				this.#deck.fillKeyColor(control.index, color.r, color.g, color.b).catch((e) => {
					this.#logger.error(`fillKeyColor of ${drawProps.controlId} failed: ${e}`)
				})
			}
		} else if (control.type === 'lcd-segment') {
			if (!drawProps.image) {
				this.#logger.error(`No image provided for lcd-segment: ${drawProps.controlId}`)
				return
			}

			// Clear the lcd segment if needed
			if (this.#fullLcdDirty) {
				if (signal.aborted) return

				this.#fullLcdDirty = false
				await this.#deck.clearLcdSegment(control.id)
			}

			if (this.#context.isLocked) {
				// Special case handling for neo lcd strip
				if (this.#deck.MODEL === DeviceModelId.NEO) {
					await this.#deck.fillLcd(control.id, drawProps.image, {
						format: 'rgb',
					})
					return
				}
			}
			if (control.drawRegions) {
				const drawColumn = matchOffsetByControlId(drawProps.controlId, control)
				if (drawColumn === null) {
					this.#logger.error(`Failed to find column for controlId ${drawProps.controlId}`)
					return
				}

				const columnWidth = control.pixelSize.width / control.columnSpan
				let drawX = drawColumn * columnWidth
				if (this.#deck.MODEL === DeviceModelId.PLUS) {
					// Position aligned with the buttons/encoders
					drawX = drawColumn * 216.666 + 25
				}

				const targetSize = control.pixelSize.height

				const maxAttempts = 3
				for (let attempts = 1; attempts <= maxAttempts; attempts++) {
					try {
						if (signal.aborted) return

						await this.#deck.fillLcdRegion(control.id, drawX, 0, drawProps.image, {
							format: 'rgb',
							width: targetSize,
							height: targetSize,
						})
						return
					} catch (e) {
						if (attempts == maxAttempts) {
							this.#logger.error(`fillImage of ${drawProps.controlId} failed after ${attempts}: ${e}`)
							return
						}
						await setTimeout(20, { signal })
					}
				}
			}
		} else if (control.type === 'encoder' && control.hasLed) {
			const color = parseColor(drawProps.color)

			if (signal.aborted) return

			await this.#deck.setEncoderColor(control.index, color.r, color.g, color.b)
		}
	}
	async showStatus(signal: AbortSignal, cardGenerator: CardGenerator): Promise<void> {
		const fillPanelDimensions = this.#deck.calculateFillPanelDimensions()
		const lcdSegments = this.#deck.CONTROLS.filter(
			(c): c is StreamDeckLcdSegmentControlDefinition => c.type === 'lcd-segment',
		)

		const ps: Promise<void>[] = []

		if (fillPanelDimensions) {
			const fillCard =
				lcdSegments.length > 0
					? cardGenerator.generateLogoCard(fillPanelDimensions.width, fillPanelDimensions.height, 'rgba')
					: cardGenerator.generateBasicCard(fillPanelDimensions.width, fillPanelDimensions.height, 'rgba')

			ps.push(
				fillCard
					.then(async (buffer) => {
						if (signal.aborted) return

						// still valid
						await this.#deck.fillPanelBuffer(buffer, {
							format: 'rgba',
						})
					})
					.catch((e) => {
						this.#logger.error(`Failed to fill device: ${e}`)
					}),
			)

			for (const lcdStrip of lcdSegments) {
				const stripCard = cardGenerator.generateLcdStripCard(
					lcdStrip.pixelSize.width,
					lcdStrip.pixelSize.height,
					'rgba',
				)
				stripCard.catch(() => null) // Ensure error doesn't go uncaught

				ps.push(
					stripCard
						.then(async (buffer) => {
							if (signal.aborted) return

							// Mark the screen as dirty, so the gaps get cleared when the first region draw happens
							this.#fullLcdDirty = true

							// still valid
							await this.#deck.fillLcd(lcdStrip.id, buffer, {
								format: 'rgba',
							})
						})
						.catch((e) => {
							this.#logger.error(`Failed to fill device: ${e}`)
						}),
				)
			}
		}

		await Promise.all(ps)
	}

	async checkForFirmwareUpdates(versionsCache: SurfaceFirmwareUpdateCache): Promise<SurfaceFirmwareUpdateInfo | null> {
		return checkForFirmwareUpdatesForSurface(versionsCache, this.#surfaceId, this.#deck)
	}
}
