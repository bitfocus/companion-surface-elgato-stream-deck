import { assertNever, HostCapabilities, SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { getControlId } from './util.js'
import {
	DeviceModelId,
	type Dimension,
	type StreamDeckControlDefinition,
	type StreamDeckLcdSegmentControlDefinition,
	type StreamDeck,
} from '@elgato-stream-deck/node'

export function createSurfaceSchema(capabilities: HostCapabilities, deck: StreamDeck): SurfaceSchemaLayoutDefinition {
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

	for (const control of deck.CONTROLS) {
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
				// Note: treat the galleon k100 led ring as a single color for now
				if (control.hasLed || control.ledRingSteps > 0) {
					surfaceLayout.controls[controlId] = {
						row: control.row,
						column: control.column,
						stylePreset: 'rgb',
					}
				} else {
					surfaceLayout.controls[controlId] = {
						row: control.row,
						column: control.column,
						stylePreset: 'empty',
					}
				}
				// Future: proper LED ring
				break
			case 'lcd-segment': {
				const { columns, pixelSize } = getLcdCellSize(capabilities, deck.MODEL, deck.CONTROLS, control)

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
