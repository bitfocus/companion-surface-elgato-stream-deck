import {
	DiscoveredSurfaceInfo,
	HIDDevice,
	OpenSurfaceResult,
	SurfaceContext,
	SurfacePlugin,
} from '@companion-surface/base'
import {
	DeviceModelId,
	getStreamDeckDeviceInfo,
	openStreamDeck,
	type StreamDeckDeviceInfo,
} from '@elgato-stream-deck/node'
import { DEVICE_MODELS } from '@elgato-stream-deck/core'
import { generatePincodeMap } from './pincode.js'
import { StreamDeckWrapper } from './instance.js'
import { createSurfaceSchema } from './surface-schema.js'

const StreamDeckPlugin: SurfacePlugin<StreamDeckDeviceInfo> = {
	init: async (): Promise<void> => {
		// Nothing to do
	},
	destroy: async (): Promise<void> => {
		// Nothing to do
	},

	checkSupportsHidDevice: (device: HIDDevice): DiscoveredSurfaceInfo<StreamDeckDeviceInfo> | null => {
		const sdInfo = getStreamDeckDeviceInfo(device)
		if (!sdInfo || !sdInfo.serialNumber) return null

		const model = DEVICE_MODELS.find((m) => m.id === sdInfo.model)

		return {
			surfaceId: `streamdeck:${sdInfo.serialNumber}`,
			description: model ? `Elgato ${model.productName}` : `Elgato Stream Deck (${sdInfo.model})`,
			pluginInfo: sdInfo,
		}
	},

	openSurface: async (
		surfaceId: string,
		pluginInfo: StreamDeckDeviceInfo,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const streamdeck = await openStreamDeck(pluginInfo.path, {
			jpegOptions: {
				quality: 95,
				subsampling: 1, // 422
			},
		})

		return {
			surface: new StreamDeckWrapper(surfaceId, streamdeck, context),
			registerProps: {
				brightness: streamdeck.MODEL !== DeviceModelId.PEDAL,
				surfaceLayout: createSurfaceSchema(streamdeck),
				pincodeMap: generatePincodeMap(streamdeck.MODEL),
			},
		}
	},
}
export default StreamDeckPlugin
