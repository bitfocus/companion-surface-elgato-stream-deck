import { assertNever, SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { getControlId } from './util.js'
import {
	DeviceModelId,
	Dimension,
	StreamDeckLcdSegmentControlDefinition,
	type StreamDeck,
} from '@elgato-stream-deck/node'

export function createSurfaceSchema(deck: StreamDeck): SurfaceSchemaLayoutDefinition {
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
				const { columns, pixelSize } = getLcdCellSize(deck.MODEL, control)

				if (columns.length === 0) break

				// const width = control.pixelSize.width / control.columnSpan
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
	model: DeviceModelId,
	control: StreamDeckLcdSegmentControlDefinition,
): {
	columns: number[]
	pixelSize: Dimension
} {
	if (model === DeviceModelId.GALLEON_K100) {
		return {
			columns: [0, 2],
			pixelSize: {
				width: control.pixelSize.width / 2,
				height: control.pixelSize.height,
			},
		}
	} else {
		return {
			columns: Array.from({ length: control.columnSpan }, (_, i) => control.column + i),
			pixelSize: {
				width: control.pixelSize.height, // Future: Support non-square segments
				height: control.pixelSize.height,
			},
		}
	}
}
