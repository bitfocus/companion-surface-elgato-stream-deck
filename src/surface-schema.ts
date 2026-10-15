import { assertNever, HostCapabilities, SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { getControlId } from './util.js'
import {
	DeviceModelId,
	type Dimension,
	type StreamDeckControlDefinition,
	type StreamDeckEncoderControlDefinition,
	type StreamDeckLcdSegmentControlDefinition,
	type StreamDeckModelInfo,
} from '@elgato-stream-deck/node'

/**
 * The minimum number of led ring steps to do the full mode, rather than single colour
 */
export const MIN_LED_RING_STEPS = 6

export function createSurfaceSchema(
	capabilities: HostCapabilities,
	modelInfo: StreamDeckModelInfo,
): SurfaceSchemaLayoutDefinition {
	const surfaceLayout: SurfaceSchemaLayoutDefinition = {
		stylePresets: {
			default: {
				// Ignore default, as it is hard to translate into for our existing layout
			},
			empty: {},
			rgb: { colors: 'hex' },
		},
		controls: {},
	}

	for (const control of modelInfo.controls) {
		const controlId = getControlId(control)
		switch (control.type) {
			case 'button':
				switch (control.feedbackType) {
					case 'none':
						surfaceLayout.controls[controlId] = {
							row: control.row,
							column: control.column,
							stylePreset: 'empty',
						}
						break
					case 'lcd': {
						const presetId = `btn_${control.pixelSize.width}x${control.pixelSize.height}`
						if (!surfaceLayout.stylePresets[presetId]) {
							surfaceLayout.stylePresets[presetId] = {
								bitmap: {
									w: control.pixelSize.width,
									h: control.pixelSize.height,
									format: 'rgb',
								},
							}
						}
						surfaceLayout.controls[controlId] = {
							row: control.row,
							column: control.column,
							stylePreset: presetId,
						}
						break
					}
					case 'rgb':
						surfaceLayout.controls[controlId] = {
							row: control.row,
							column: control.column,
							stylePreset: 'rgb',
						}
						break
					default:
						assertNever(control)
						break
				}
				break
			case 'encoder':
				if (control.hasLed || control.ledRingSteps) {
					const presetId = `enc_${control.ledRingSteps}x${control.hasLed}`
					if (!surfaceLayout.stylePresets[presetId]) {
						surfaceLayout.stylePresets[presetId] = {
							colors: control.hasLed || control.ledRingSteps < MIN_LED_RING_STEPS ? 'hex' : undefined,
							leds:
								control.ledRingSteps >= MIN_LED_RING_STEPS
									? {
											mode: 'full-ring',
											segments: control.ledRingSteps,
										}
									: undefined,
						}
					}

					// Full encoder
					surfaceLayout.controls[controlId] = {
						row: control.row,
						column: control.column,
						stylePreset: presetId,
					}
				} else {
					// Fallback basic
					surfaceLayout.controls[controlId] = {
						row: control.row,
						column: control.column,
						stylePreset: 'empty',
					}
				}

				break
			case 'lcd-segment': {
				const { columns, pixelSize } = getLcdCellSize(capabilities, modelInfo.id, modelInfo.controls, control)

				if (columns.length === 0) break

				const presetId = `lcd_${pixelSize.width}x${pixelSize.height}`
				if (!surfaceLayout.stylePresets[presetId]) {
					surfaceLayout.stylePresets[presetId] = {
						bitmap: {
							w: pixelSize.width,
							h: pixelSize.height,
							format: 'rgb',
						},
					}
				}

				for (const i of columns) {
					const controlId = getControlId(control, i)
					surfaceLayout.controls[controlId] = {
						row: control.row,
						column: control.column + i,
						stylePreset: presetId,
					}
				}

				break
			}
			default:
				assertNever(control)
				break
		}
	}

	return surfaceLayout
}

export function getLcdCellSize(
	capabilities: HostCapabilities,
	model: DeviceModelId,
	allControls: Readonly<StreamDeckControlDefinition[]>,
	control: StreamDeckLcdSegmentControlDefinition,
): {
	columns: number[]
	pixelSize: Dimension
} {
	if (!control.drawRegions) {
		// Control can't be split into cells, so treat as a single cell
		return {
			columns: capabilities.supportsNonSquareButtons ? [0] : [],
			pixelSize: control.pixelSize,
		}
	}

	if (model === DeviceModelId.GALLEON_K100) {
		return {
			columns: [0, 2],
			pixelSize: {
				width: control.pixelSize.width / 2,
				height: control.pixelSize.height,
			},
		}
	}

	// Split the control into cells based on the columns
	let columns = allControls.filter((c) => c.type === 'encoder').map((e) => e.column)
	if (columns.length === 0) columns = new Array(control.columnSpan).fill(0).map((_, i) => i)

	return {
		columns: columns,
		pixelSize: {
			width: capabilities.supportsNonSquareButtons
				? Math.floor(control.pixelSize.width / columns.length)
				: control.pixelSize.height, // Support non-square segments
			height: control.pixelSize.height,
		},
	}
}

/**
 * Where a cell of an lcd segment lives inside that segment, in segment pixels.
 *
 * A segment's pixels map 1:1 onto its `bounds`, so this doubles as where the cell sits on the
 * face. Returns null if the column is not one of the cells the segment is split into.
 */
export function getLcdCellRegion(
	capabilities: HostCapabilities,
	model: DeviceModelId,
	allControls: Readonly<StreamDeckControlDefinition[]>,
	control: StreamDeckLcdSegmentControlDefinition,
	drawColumn: number,
): { x: number; y: number; width: number; height: number } | null {
	const { columns, pixelSize } = getLcdCellSize(capabilities, model, allControls, control)

	const columnIndex = columns.indexOf(drawColumn)
	if (columnIndex === -1) return null

	if (!control.drawRegions) {
		// The whole segment is drawn as one
		return { x: 0, y: 0, width: pixelSize.width, height: pixelSize.height }
	}

	let x = columnIndex * pixelSize.width
	if (!capabilities.supportsNonSquareButtons) {
		if (model === DeviceModelId.PLUS) {
			// Position aligned with the buttons/encoders
			x = columnIndex * 216.666 + 25
		} else if (model === DeviceModelId.PLUS_XL) {
			const matchingEncoder = allControls.find(
				(c): c is StreamDeckEncoderControlDefinition => c.type === 'encoder' && c.column === drawColumn,
			)
			if (!matchingEncoder) return null

			// Position aligned with the buttons/encoders
			x = matchingEncoder.index * 212 + 20
		}
	}

	return { x, y: 0, width: pixelSize.width, height: pixelSize.height }
}
