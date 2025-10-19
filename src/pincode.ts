import { assertNever, SurfacePincodeMap } from '@companion-surface/base'
import { DeviceModelId } from '@elgato-stream-deck/node'
import { getControlIdFromXy } from './util.js'

export function generatePincodeMap(model: DeviceModelId): SurfacePincodeMap | null {
	switch (model) {
		case DeviceModelId.MINI:
		case DeviceModelId.MODULE6:
			return {
				type: 'multiple-page',
				pincode: getControlIdFromXy(0, 0),
				nextPage: getControlIdFromXy(0, 1),
				pages: [
					{
						1: getControlIdFromXy(1, 1),
						2: getControlIdFromXy(2, 1),
						3: getControlIdFromXy(1, 0),
						4: getControlIdFromXy(2, 0),
					},
					{
						5: getControlIdFromXy(1, 1),
						6: getControlIdFromXy(2, 1),
						7: getControlIdFromXy(1, 0),
						8: getControlIdFromXy(2, 0),
					},
					{
						9: getControlIdFromXy(1, 1),
						0: getControlIdFromXy(2, 1),
						// 7: getControlIdFromXy(1, 0),
						// 8: getControlIdFromXy(2, 0),
					},
				],
			}
		case DeviceModelId.ORIGINAL:
		case DeviceModelId.ORIGINALV2:
		case DeviceModelId.ORIGINALMK2:
		case DeviceModelId.ORIGINALMK2SCISSOR:
		case DeviceModelId.MODULE15:
			return {
				type: 'single-page',
				pincode: getControlIdFromXy(0, 1),
				0: getControlIdFromXy(4, 1),
				1: getControlIdFromXy(1, 2),
				2: getControlIdFromXy(2, 2),
				3: getControlIdFromXy(3, 2),
				4: getControlIdFromXy(1, 1),
				5: getControlIdFromXy(2, 1),
				6: getControlIdFromXy(3, 1),
				7: getControlIdFromXy(1, 0),
				8: getControlIdFromXy(2, 0),
				9: getControlIdFromXy(3, 0),
			}
		case DeviceModelId.PEDAL:
		case DeviceModelId.NETWORK_DOCK:
			// Not suitable for a pincode
			return { type: 'custom' }
		case DeviceModelId.NEO:
			return {
				type: 'single-page',
				pincode: getControlIdFromXy(1, 2),
				0: getControlIdFromXy(3, 2),
				1: getControlIdFromXy(0, 0),
				2: getControlIdFromXy(1, 0),
				3: getControlIdFromXy(2, 0),
				4: getControlIdFromXy(3, 0),
				5: getControlIdFromXy(0, 1),
				6: getControlIdFromXy(1, 1),
				7: getControlIdFromXy(2, 1),
				8: getControlIdFromXy(3, 1),
				9: getControlIdFromXy(0, 2),
			}
		case DeviceModelId.PLUS:
			return {
				type: 'single-page',
				pincode: getControlIdFromXy(0, 2),
				0: getControlIdFromXy(3, 2),
				1: getControlIdFromXy(0, 0),
				2: getControlIdFromXy(1, 0),
				3: getControlIdFromXy(2, 0),
				4: getControlIdFromXy(3, 0),
				5: getControlIdFromXy(0, 1),
				6: getControlIdFromXy(1, 1),
				7: getControlIdFromXy(2, 1),
				8: getControlIdFromXy(3, 1),
				9: getControlIdFromXy(2, 2),
			}
		case DeviceModelId.STUDIO:
			return {
				type: 'single-page',
				pincode: getControlIdFromXy(1, 0),
				0: getControlIdFromXy(2, 1),
				1: getControlIdFromXy(3, 1),
				2: getControlIdFromXy(4, 1),
				3: getControlIdFromXy(5, 1),
				4: getControlIdFromXy(6, 1),
				5: getControlIdFromXy(2, 0),
				6: getControlIdFromXy(3, 0),
				7: getControlIdFromXy(4, 0),
				8: getControlIdFromXy(5, 0),
				9: getControlIdFromXy(6, 0),
			}
		case DeviceModelId.XL:
		case DeviceModelId.MODULE32:
			return {
				type: 'single-page',
				pincode: getControlIdFromXy(2, 1),
				0: getControlIdFromXy(4, 3),
				1: getControlIdFromXy(3, 2),
				2: getControlIdFromXy(4, 2),
				3: getControlIdFromXy(5, 2),
				4: getControlIdFromXy(3, 1),
				5: getControlIdFromXy(4, 1),
				6: getControlIdFromXy(5, 1),
				7: getControlIdFromXy(3, 0),
				8: getControlIdFromXy(4, 0),
				9: getControlIdFromXy(5, 0),
			}
		default:
			assertNever(model)
			return null
	}
}
