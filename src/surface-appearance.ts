import {
	assertNever,
	type HostCapabilities,
	type SurfaceAppearanceDefinition,
	type SurfaceControlAppearance,
} from '@companion-surface/base'
import { DeviceModelId, type StreamDeckModelInfo } from '@elgato-stream-deck/node'
import { getControlId } from './util.js'
import { getLcdCellRegion, getLcdCellSize } from './surface-schema.js'

/**
 * The colour of the plastic on a Stream Deck, for models with no artwork of their own.
 */
const STREAMDECK_BODY_COLOR = '#1c1c1c'

/**
 * Corner radius of a key, as a fraction of its shorter side.
 *
 * Stream Deck keys are square with a gentle radius; this is eyeballed rather than measured, and is
 * only used until a model has artwork.
 */
const KEY_CORNER_RADIUS_RATIO = 0.12

/**
 * Space to add around a model's `faceSize`, in face units.
 *
 * A model's `faceSize` only covers the area its controls sit in, not the bezel around them, so
 * artwork which draws the whole device needs room to breathe.
 */
export interface FacePadding {
	left: number
	top: number
	right: number
	bottom: number
}

/**
 * Per-model overrides for the generated appearance.
 *
 * Artwork, and the padding it needs, will be added here as it is drawn. Until then every model is
 * drawn as its bare controls on a plain body.
 */
interface ModelAppearanceArtwork {
	/** Colour of the plastic, for the models which are not the usual Stream Deck black. */
	bodyColor?: string
	/**
	 * Artwork for the face, as a base64 `data:` URI of an svg.
	 *
	 * Its `viewBox` must be `0 0 <width> <height>` of the *padded* face, so that the art and the
	 * control positions share one coordinate system.
	 */
	bodyImage?: string
	/** Space to leave around the controls for the artwork's bezel. */
	padding?: FacePadding
}

/**
 * The models which have artwork of their own. Everything absent here is drawn from its geometry.
 */
const MODEL_ARTWORK: Partial<Record<DeviceModelId, ModelAppearanceArtwork>> = {
	// No artwork yet
}

/**
 * Describe how to draw the face of a model, from the bounds the streamdeck library gives for each
 * of its controls.
 *
 * Keyed by the same control ids as `createSurfaceSchema`, and must cover every control that
 * produces, or the whole appearance is discarded by the host.
 */
export function createSurfaceAppearance(
	capabilities: HostCapabilities,
	modelInfo: StreamDeckModelInfo,
): SurfaceAppearanceDefinition {
	const artwork = MODEL_ARTWORK[modelInfo.id]
	const padding = artwork?.padding

	const offsetX = padding?.left ?? 0
	const offsetY = padding?.top ?? 0

	const controls: Record<string, SurfaceControlAppearance> = {}

	for (const control of modelInfo.controls) {
		switch (control.type) {
			case 'button':
				controls[getControlId(control)] = {
					...translateBounds(control.bounds, offsetX, offsetY),
					type: 'button',
					shape: {
						type: 'rect',
						cornerRadius: Math.min(control.bounds.width, control.bounds.height) * KEY_CORNER_RADIUS_RATIO,
					},
				}
				break
			case 'encoder':
				controls[getControlId(control)] = {
					...translateBounds(control.bounds, offsetX, offsetY),
					type: 'encoder',
					shape: { type: 'circle' },
				}
				break
			case 'lcd-segment': {
				// The segment is split into cells, each drawn at its own region of the panel. The panel's
				// pixels map 1:1 onto its bounds, so a region is also where that cell sits on the face.
				const { columns } = getLcdCellSize(capabilities, modelInfo.id, modelInfo.controls, control)

				for (const offset of columns) {
					const region = getLcdCellRegion(capabilities, modelInfo.id, modelInfo.controls, control, offset)
					if (!region) continue

					controls[getControlId(control, offset)] = {
						...translateBounds(
							{
								x: control.bounds.x + region.x,
								y: control.bounds.y + region.y,
								width: region.width,
								height: region.height,
							},
							offsetX,
							offsetY,
						),
						type: 'lcd-segment',
						shape: { type: 'rect' },
					}
				}
				break
			}
			default:
				assertNever(control)
				break
		}
	}

	return {
		size: {
			width: modelInfo.faceSize.width + offsetX + (padding?.right ?? 0),
			height: modelInfo.faceSize.height + offsetY + (padding?.bottom ?? 0),
		},
		bodyColor: artwork?.bodyColor ?? STREAMDECK_BODY_COLOR,
		bodyImage: artwork?.bodyImage,
		controls,
	}
}

function translateBounds(
	bounds: { x: number; y: number; width: number; height: number },
	offsetX: number,
	offsetY: number,
): Pick<SurfaceControlAppearance, 'x' | 'y' | 'width' | 'height'> {
	return {
		x: bounds.x + offsetX,
		y: bounds.y + offsetY,
		width: bounds.width,
		height: bounds.height,
	}
}
