// Companion to filteringSetArtifactBatchClobber.test.tsx (issue #66).
//
// useSortingState.setOrderBy had the same stale-snapshot shape as
// FilteringState.setArtifact: the next record was spread from the render
// closure, so two appended sorts batched into one commit lost the first one.
// Covered here together with the bulk setters that make restoring a saved
// filter/sorting combination a single write.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, cleanup, act } from '@testing-library/react'
import { defineSchema, scalar, createCollectorProxy } from '@contember/bindx-react'
import {
	SelectionScope,
	SchemaRegistry,
	createTextFilterHandler,
	createEnumFilterHandler,
} from '@contember/bindx'
import type { EntityAccessor, EnumFilterArtifact, FilterArtifact, FilterHandler, TextFilterArtifact } from '@contember/bindx'
import { useFilteringState, useSortingState } from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
	status: string
}

interface TestSchema {
	Article: Article
}

const testSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				status: scalar(),
			},
		},
	},
})

const schemaRegistry = new SchemaRegistry(testSchema)

function createArticleProxy(): EntityAccessor<Article> {
	return createCollectorProxy<Article>(new SelectionScope(), 'Article', schemaRegistry)
}

const filterDefs = new Map<string, { handler: FilterHandler<FilterArtifact> }>([
	['title', { handler: createTextFilterHandler('title') }],
	['status', { handler: createEnumFilterHandler('status') }],
])

describe('useSortingState — batched writes', () => {
	test('should keep both fields when two appended sorts land in one commit', () => {
		const it = createArticleProxy()
		const { result } = renderHook(() =>
			useSortingState({ sortableFields: new Set(['title', 'status']) }),
		)

		act(() => {
			result.current.setOrderBy(it.title, 'toggleAsc', true)
			result.current.setOrderBy(it.status, 'toggleDesc', true)
		})

		expect(result.current.state.directions).toEqual({ title: 'asc', status: 'desc' })
		expect(result.current.resolvedOrderBy).toEqual([{ title: 'asc' }, { status: 'desc' }])
	})

	test('should apply both actions when the same field is toggled twice in one commit', () => {
		const it = createArticleProxy()
		const { result } = renderHook(() =>
			useSortingState({ sortableFields: new Set(['title']) }),
		)

		// null -> asc -> desc, both steps within one commit.
		act(() => {
			result.current.setOrderBy(it.title, 'next')
			result.current.setOrderBy(it.title, 'next')
		})

		expect(result.current.directionOf(it.title)).toBe('desc')
	})
})

describe('useFilteringState — batched writes', () => {
	test('should keep both artifacts when setArtifact and resetFilter land in one commit', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => {
			result.current.setArtifact('title', { mode: 'contains', query: 'alpha' } satisfies TextFilterArtifact)
			result.current.setArtifact('status', { values: ['draft'] } satisfies EnumFilterArtifact)
		})
		act(() => {
			result.current.setArtifact('title', { mode: 'contains', query: 'gamma' } satisfies TextFilterArtifact)
			result.current.resetFilter('status')
		})

		expect(result.current.getArtifact('title')).toEqual({ mode: 'contains', query: 'gamma' })
		expect(result.current.getArtifact('status')).toEqual({})
	})
})

describe('bulk state setters', () => {
	test('should replace the whole record via setDirections', () => {
		const it = createArticleProxy()
		const { result } = renderHook(() =>
			useSortingState({
				sortableFields: new Set(['title', 'status']),
				initialSorting: { title: 'asc' },
			}),
		)

		act(() => {
			result.current.setDirections({ status: 'desc' })
		})

		expect(result.current.state.directions).toEqual({ status: 'desc' })
		expect(result.current.directionOf(it.title)).toBeNull()
		expect(result.current.resolvedOrderBy).toEqual([{ status: 'desc' }])
	})

	test('should replace the whole record via setAllArtifacts', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => {
			result.current.setArtifact('title', { mode: 'contains', query: 'alpha' } satisfies TextFilterArtifact)
		})
		expect(result.current.hasActiveFilters).toBe(true)

		// A saved preset arrives as a whole record — one write, no per-filter loop.
		act(() => {
			result.current.setAllArtifacts({
				title: { mode: 'startsWith', query: 'beta' } satisfies TextFilterArtifact,
				status: { values: ['published'] } satisfies EnumFilterArtifact,
			})
		})

		expect(result.current.getArtifact('title')).toEqual({ mode: 'startsWith', query: 'beta' })
		expect(result.current.getArtifact('status')).toEqual({ values: ['published'] })
		expect(result.current.resolvedWhere).toEqual({
			and: [{ title: { startsWithCI: 'beta' } }, { status: { in: ['published'] } }],
		})
	})
})
