// @ts-check

/**
 * Compile the face artwork in `artwork/*.svg` into `src/artwork.generated.json`.
 *
 * Every svg must have a `viewBox="0 0 <width> <height>"` covering the whole device, and exactly one
 * `<rect id="face" .../>` marking where the library's `faceSize` sits within it. The marker is how
 * the padding around the controls is found, and is stripped from the output.
 *
 * The result is json so that it is copied by `tsc` and inlined by esbuild, as nothing downstream
 * shares a filesystem with the module.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MAX_BODY_IMAGE_LENGTH } from '@companion-surface/base'

/** Each face is sent to every client of every surface of it, so keep them small */
const MAX_SVG_BYTES = 10 * 1024

const artworkDir = path.join(import.meta.dirname, '../artwork')
const outputPath = path.join(import.meta.dirname, '../src/artwork.generated.json')

/**
 * @param {string} tag
 * @param {string} name
 * @returns {number | undefined}
 */
function readNumberAttribute(tag, name) {
	const match = tag.match(new RegExp(`\\s${name}="([-\\d.]+)"`))
	return match ? Number(match[1]) : undefined
}

/**
 * @param {string} file
 * @param {string} source
 */
function compileArtwork(file, source) {
	const viewBox = source.match(/<svg\b[^>]*\sviewBox="0 0 ([\d.]+) ([\d.]+)"/)
	if (!viewBox) throw new Error(`${file}: missing a viewBox of "0 0 <width> <height>" on the root <svg>`)
	const width = Number(viewBox[1])
	const height = Number(viewBox[2])

	const markers = source.match(/<rect\b[^>]*\sid="face"[^>]*\/>/g) ?? []
	if (markers.length !== 1)
		throw new Error(`${file}: expected exactly one <rect id="face" .../>, found ${markers.length}`)
	const marker = markers[0]

	const face = {
		x: readNumberAttribute(marker, 'x') ?? 0,
		y: readNumberAttribute(marker, 'y') ?? 0,
		width: readNumberAttribute(marker, 'width'),
		height: readNumberAttribute(marker, 'height'),
	}
	if (face.width === undefined || face.height === undefined)
		throw new Error(`${file}: the face marker needs a width and height`)

	const padding = {
		left: face.x,
		top: face.y,
		right: width - face.x - face.width,
		bottom: height - face.y - face.height,
	}
	if (Object.values(padding).some((v) => v < 0)) throw new Error(`${file}: the face marker reaches outside the viewBox`)

	const minified = source
		.replace(marker, '')
		.replace(/<\?xml[^>]*\?>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<metadata[\s\S]*?<\/metadata>/g, '')
		.replace(/>\s+</g, '><')
		.replace(/\s+/g, ' ')
		.trim()

	const bytes = Buffer.byteLength(minified)
	if (bytes > MAX_SVG_BYTES) throw new Error(`${file}: is ${bytes} bytes, more than the ${MAX_SVG_BYTES} allowed`)

	const bodyImage = `data:image/svg+xml;base64,${Buffer.from(minified).toString('base64')}`
	if (bodyImage.length > MAX_BODY_IMAGE_LENGTH) throw new Error(`${file}: is too large to be a body image`)

	console.log(`${file}: ${bytes} bytes, padding ${JSON.stringify(padding)}`)

	return {
		bodyImage,
		faceSize: { width: face.width, height: face.height },
		padding,
	}
}

/** @type {Record<string, ReturnType<typeof compileArtwork>>} */
const artwork = {}
for (const file of readdirSync(artworkDir).sort()) {
	if (!file.endsWith('.svg')) continue

	artwork[path.basename(file, '.svg')] = compileArtwork(file, readFileSync(path.join(artworkDir, file), 'utf8'))
}

writeFileSync(outputPath, JSON.stringify(artwork, undefined, '\t') + '\n')
