import {
	createModuleLogger,
	SurfaceModelDefinition,
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
// eslint-disable-next-line n/no-extraneous-import
import { DEVICE_MODEL_INFO } from '@elgato-stream-deck/core'
import { generatePincodeMap } from './pincode.js'
import { StreamDeckWrapper } from './instance.js'
import { createSurfaceSchema } from './surface-schema.js'
import { createSurfaceAppearance } from './surface-appearance.js'
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
	/** Whether the connection has dropped since the serial number was read. The `disconnected` event may have fired before the surface was opened */
	isDisconnected: () => boolean
}

const remoteService = new StreamDeckPluginRemoteService()

const logger = createModuleLogger('Plugin')

/**
 * Which declared model a model is: itself, or the one it is identical to and so is declared in place of it. Null for
 * a model with no controls to lay out, which is not declared at all.
 */
function declaredModelFor(id: DeviceModelId): DeviceModelId | null {
	switch (id) {
		case DeviceModelId.ORIGINALV2:
		case DeviceModelId.ORIGINALMK2:
		case DeviceModelId.ORIGINALMK2SCISSOR:
		case DeviceModelId.MODULE15:
		case DeviceModelId.MODULE15SCISSOR:
			return DeviceModelId.ORIGINAL
		case DeviceModelId.MODULE6:
			return DeviceModelId.MINI
		case DeviceModelId.MODULE32:
			return DeviceModelId.XL
		case DeviceModelId.NETWORK_DOCK:
			return null
		default:
			return id
	}
}

const StreamDeckPlugin: SurfacePlugin<SomeStreamDeckDeviceInfo> = {
	remote: remoteService,

	init: async (): Promise<void> => {
		await remoteService.init()
	},
	destroy: async (): Promise<void> => {
		await remoteService.destroy()
	},

	getSurfaceModels: async (ctx): Promise<SurfaceModelDefinition[]> => {
		const models: SurfaceModelDefinition[] = []

		for (const model of Object.values(DEVICE_MODEL_INFO)) {
			if (!model) continue

			// Skip the models that are identical to another, so are just noise
			if (declaredModelFor(model.id) !== model.id) continue

			// Mangle names of some models for clarity
			const name = model.id === DeviceModelId.ORIGINAL ? 'Stream Deck (15 key)' : model.name

			models.push({
				id: model.id,
				// With the manufacturer, as a connected surface describes itself
				name: `${model.manufacturer} ${name}`,
				// Add any other properties as needed
				layout: createSurfaceSchema(ctx.capabilities, model),
				appearance: createSurfaceAppearance(ctx.capabilities, model),
			})
		}

		return models
	},

	checkSupportsHidDevice: (device: HIDDevice): DiscoveredSurfaceInfo<SomeStreamDeckDeviceInfo> | null => {
		const sdInfo = getStreamDeckDeviceInfo(device)
		if (!sdInfo || !sdInfo.serialNumber) return null

		logger.debug(`Checked HID device: ${sdInfo.modelInfo.name}`)

		// Some models, don't have real serial numbers, so we fake them
		const useFakeSerialNumber =
			sdInfo.modelInfo.id === DeviceModelId.GALLEON_K100 && !!sdInfo.serialNumber.match(/^[0]+$/)
		const serialNumber = useFakeSerialNumber ? DeviceModelId.GALLEON_K100 : sdInfo.serialNumber

		return {
			surfaceId: `streamdeck:${serialNumber}`,
			surfaceIdIsNotUnique: useFakeSerialNumber,
			description: `${sdInfo.modelInfo.manufacturer} ${sdInfo.modelInfo.name}`,
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

		// The connection may have dropped while opening, in which case the disconnected event has already been missed
		if (pluginInfo.type === 'remote' && pluginInfo.isDisconnected()) {
			throw new Error(`StreamDeck disconnected while opening: ${surfaceId}`)
		}

		return {
			surface: new StreamDeckWrapper(surfaceId, streamdeck, context),
			registerProps: {
				brightness: streamdeck.modelInfo.id !== DeviceModelId.PEDAL,
				surfaceLayout: createSurfaceSchema(context.capabilities, streamdeck.modelInfo),
				surfaceAppearance: createSurfaceAppearance(context.capabilities, streamdeck.modelInfo),
				// @ts-expect-error The pinned surface base nightly predates `modelId`; drop once a newer one is pinned
				modelId: declaredModelFor(streamdeck.modelInfo.id),
				pincodeMap: generatePincodeMap(streamdeck.modelInfo.id),
				configFields: null,
				transferVariables: streamdeck.modelInfo.features.nfcReader
					? [
							{
								id: 'nfc',
								type: 'input',
								name: 'Last read NFC tag',
							},
						]
					: undefined,
				canChangePage:
					streamdeck.modelInfo.id === DeviceModelId.PLUS_XL || streamdeck.modelInfo.id === DeviceModelId.PLUS
						? { label: 'Horizontal Swipe Changes Page' }
						: undefined,
				location: pluginInfo.type === 'remote' ? pluginInfo.streamdeck.remoteAddress : null,
			},
		}
	},
}
export default StreamDeckPlugin
