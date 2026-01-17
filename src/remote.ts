import {
	createModuleLogger,
	type DiscoveredRemoteSurfaceInfo,
	type DetectionSurfaceInfo,
	type RemoteSurfaceConnectionInfo,
	type SomeCompanionInputField,
	type SurfacePluginRemote,
	type SurfacePluginRemoteEvents,
} from '@companion-surface/base'
import {
	DEFAULT_TCP_PORT,
	StreamDeckTcpConnectionManager,
	StreamDeckTcpDiscoveryService,
} from '@elgato-stream-deck/tcp'
import EventEmitter from 'node:events'
import { StreamDeckJpegOptions } from './util.js'
import type { RemoteStreamDeckDeviceInfo } from './main.js'
import { nanoid } from 'nanoid'

export interface StreamDeckTcpConnectionConfig {
	address: string
	port: number
}

export class StreamDeckPluginRemoteService
	extends EventEmitter<SurfacePluginRemoteEvents<RemoteStreamDeckDeviceInfo>>
	implements SurfacePluginRemote<RemoteStreamDeckDeviceInfo>
{
	readonly #logger = createModuleLogger('RemoteService')

	readonly #connectionManager = new StreamDeckTcpConnectionManager({
		jpegOptions: StreamDeckJpegOptions,
		autoConnectToSecondaries: true,
	})
	// Map connectionId -> address:port key
	readonly #activeConnections = new Map<string, string>()
	// Map address:port key -> reference count
	readonly #connectionRefCounts = new Map<string, number>()

	#discoveryService: StreamDeckTcpDiscoveryService | undefined

	constructor() {
		super()

		this.#connectionManager.on('connected', (streamdeck) => {
			this.#logger.debug(`StreamDeck connection opened: ${streamdeck.PRODUCT_NAME}. Retrieving serial number...`)

			// TODO - this async feels unsafe...
			streamdeck
				.getSerialNumber()
				.then((serial) => {
					this.#logger.info(`StreamDeck connected: ${streamdeck.PRODUCT_NAME} (${serial})`)
					this.emit('surfacesConnected', [
						{
							deviceHandle: nanoid(), // Generate a unique ID for this remote device
							surfaceId: `streamdeck:${serial}`,
							description: `Elgato ${streamdeck.PRODUCT_NAME}`,
							// TODO - can/should this be possible to be disabled, or should it be forced?
							pluginInfo: {
								type: 'remote',
								streamdeck,
							},
						},
					])
				})
				.catch((e) => {
					this.#logger.error(`Failed to get serial number for connected streamdeck: ${e}`)
				})
		})
		// Disconnect events are emitted by each streamdeck instance
	}

	async init(): Promise<void> {
		this.#discoveryService = new StreamDeckTcpDiscoveryService()

		const refreshForAddress = (address: string) => {
			if (!this.#discoveryService) return
			const foundDevices = this.#discoveryService.knownStreamDecks
				.filter((d) => d.address === address)
				.sort((a, b) => a.port - b.port)

			const primary = foundDevices.find((d) => d.isPrimary)
			if (!primary) {
				// No primary device found at this address, there is nothing usable here!
				this.emit('connectionsForgotten', [address])
				return
			}

			const entry: DiscoveredRemoteSurfaceInfo = {
				id: address,
				displayName: primary.name,
				description: primary.modelName,
				config: {
					address: primary.address,
					port: primary.port,
				},
			}

			// Add any secondary ports as a suffix
			const children = foundDevices.filter((d) => !d.isPrimary)
			if (children.length > 0) entry.description += ' (' + children.map((c) => `${c.modelName}`).join(', ') + ')'

			this.emit('connectionsFound', [entry])
		}

		this.#discoveryService.on('up', (streamdeck) => refreshForAddress(streamdeck.address))
		this.#discoveryService.on('down', (streamdeck) => refreshForAddress(streamdeck.address))

		this.#discoveryService.query()
	}
	async destroy(): Promise<void> {
		// Shutdown discovery
		if (this.#discoveryService) {
			this.#discoveryService.destroy()
			this.#discoveryService = undefined
		}

		this.#connectionManager.disconnectFromAll()
	}

	readonly configFields: SomeCompanionInputField[] = [
		{
			id: 'address',
			type: 'textinput',
			label: 'IP Address',
			default: new Date().toISOString(),
		},
		{
			id: 'port',
			type: 'number',
			label: 'Port',
			default: DEFAULT_TCP_PORT,
			min: 1,
			max: 65535,
		},
	]

	readonly checkConfigMatchesExpression: string | null =
		'$(objA:address) == $(objB:address) && $(objA:port) == $(objB:port)'

	// async startStopDiscovery(enable: boolean): Promise<void> {
	// 	if (enable && !this.#discoveryService) {
	// 		this.#discoveryService = new StreamDeckTcpDiscoveryService()
	// 		this.#discoveryService.on('up', (service) => {
	// 			if (!service.isPrimary) return // Ignore secondary ports

	// 			this.emit('discoveredDevices', [discoveryServiceToHost(service)])
	// 		})
	// 		this.#discoveryService.on('down', (service) => {
	// 			if (!service.isPrimary) return // Ignore secondary ports

	// 			this.emit('lostDevices', [discoveryServiceToHost(service)])
	// 		})
	// 		this.#discoveryService.query()
	// 	} else if (!enable && this.#discoveryService) {
	// 		this.#discoveryService.destroy()
	// 		this.#discoveryService = undefined
	// 	}
	// }

	async startConnections(connectionInfos: RemoteSurfaceConnectionInfo[]): Promise<void> {
		this.#logger.info(`Starting connections: ${connectionInfos.map((c) => c.connectionId).join(', ')}`)

		const invalidIds: string[] = []

		for (const info of connectionInfos) {
			const config = info.config as Partial<StreamDeckTcpConnectionConfig>
			const newAddressKey = `${config.address}:${config.port ?? DEFAULT_TCP_PORT}`

			if (!config.address || typeof config.address !== 'string') {
				invalidIds.push(info.connectionId)
				continue
			}

			// Check if this connectionId already exists
			const oldAddressKey = this.#activeConnections.get(info.connectionId)
			if (oldAddressKey === newAddressKey) {
				// Same connectionId with same address - this is a no-op update
				continue
			}

			if (oldAddressKey !== undefined) {
				// ConnectionId exists but address changed - decrement old address ref count
				const oldRefCount = this.#connectionRefCounts.get(oldAddressKey)
				if (oldRefCount !== undefined) {
					if (oldRefCount <= 1) {
						// Last reference, disconnect
						this.#connectionRefCounts.delete(oldAddressKey)

						const lastColonIndex = oldAddressKey.lastIndexOf(':')
						const address = oldAddressKey.substring(0, lastColonIndex)
						const port = parseInt(oldAddressKey.substring(lastColonIndex + 1))

						this.#connectionManager.disconnectFrom(address, port)
					} else {
						// Still have other references, just decrement
						this.#connectionRefCounts.set(oldAddressKey, oldRefCount - 1)
					}
				}
			}

			// Track this connection with the new address
			this.#activeConnections.set(info.connectionId, newAddressKey)

			// Increment reference count for the new address
			const currentRefCount = this.#connectionRefCounts.get(newAddressKey) ?? 0
			this.#connectionRefCounts.set(newAddressKey, currentRefCount + 1)

			// Only connect if this is the first reference to this address:port
			if (currentRefCount === 0) {
				this.#connectionManager.connectTo(config.address, config.port)
			}
		}

		if (invalidIds.length > 0) await this.stopConnections(invalidIds)
	}

	async stopConnections(connectionIds: string[]): Promise<void> {
		this.#logger.info(`Stopping connections: ${connectionIds.join(', ')}`)

		for (const connectionId of connectionIds) {
			const addressKey = this.#activeConnections.get(connectionId)
			if (!addressKey) continue

			// Remove this connection
			this.#activeConnections.delete(connectionId)

			// Decrement reference count
			const currentRefCount = this.#connectionRefCounts.get(addressKey)
			if (currentRefCount === undefined) continue

			if (currentRefCount <= 1) {
				// Last reference, disconnect
				this.#connectionRefCounts.delete(addressKey)

				// Parse address and port from key
				const lastColonIndex = addressKey.lastIndexOf(':')
				const address = addressKey.substring(0, lastColonIndex)
				const port = parseInt(addressKey.substring(lastColonIndex + 1))

				this.#connectionManager.disconnectFrom(address, port)
			} else {
				// Still have other references, just decrement
				this.#connectionRefCounts.set(addressKey, currentRefCount - 1)
			}
		}
	}

	rejectSurface(_surfaceInfo: DetectionSurfaceInfo<RemoteStreamDeckDeviceInfo>): void {
		// Can't really do anything here
	}
}
