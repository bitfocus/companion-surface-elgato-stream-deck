import { createModuleLogger, SurfaceFirmwareUpdateCache, type SurfaceFirmwareUpdateInfo } from '@companion-surface/base'
import { DeviceModelId, StreamDeck } from '@elgato-stream-deck/node'
import { SemVer } from 'semver'

const logger = createModuleLogger('FirmwareUpdateCheck')

interface FirmwareVersionInfo {
	productIds: number[]
	versions: Record<string, string>
}

/**
 * The latest firmware versions for the SDS at the time this was last updated
 */
const LATEST_FIRMWARE_VERSIONS: FirmwareVersionInfo[] = [
	{
		// Studio
		productIds: [0x00aa],
		versions: {
			AP2: '1.05.012',
			ENCODER_AP2: '1.01.012',
			ENCODER_LD: '1.01.006',
		},
	},
]

const STREAMDECK_MODULES_SUPPORTING_UPDATES: ReadonlySet<DeviceModelId> = new Set([DeviceModelId.STUDIO])
const STREAMDECK_UPDATE_DOWNLOAD_URL = 'https://api.bitfocus.io/v1/product/elgato-updater/download'
const STREAMDECK_UPDATE_VERSIONS_URL = 'https://api.bitfocus.io/v1/product/elgato-updater/versions'

export async function checkForFirmwareUpdatesForSurface(
	versionsCache: SurfaceFirmwareUpdateCache,
	surfaceId: string,
	streamDeck: StreamDeck,
): Promise<SurfaceFirmwareUpdateInfo | null> {
	// Check if update checks are supported for this model
	if (!STREAMDECK_MODULES_SUPPORTING_UPDATES.has(streamDeck.MODEL)) return null

	let latestVersions: FirmwareVersionInfo[] | undefined = (await versionsCache.fetchJson(
		STREAMDECK_UPDATE_VERSIONS_URL,
	)) as FirmwareVersionInfo[]
	// If no versions are provided, use the latest known versions for the SDS
	if (!latestVersions) latestVersions = LATEST_FIRMWARE_VERSIONS

	// This should probably be cached, but it is cheap to check
	const deviceInfo = await streamDeck.getHidDeviceInfo()
	const latestVersionsForDevice = latestVersions.find((info) => info.productIds.includes(deviceInfo.productId))

	// If no versions are provided, we can't know that there are updates
	if (!latestVersionsForDevice) return null

	let hasUpdate = false

	const currentVersions = await streamDeck.getAllFirmwareVersions()

	for (const [key, targetVersion] of Object.entries(latestVersionsForDevice.versions)) {
		const currentVersion = parseVersion(currentVersions[key])
		const latestVersion = parseVersion(targetVersion)

		if (currentVersion && latestVersion && latestVersion.compare(currentVersion) > 0) {
			logger.info(`Firmware update available for ${surfaceId} ${key}: ${currentVersion} -> ${latestVersion}`)
			hasUpdate = true
			break
		}
	}

	if (!hasUpdate) return null

	return {
		updateUrl: STREAMDECK_UPDATE_DOWNLOAD_URL,
	}
}

function parseVersion(rawVersion: string): SemVer | null {
	// These versions are not semver, but can hopefully be safely cooerced into it

	const parts = rawVersion.split('.')
	if (parts.length !== 3) return null

	return new SemVer(`${parseInt(parts[0])}.${parseInt(parts[1])}.${parseInt(parts[2])}`)
}
