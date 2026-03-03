#!/usr/bin/env bun
/**
 * Example script to generate bindx schema from Contember Model
 *
 * Usage:
 *   bun run packages/bindx-generator/scripts/generate.ts ./path/to/model.ts ./path/to/output/dir
 *
 * This script demonstrates how to use the bindx generator to create
 * TypeScript schema files from a Contember model.
 */

import { generate } from './index'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main(): Promise<void> {
	console.log('Generating bindx schema...')

	const schemaFile = process.argv[2]
	const outputPath = process.argv[3]

	if (!schemaFile || !outputPath) {
		console.error('Usage: bun run generate.ts <schema-file> <output-dir>')
		process.exit(1)
	}

	const absoluteSchemaFile = join(process.cwd(), schemaFile)
	const schema = (await import(absoluteSchemaFile)).default

	// Generate schema files
	const files = generate(schema.model)

	// Output directory
	const outputDir = join(process.cwd(), outputPath)

	// Create output directory
	await mkdir(outputDir, { recursive: true })

	// Write files
	for (const [filename, content] of Object.entries(files)) {
		const filePath = join(outputDir, filename)
		await writeFile(filePath, String(content), 'utf-8')
		console.log(`Generated: ${filePath}`)
	}

	console.log(`\nSchema generation complete!`)
	console.log(`\nGenerated files in: ${outputDir}`)
	console.log('\nTo use the generated schema:')
	console.log('  import { useEntity, Entity } from "./generated"')
}

main().catch(error => {
	console.error('Error generating schema:', error)
	process.exit(1)
})
