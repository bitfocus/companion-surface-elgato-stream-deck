import { assertNever, SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { getControlId } from './util.js'
import type { StreamDeck } from '@elgato-stream-deck/node'

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
				if (control.hasLed) {
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
				// Future: LED ring
				break
			case 'lcd-segment': {
				// const width = control.pixelSize.width / control.columnSpan
				const presetId = `lcd_${control.pixelSize.height}x${control.pixelSize.height}`
				if (!surfaceLayout.stylePresets[presetId]) {
					surfaceLayout.stylePresets[presetId] = {
						bitmap: {
							w: control.pixelSize.height,
							h: control.pixelSize.height,
							format: 'rgb',
						},
					}
				}

				for (let i = 0; i < control.columnSpan; i++) {
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
