import {
	createModuleLogger,
	SomeCompanionInputField,
	type DiscoveredSurfaceInfo,
	type HIDDevice,
	type OpenSurfaceResult,
	type SurfaceContext,
	type SurfacePlugin,
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

const logger = createModuleLogger('Plugin')

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

		logger.debug(`Checked HID device: ${model ? model.productName : `Unknown Model (${sdInfo.model})`}`)

		// Some models, don't have real serial numbers, so we fake them
		const useFakeSerialNumber = sdInfo.model === DeviceModelId.GALLEON_K100 && !!sdInfo.serialNumber.match(/^[0]+$/)
		const serialNumber = useFakeSerialNumber ? DeviceModelId.GALLEON_K100 : sdInfo.serialNumber
		const companyName = sdInfo.model === DeviceModelId.GALLEON_K100 ? 'Corsair' : 'Elgato'

		return {
			surfaceId: `streamdeck:${serialNumber}`,
			surfaceIdIsNotUnique: useFakeSerialNumber,
			description: model ? `${companyName} ${model.productName}` : `${companyName} Stream Deck (${sdInfo.model})`,
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

		logger.debug(`Opening ${pluginInfo.type} device: ${streamdeck.PRODUCT_NAME} (${surfaceId})`)

		// Log firmware version
		try {
			const firmware = await streamdeck.getFirmwareVersion()
			logger.info(`StreamDeck firmware version: ${firmware}`)
		} catch (e) {
			logger.warn(`Failed to get StreamDeck firmware version: ${e}`)
		}

		const configFields: SomeCompanionInputField[] = []
		if (streamdeck.MODEL === DeviceModelId.PLUS) {
			configFields.push({
				id: 'swipe_can_change_page',
				label: 'Horizontal Swipe Changes Page',
				type: 'checkbox',
				default: false,
				tooltip: 'Swiping horizontally on the Stream Deck+ LCD-strip will change pages, if enabled.',
			})
		}

		return {
			surface: new StreamDeckWrapper(surfaceId, streamdeck, context),
			registerProps: {
				brightness: streamdeck.MODEL !== DeviceModelId.PEDAL,
				surfaceLayout: createSurfaceSchema(streamdeck),
				pincodeMap: generatePincodeMap(streamdeck.MODEL),
				configFields: configFields.length > 0 ? configFields : null,
				location: pluginInfo.type === 'remote' ? pluginInfo.streamdeck.remoteAddress : null,
			},
		}
	},
}
export default StreamDeckPlugin
