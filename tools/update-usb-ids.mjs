// @ts-check

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
// eslint-disable-next-line n/no-unpublished-import
import prettier from 'prettier'

const require = createRequire(import.meta.url)

const manifestPath = path.join(import.meta.dirname, '../companion/manifest.json')

const udevFilePath = require.resolve('@elgato-stream-deck/node/udev-generator-rules.json')
const udevFileContent = JSON.parse(readFileSync(udevFilePath, 'utf8'))

/** @type {import('@companion-surface/base').SurfaceModuleManifest} */
const manifest = JSON.parse(await readFileSync(manifestPath, 'utf8'))

const manifestStr = JSON.stringify({
	...manifest,
	usbIds: udevFileContent,
})

const prettierConfig = await prettier.resolveConfig(manifestPath)

const formatted = await prettier.format(manifestStr, {
	...prettierConfig,
	parser: 'json',
})

writeFileSync(manifestPath, formatted)
