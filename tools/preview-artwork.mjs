// @ts-check

/**
 * Render every model's appearance to a standalone html page, drawn roughly as Companion would: the
 * artwork, with each control outlined over it. Use it to check that artwork lines up with the
 * controls. Needs a build first.
 *
 * Usage: node tools/preview-artwork.mjs [output.html]
 */

import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line n/no-extraneous-import
import { DEVICE_MODEL_INFO } from '@elgato-stream-deck/core'
// eslint-disable-next-line n/no-unpublished-import
import { createSurfaceAppearance } from '../dist/surface-appearance.js'

const outputPath = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'streamdeck-artwork-preview.html'))

const CONTROL_COLORS = {
	button: '#4f9cff',
	encoder: '#ffb347',
	'lcd-segment': '#5fd38d',
}

/**
 * @param {import('@companion-surface/base').SurfaceControlAppearance} control
 */
function drawControl(control) {
	const color = CONTROL_COLORS[control.type ?? 'button'] ?? '#ffffff'
	const style = `fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="2"`

	if (control.shape?.type === 'circle') {
		return `<ellipse cx="${control.x + control.width / 2}" cy="${control.y + control.height / 2}" rx="${control.width / 2}" ry="${control.height / 2}" ${style}/>`
	}
	return `<rect x="${control.x}" y="${control.y}" width="${control.width}" height="${control.height}" rx="${control.shape?.cornerRadius ?? 0}" ${style}/>`
}

const sections = []
for (const model of Object.values(DEVICE_MODEL_INFO)) {
	if (model.controls.length === 0) continue

	const appearance = createSurfaceAppearance({ supportsNonSquareButtons: true }, model)
	const { width, height } = appearance.size

	const body = appearance.bodyImage
		? `<image href="${appearance.bodyImage}" width="${width}" height="${height}"/>`
		: `<rect width="${width}" height="${height}" fill="${appearance.bodyColor}"/>`

	sections.push(`
		<section>
			<h2>${model.name} <small>${model.id} &middot; ${width}&times;${height}${appearance.bodyImage ? '' : ' &middot; no artwork'}</small></h2>
			<svg viewBox="0 0 ${width} ${height}">${body}${Object.values(appearance.controls).map(drawControl).join('')}</svg>
		</section>`)
}

writeFileSync(
	outputPath,
	`<!doctype html>
<meta charset="utf-8">
<title>Stream Deck artwork preview</title>
<style>
	body { font: 14px system-ui, sans-serif; background: #8a8f98; margin: 24px; }
	main { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 24px; }
	section { background: #fff; border-radius: 8px; padding: 12px; }
	h2 { font-size: 15px; margin: 0 0 8px; }
	small { color: #666; font-weight: normal; }
	svg { width: 100%; height: auto; display: block; background: repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 20px 20px; }
</style>
<main>${sections.join('')}</main>
`,
)

console.log(`Wrote ${outputPath}`)
