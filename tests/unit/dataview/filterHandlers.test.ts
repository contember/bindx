import '../../setup'
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
	createTextFilterHandler,
	createFullTextFilterHandler,
	createNumberFilterHandler,
	createNumberRangeFilterHandler,
	createDateFilterHandler,
	createBooleanFilterHandler,
	createEnumFilterHandler,
	createRelationFilterHandler,
	createIsDefinedFilterHandler,
} from '@contember/bindx'

describe('filter handlers', () => {
	describe('text filter', () => {
		const handler = createTextFilterHandler('title')

		test('default artifact is inactive', () => {
			const artifact = handler.defaultArtifact()
			expect(handler.isActive(artifact)).toBe(false)
			expect(handler.toWhere(artifact)).toBeUndefined()
		})

		test('contains query produces containsCI', () => {
			const where = handler.toWhere({ mode: 'contains', query: 'hello' })
			expect(where).toEqual({ title: { containsCI: 'hello' } })
		})

		test('startsWith query', () => {
			const where = handler.toWhere({ mode: 'startsWith', query: 'he' })
			expect(where).toEqual({ title: { startsWithCI: 'he' } })
		})

		test('endsWith query', () => {
			const where = handler.toWhere({ mode: 'endsWith', query: 'lo' })
			expect(where).toEqual({ title: { endsWithCI: 'lo' } })
		})

		test('equals query', () => {
			const where = handler.toWhere({ mode: 'equals', query: 'Hello' })
			expect(where).toEqual({ title: { eq: 'Hello' } })
		})

		test('notContains query', () => {
			const where = handler.toWhere({ mode: 'notContains', query: 'bad' })
			expect(where).toEqual({ title: { not: { containsCI: 'bad' } } })
		})

		test('empty query is inactive', () => {
			expect(handler.isActive({ mode: 'contains', query: '' })).toBe(false)
		})

		test('with null condition', () => {
			const where = handler.toWhere({ mode: 'contains', query: 'hello', nullCondition: true })
			expect(where).toEqual({
				and: [
					{ title: { containsCI: 'hello' } },
					{ title: { isNull: true } },
				],
			})
		})
	})

	describe('full text filter', () => {
		const handler = createFullTextFilterHandler(['title', 'content'])

		test('searches across multiple fields with OR', () => {
			const where = handler.toWhere({ mode: 'contains', query: 'hello' })
			expect(where).toEqual({
				or: [
					{ title: { containsCI: 'hello' } },
					{ content: { containsCI: 'hello' } },
				],
			})
		})

		test('empty query is inactive', () => {
			expect(handler.isActive({ mode: 'contains', query: '' })).toBe(false)
		})
	})

	describe('number filter', () => {
		const handler = createNumberFilterHandler('views')

		test('default artifact is inactive', () => {
			const artifact = handler.defaultArtifact()
			expect(handler.isActive(artifact)).toBe(false)
		})

		test('eq filter', () => {
			const where = handler.toWhere({ mode: 'eq', value: 100 })
			expect(where).toEqual({ views: { eq: 100 } })
		})

		test('gte filter', () => {
			const where = handler.toWhere({ mode: 'gte', value: 50 })
			expect(where).toEqual({ views: { gte: 50 } })
		})

		test('null value is inactive', () => {
			expect(handler.isActive({ mode: 'eq', value: null })).toBe(false)
		})
	})

	describe('number range filter', () => {
		const handler = createNumberRangeFilterHandler('views')

		test('min only', () => {
			const where = handler.toWhere({ min: 10, max: null })
			expect(where).toEqual({ views: { gte: 10 } })
		})

		test('max only', () => {
			const where = handler.toWhere({ min: null, max: 100 })
			expect(where).toEqual({ views: { lte: 100 } })
		})

		test('both min and max', () => {
			const where = handler.toWhere({ min: 10, max: 100 })
			expect(where).toEqual({
				and: [
					{ views: { gte: 10 } },
					{ views: { lte: 100 } },
				],
			})
		})
	})

	describe('date filter', () => {
		const handler = createDateFilterHandler('publishedAt')
		const originalTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

		beforeAll(() => {
			// Prague used local mean time (+0:57:44) before 1891
			process.env.TZ = 'Europe/Prague'
		})

		afterAll(() => {
			process.env.TZ = originalTimeZone
		})

		test('start only', () => {
			const where = handler.toWhere({ start: '2024-01-15', end: null })
			expect(where).toEqual({ publishedAt: { gte: '2024-01-15T00:00:00+01:00' } })
		})

		test('both start and end', () => {
			const where = handler.toWhere({ start: '2024-01-15', end: '2024-12-31' })
			// End date is inclusive: lt the local midnight of the following day
			expect(where).toEqual({
				and: [
					{ publishedAt: { gte: '2024-01-15T00:00:00+01:00' } },
					{ publishedAt: { lt: '2025-01-01T00:00:00+01:00' } },
				],
			})
		})

		test('ignores partial years a date input reports while typing', () => {
			for (const start of ['0002-10-30', '0020-10-30', '0202-10-30']) {
				expect(handler.toWhere({ start, end: null })).toBeUndefined()
			}
			expect(handler.toWhere({ start: '0202-10-30', end: '2024-10-30' })).toEqual({
				publishedAt: { lt: '2024-10-31T00:00:00+01:00' },
			})
		})

		test('formats a sub-minute historical offset in whole seconds', () => {
			const where = handler.toWhere({ start: '1890-06-15', end: '1890-06-15' })
			expect(where).toEqual({
				and: [
					{ publishedAt: { gte: '1890-06-15T00:00:00+00:57:44' } },
					{ publishedAt: { lt: '1890-06-16T00:00:00+00:57:44' } },
				],
			})
		})
	})

	describe('boolean filter', () => {
		const handler = createBooleanFilterHandler('published')

		test('default artifact is inactive', () => {
			const artifact = handler.defaultArtifact()
			expect(handler.isActive(artifact)).toBe(false)
			expect(handler.toWhere(artifact)).toBeUndefined()
		})

		test('includeTrue filter', () => {
			const where = handler.toWhere({ includeTrue: true })
			expect(where).toEqual({ published: { eq: true } })
		})

		test('includeFalse filter', () => {
			const where = handler.toWhere({ includeFalse: true })
			expect(where).toEqual({ published: { eq: false } })
		})

		test('both includeTrue and includeFalse matches all (no filter)', () => {
			const where = handler.toWhere({ includeTrue: true, includeFalse: true })
			expect(where).toBeUndefined()
		})

		test('empty artifact is inactive', () => {
			expect(handler.isActive({})).toBe(false)
		})

		test('includeTrue with nullCondition', () => {
			const where = handler.toWhere({ includeTrue: true, nullCondition: true })
			expect(where).toEqual({
				and: [
					{ published: { eq: true } },
					{ published: { isNull: true } },
				],
			})
		})
	})

	describe('enum filter', () => {
		const handler = createEnumFilterHandler('status')

		test('default artifact is inactive', () => {
			const artifact = handler.defaultArtifact()
			expect(handler.isActive(artifact)).toBe(false)
			expect(handler.toWhere(artifact)).toBeUndefined()
		})

		test('include single value', () => {
			const where = handler.toWhere({ values: ['draft'] })
			expect(where).toEqual({ status: { in: ['draft'] } })
		})

		test('include multiple values', () => {
			const where = handler.toWhere({ values: ['draft', 'published'] })
			expect(where).toEqual({ status: { in: ['draft', 'published'] } })
		})

		test('exclude values', () => {
			const where = handler.toWhere({ notValues: ['archived'] })
			expect(where).toEqual({ status: { notIn: ['archived'] } })
		})

		test('both values and notValues', () => {
			const where = handler.toWhere({ values: ['draft'], notValues: ['archived'] })
			expect(where).toEqual({
				and: [
					{ status: { in: ['draft'] } },
					{ status: { notIn: ['archived'] } },
				],
			})
		})

		test('empty values is inactive', () => {
			expect(handler.isActive({})).toBe(false)
		})
	})

	describe('relation filter', () => {
		const handler = createRelationFilterHandler('author')

		test('default artifact is inactive', () => {
			const artifact = handler.defaultArtifact()
			expect(handler.isActive(artifact)).toBe(false)
			expect(handler.toWhere(artifact)).toBeUndefined()
		})

		test('include single id', () => {
			const where = handler.toWhere({ id: ['author-1'] })
			expect(where).toEqual({ author: { id: { eq: 'author-1' } } })
		})

		test('include multiple ids', () => {
			const where = handler.toWhere({ id: ['author-1', 'author-2'] })
			expect(where).toEqual({ author: { id: { in: ['author-1', 'author-2'] } } })
		})

		test('exclude single id', () => {
			const where = handler.toWhere({ notId: ['author-1'] })
			expect(where).toEqual({ not: { author: { id: { eq: 'author-1' } } } })
		})

		test('exclude multiple ids', () => {
			const where = handler.toWhere({ notId: ['author-1', 'author-2'] })
			expect(where).toEqual({ not: { author: { id: { in: ['author-1', 'author-2'] } } } })
		})

		test('both id and notId', () => {
			const where = handler.toWhere({ id: ['author-1'], notId: ['author-2'] })
			expect(where).toEqual({
				and: [
					{ author: { id: { eq: 'author-1' } } },
					{ not: { author: { id: { eq: 'author-2' } } } },
				],
			})
		})

		test('null condition', () => {
			const where = handler.toWhere({ nullCondition: true })
			expect(where).toEqual({ author: { id: { isNull: true } } })
		})
	})

	describe('isDefined filter', () => {
		const handler = createIsDefinedFilterHandler('publishedAt')

		test('nullCondition = false (is-defined) → isNull: false', () => {
			const where = handler.toWhere({ nullCondition: false })
			expect(where).toEqual({ publishedAt: { isNull: false } })
		})

		test('nullCondition = true (not-defined) → isNull: true', () => {
			const where = handler.toWhere({ nullCondition: true })
			expect(where).toEqual({ publishedAt: { isNull: true } })
		})

		test('nullCondition undefined is inactive', () => {
			expect(handler.isActive({})).toBe(false)
			expect(handler.toWhere({})).toBeUndefined()
		})
	})

	describe('nested field path', () => {
		test('text filter on nested path', () => {
			const handler = createTextFilterHandler('author.name')
			const where = handler.toWhere({ mode: 'contains', query: 'John' })
			expect(where).toEqual({ author: { name: { containsCI: 'John' } } })
		})

		test('isDefined filter on nested path', () => {
			const handler = createIsDefinedFilterHandler('author.email')
			const where = handler.toWhere({ nullCondition: false })
			expect(where).toEqual({ author: { email: { isNull: false } } })
		})
	})
})
