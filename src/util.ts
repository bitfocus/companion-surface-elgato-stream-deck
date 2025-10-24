import type {
	JPEGEncodeOptions,
	StreamDeckControlDefinition,
	StreamDeckLcdSegmentControlDefinition,
} from '@elgato-stream-deck/node'

export const StreamDeckJpegOptions: JPEGEncodeOptions = {
	quality: 95,
	subsampling: 1, // 422
}

export function getControlId(control: StreamDeckControlDefinition, xOffset = 0): string {
	return `${control.row}/${control.column + xOffset}`
}
export function getControlIdFromXy(column: number, row: number): string {
	return `${row}/${column}`
}

export function matchOffsetByControlId(
	targetControlId: string,
	control: StreamDeckLcdSegmentControlDefinition,
): number | null {
	for (let offset = 0; offset < control.columnSpan; offset++) {
		if (getControlId(control, offset) === targetControlId) return offset
	}
	return null
}
