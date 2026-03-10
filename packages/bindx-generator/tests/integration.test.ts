/**
 * Integration tests for the full generator
 */
import { describe, test, expect } from 'bun:test'
import { BindxGenerator, generate } from '../src/index'
import { testModel } from './shared'

describe('BindxGenerator', () => {
	test('generates files', () => {
		const generator = new BindxGenerator()
		const files = generator.generate(testModel)

		expect(files['entities.ts']).toBeDefined()
		expect(files['names.ts']).toBeDefined()
		expect(files['enums.ts']).toBeDefined()
		expect(files['types.ts']).toBeDefined()
		expect(files['index.ts']).toBeDefined()

		expect(files['index.ts']).toContain('schema')
		expect(files['schema.ts']).toContain('entityDef')
	})
})

describe('generate function', () => {
	test('generates schema files', () => {
		const files = generate(testModel)
		expect(files['entities.ts']).toContain('BindxSchema')
	})
})
