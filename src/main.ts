import type {
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
import { StreamDeckPluginRemoteService } from './remote.js'
import { StreamDeckJpegOptions } from './util.js'
import type { StreamDeckTcp } from '@elgato-stream-deck/tcp'

export type SomeStreamDeckDeviceInfo = LocalStreamDeckDeviceInfo | RemoteStreamDeckDeviceInfo

export interface LocalStreamDeckDeviceInfo extends StreamDeckDeviceInfo {
	type: 'local'
}
export interface RemoteStreamDeckDeviceInfo {
	type: 'remote'
	streamdeck: StreamDeckTcp
}

const remoteService = new StreamDeckPluginRemoteService()

const StreamDeckPlugin: SurfacePlugin<SomeStreamDeckDeviceInfo> = {
	remote: remoteService,

	init: async (): Promise<void> => {
		await remoteService.init()
	},
	destroy: async (): Promise<void> => {
		await remoteService.destroy()
	},

	checkSupportsHidDevice: (device: HIDDevice): DiscoveredSurfaceInfo<SomeStreamDeckDeviceInfo> | null => {
		const sdInfo = getStreamDeckDeviceInfo(device)
		if (!sdInfo || !sdInfo.serialNumber) return null

		const model = DEVICE_MODELS.find((m) => m.id === sdInfo.model)

		return {
			surfaceId: `streamdeck:${sdInfo.serialNumber}`,
			description: model ? `Elgato ${model.productName}` : `Elgato Stream Deck (${sdInfo.model})`,
			pluginInfo: { type: 'local', ...sdInfo },
		}
	},

	openSurface: async (
		surfaceId: string,
		pluginInfo: SomeStreamDeckDeviceInfo,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const streamdeck =
			pluginInfo.type === 'remote'
				? pluginInfo.streamdeck
				: await openStreamDeck(pluginInfo.path, { jpegOptions: StreamDeckJpegOptions })

		console.log('open', pluginInfo)

		return {
			surface: new StreamDeckWrapper(surfaceId, streamdeck, context),
			registerProps: {
				brightness: streamdeck.MODEL !== DeviceModelId.PEDAL,
				surfaceLayout: createSurfaceSchema(streamdeck),
				pincodeMap: generatePincodeMap(streamdeck.MODEL),
			},
			// location: null, // TODO
		}
	},
}
export default StreamDeckPlugin
