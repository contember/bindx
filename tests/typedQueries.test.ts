import { describe, test, expect } from 'bun:test'
import { createFragment, buildQueryFromSelection, __internal } from '@contember/bindx-react'
import type { EntityWhere, EntityOrderBy } from '@contember/bindx-react'

const { createSelectionBuilder, getSelectionMeta } = __internal

// ============================================================================
// Test Entity Types
// ============================================================================

interface Author {
	id: string
	name: string
	email: string
	age: number
	active: boolean
}

interface Tag {
	id: string
	name: string
	color: string
	priority: number
}

interface Article {
	id: string
	title: string
	content: string
	publishedAt: Date
	author: Author
	tags: Tag[]
}

// ============================================================================
// Tests
// ============================================================================

describe('Typed Query Parameters', () => {
	describe('EntityWhere types', () => {
		test('scalar string condition', () => {
			// Type-level test: should accept string conditions
			const where: EntityWhere<Tag> = {
				name: { eq: 'test' },
			}
			expect(where.name?.eq).toBe('test')
		})

		test('string condition with contains', () => {
			const where: EntityWhere<Tag> = {
				name: { contains: 'foo' },
			}
			expect(where.name?.contains).toBe('foo')
		})

		test('scalar number condition', () => {
			const where: EntityWhere<Tag> = {
				priority: { gt: 5, lt: 10 },
			}
			expect(where.priority?.gt).toBe(5)
			expect(where.priority?.lt).toBe(10)
		})

		test('scalar boolean condition', () => {
			const where: EntityWhere<Author> = {
				active: { eq: true },
			}
			expect(where.active?.eq).toBe(true)
		})

		test('composed AND condition', () => {
			const where: EntityWhere<Tag> = {
				and: [
					{ name: { contains: 'tag' } },
					{ priority: { gte: 1 } },
				],
			}
			expect(where.and?.length).toBe(2)
		})

		test('composed OR condition', () => {
			const where: EntityWhere<Tag> = {
				or: [
					{ color: { eq: 'red' } },
					{ color: { eq: 'blue' } },
				],
			}
			expect(where.or?.length).toBe(2)
		})

		test('NOT condition', () => {
			const where: EntityWhere<Tag> = {
				not: { name: { eq: 'hidden' } },
			}
			expect(where.not?.name?.eq).toBe('hidden')
		})

		test('relation filter (has-one)', () => {
			const where: EntityWhere<Article> = {
				author: { name: { contains: 'John' } },
			}
			expect(where.author?.name?.contains).toBe('John')
		})

		test('relation filter (has-many)', () => {
			const where: EntityWhere<Article> = {
				tags: { color: { eq: 'red' } },
			}
			expect(where.tags?.color?.eq).toBe('red')
		})

		test('isNull condition', () => {
			const where: EntityWhere<Article> = {
				publishedAt: { isNull: true },
			}
			expect(where.publishedAt?.isNull).toBe(true)
		})

		test('in/notIn condition', () => {
			const where: EntityWhere<Tag> = {
				color: { in: ['red', 'blue', 'green'] },
			}
			expect(where.color?.in).toEqual(['red', 'blue', 'green'])
		})
	})

	describe('EntityOrderBy types', () => {
		test('scalar field ordering', () => {
			const orderBy: EntityOrderBy<Tag> = {
				name: 'asc',
			}
			expect(orderBy.name).toBe('asc')
		})

		test('descending order', () => {
			const orderBy: EntityOrderBy<Tag> = {
				priority: 'desc',
			}
			expect(orderBy.priority).toBe('desc')
		})

		test('nulls first/last', () => {
			const orderBy: EntityOrderBy<Tag> = {
				name: 'ascNullsFirst',
			}
			expect(orderBy.name).toBe('ascNullsFirst')
		})

		test('nested ordering (has-one)', () => {
			const orderBy: EntityOrderBy<Article> = {
				author: { name: 'asc' },
			}
			expect(orderBy.author?.name).toBe('asc')
		})

		test('random ordering', () => {
			const orderBy: EntityOrderBy<Tag> = {
				_random: true,
			}
			expect(orderBy._random).toBe(true)
		})

		test('seeded random ordering', () => {
			const orderBy: EntityOrderBy<Tag> = {
				_randomSeeded: 42,
			}
			expect(orderBy._randomSeeded).toBe(42)
		})
	})

	describe('HasManyOptions with typed filter/orderBy', () => {
		test('should accept typed filter', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.tags(
				{
					filter: { color: { eq: 'red' } },
					orderBy: [{ name: 'asc' }],
					limit: 10,
				},
				t => t.id().name(),
			)
			const meta = getSelectionMeta(result)
			const query = buildQueryFromSelection(meta)

			// fields[0] is auto-added 'id', fields[1] is 'tags'
			expect(query.fields[1]?.filter).toEqual({ color: { eq: 'red' } })
			expect(query.fields[1]?.orderBy).toEqual([{ name: 'asc' }])
			expect(query.fields[1]?.limit).toBe(10)
		})

		test('should accept complex filter', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.tags(
				{
					filter: {
						and: [
							{ color: { in: ['red', 'blue'] } },
							{ priority: { gte: 1 } },
						],
					},
				},
				t => t.name(),
			)
			const meta = getSelectionMeta(result)
			const query = buildQueryFromSelection(meta)

			// fields[0] is auto-added 'id', fields[1] is 'tags'
			expect(query.fields[1]?.filter).toEqual({
				and: [
					{ color: { in: ['red', 'blue'] } },
					{ priority: { gte: 1 } },
				],
			})
		})

		test('should accept multiple orderBy', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.tags(
				{
					orderBy: [
						{ priority: 'desc' },
						{ name: 'asc' },
					],
				},
				t => t.name(),
			)
			const meta = getSelectionMeta(result)
			const query = buildQueryFromSelection(meta)

			// fields[0] is auto-added 'id', fields[1] is 'tags'
			expect(query.fields[1]?.orderBy).toEqual([
				{ priority: 'desc' },
				{ name: 'asc' },
			])
		})
	})

	describe('createFragment with typed options', () => {
		test('fragment with has-many filter', () => {
			const fragment = createFragment<Article>()(e =>
				e.id().title().tags(
					{ filter: { color: { contains: 'blue' } }, limit: 5 },
					t => t.id().name(),
				),
			)

			// Find the tags field by fieldName (key is auto-generated alias with params)
			const tagsField = [...fragment.__meta.fields.values()].find(f => f.fieldName === 'tags')
			expect(tagsField?.hasManyParams?.filter).toEqual({ color: { contains: 'blue' } })
			expect(tagsField?.hasManyParams?.limit).toBe(5)
		})
	})
})

// ============================================================================
// Type-level compile-time tests
// ============================================================================

// These tests verify that invalid types cause compile errors
// If the file compiles, the type system is working correctly

describe('Compile-time type safety', () => {
	test('type system catches invalid filter fields', () => {
		// These tests verify that the type system works correctly
		// The invalid property access is intentionally here to verify TS catches it
		const _badWhere: EntityWhere<Tag> = {
			// @ts-expect-error - 'invalidField' does not exist on Tag
			invalidField: { eq: 'test' },
		}
		expect(true).toBe(true)
	})

	test('type system catches invalid condition types', () => {
		const _badWhere: EntityWhere<Tag> = {
			// @ts-expect-error - Type 'number' is not assignable to type 'string'
			name: { eq: 123 },
		}
		expect(true).toBe(true)
	})

	test('type system catches invalid orderBy directions', () => {
		const _badOrder: EntityOrderBy<Tag> = {
			// @ts-expect-error - 'invalid' is not a valid OrderDirection
			name: 'invalid',
		}
		expect(true).toBe(true)
	})
})
