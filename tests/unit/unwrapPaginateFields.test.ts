import '../setup'
import { describe, test, expect } from 'bun:test'
import { unwrapPaginateFields } from '@contember/bindx'
import type { QuerySpec } from '@contember/bindx'

describe('unwrapPaginateFields', () => {

	describe('has-many with isArray flag', () => {

		const spec: QuerySpec = {
			fields: [
				{ name: 'id', sourcePath: ['id'] },
				{ name: 'title', sourcePath: ['title'] },
				{
					name: 'tags',
					sourcePath: ['tags'],
					isArray: true,
					nested: {
						fields: [
							{ name: 'id', sourcePath: ['id'] },
							{ name: 'name', sourcePath: ['name'] },
						],
					},
				},
			],
		}

		test('unwraps paginate connection format', () => {
			const data = {
				id: '1',
				title: 'Article 1',
				paginateTags: {
					edges: [
						{ node: { id: 't1', name: 'TypeScript' } },
						{ node: { id: 't2', name: 'React' } },
					],
				},
			}

			const result = unwrapPaginateFields(data, spec)
			expect(result).toEqual({
				id: '1',
				title: 'Article 1',
				tags: [
					{ id: 't1', name: 'TypeScript' },
					{ id: 't2', name: 'React' },
				],
			})
		})

		test('handles plain array (no paginate wrapper)', () => {
			const data = {
				id: '1',
				title: 'Article 1',
				tags: [
					{ id: 't1', name: 'TypeScript' },
					{ id: 't2', name: 'React' },
				],
			}

			const result = unwrapPaginateFields(data, spec)
			expect(result).toEqual({
				id: '1',
				title: 'Article 1',
				tags: [
					{ id: 't1', name: 'TypeScript' },
					{ id: 't2', name: 'React' },
				],
			})
		})

		test('recurses into nested fields of plain array items', () => {
			const specWithNested: QuerySpec = {
				fields: [
					{ name: 'id', sourcePath: ['id'] },
					{
						name: 'usages',
						sourcePath: ['usages'],
						isArray: true,
						nested: {
							fields: [
								{ name: 'id', sourcePath: ['id'] },
								{ name: 'amount', sourcePath: ['amount'] },
								{
									name: 'organization',
									sourcePath: ['organization'],
									nested: {
										fields: [
											{ name: 'id', sourcePath: ['id'] },
											{ name: 'name', sourcePath: ['name'] },
										],
									},
								},
							],
						},
					},
				],
			}

			const data = {
				id: '1',
				usages: [
					{ id: 'u1', amount: 100, organization: { id: 'o1', name: 'Org A' } },
					{ id: 'u2', amount: 200, organization: { id: 'o2', name: 'Org B' } },
				],
			}

			const result = unwrapPaginateFields(data, specWithNested)
			expect(result).toEqual({
				id: '1',
				usages: [
					{ id: 'u1', amount: 100, organization: { id: 'o1', name: 'Org A' } },
					{ id: 'u2', amount: 200, organization: { id: 'o2', name: 'Org B' } },
				],
			})
		})
	})

	describe('has-many without isArray flag (selection builder omission)', () => {

		const spec: QuerySpec = {
			fields: [
				{ name: 'id', sourcePath: ['id'] },
				{
					name: 'tags',
					sourcePath: ['tags'],
					// isArray NOT set — this happens when selection builder
					// doesn't set it for has-many without filter/orderBy/limit
					nested: {
						fields: [
							{ name: 'id', sourcePath: ['id'] },
							{ name: 'name', sourcePath: ['name'] },
						],
					},
				},
			],
		}

		test('handles array data even without isArray flag', () => {
			const data = {
				id: '1',
				tags: [
					{ id: 't1', name: 'TypeScript' },
					{ id: 't2', name: 'React' },
				],
			}

			const result = unwrapPaginateFields(data, spec)
			expect(result['tags']).toBeInstanceOf(Array)
			expect(result['tags']).toEqual([
				{ id: 't1', name: 'TypeScript' },
				{ id: 't2', name: 'React' },
			])
		})

		test('does not corrupt array into object', () => {
			const data = {
				id: '1',
				tags: [
					{ id: 't1', name: 'TypeScript' },
					{ id: 't2', name: 'React' },
				],
			}

			const result = unwrapPaginateFields(data, spec)
			// Before the fix, this would produce { 0: {...}, 1: {...} } instead of an array
			expect(Array.isArray(result['tags'])).toBe(true)
			expect((result['tags'] as unknown[]).length).toBe(2)
		})

		test('still handles has-one object correctly', () => {
			const data = {
				id: '1',
				tags: { id: 't1', name: 'TypeScript' },
			}

			const result = unwrapPaginateFields(data, spec)
			expect(result['tags']).toEqual({ id: 't1', name: 'TypeScript' })
			expect(Array.isArray(result['tags'])).toBe(false)
		})

		test('handles null value', () => {
			const data = {
				id: '1',
				tags: null,
			}

			const result = unwrapPaginateFields(data, spec)
			expect(result['tags']).toBeNull()
		})
	})

	describe('preserves extra fields', () => {

		test('preserves fields not in spec (e.g. id)', () => {
			const spec: QuerySpec = {
				fields: [
					{ name: 'title', sourcePath: ['title'] },
				],
			}

			const data = {
				id: '1',
				title: 'Hello',
				__typename: 'Article',
			}

			const result = unwrapPaginateFields(data, spec)
			expect(result['id']).toBe('1')
			expect(result['title']).toBe('Hello')
			expect(result['__typename']).toBe('Article')
		})
	})
})
