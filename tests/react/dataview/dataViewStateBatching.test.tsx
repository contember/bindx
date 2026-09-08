// Companion to filteringSetArtifactBatchClobber.test.tsx (issue #66): the same
// stale-snapshot pattern in the sorting, selection and paging state, plus the
// bulk setters for restoring a saved filter/sorting combination.
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
import {
	useFilteringState,
	usePagingState,
	useSelectionState,
	useSortingState,
	type StateStorage,
} from '@contember/bindx-dataview'

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

interface RecordedWrite {
	readonly key: string
	readonly value: unknown
}

function createRecordingStorage(writes: RecordedWrite[]): StateStorage {
	return {
		get: (): undefined => undefined,
		set: (key: string, value: unknown): void => {
			writes.push({ key, value })
		},
		remove: (): void => {},
	}
}

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

	test('should hand the storage backend the composed record, never an updater', () => {
		const writes: RecordedWrite[] = []
		const { result } = renderHook(() => useFilteringState({
			filters: filterDefs,
			stateStorage: createRecordingStorage(writes),
			storageKey: 'grid',
		}))

		act(() => {
			result.current.setArtifact('title', { mode: 'contains', query: 'alpha' } satisfies TextFilterArtifact)
			result.current.setArtifact('status', { values: ['published'] } satisfies EnumFilterArtifact)
		})

		// A persisted updater would round-trip as `undefined` through JSON storage.
		expect(writes.every(write => typeof write.value === 'object')).toBe(true)
		expect(writes.at(-1)).toEqual({
			key: 'grid:filters',
			value: {
				title: { mode: 'contains', query: 'alpha' },
				status: { values: ['published'] },
			},
		})
	})
})

describe('useSelectionState — batched writes', () => {
	test('should keep every column when visibility is toggled for several columns in one commit', () => {
		const { result } = renderHook(() => useSelectionState())

		// What a "hide all columns" control does: one call per column, one commit.
		act(() => {
			result.current.setVisibility('title', false)
			result.current.setVisibility('status', false)
		})

		expect(result.current.state.values.visibility).toEqual({ title: false, status: false })
		expect(result.current.isVisible('title')).toBe(false)
		expect(result.current.isVisible('status')).toBe(false)
	})

	test('should keep a visibility write when setLayout lands in the same commit', () => {
		const { result } = renderHook(() => useSelectionState())

		act(() => {
			result.current.setVisibility('title', false)
			result.current.setLayout('grid')
		})

		expect(result.current.currentLayout).toBe('grid')
		expect(result.current.isVisible('title')).toBe(false)
	})

	test('should persist the composed visibility record to the storage backend', () => {
		const writes: RecordedWrite[] = []
		const { result } = renderHook(() => useSelectionState({
			stateStorage: createRecordingStorage(writes),
			storageKey: 'grid',
		}))

		act(() => {
			result.current.setVisibility('title', false)
			result.current.setVisibility('status', false)
		})

		expect(writes.at(-1)).toEqual({
			key: 'grid:selection',
			value: { visibility: { title: false, status: false } },
		})
	})
})

describe('usePagingState — batched writes', () => {
	test('should advance two pages when next is called twice in one commit', () => {
		const { result } = renderHook(() => usePagingState())

		act(() => {
			result.current.next()
			result.current.next()
		})

		expect(result.current.state.pageIndex).toBe(2)
	})

	test('should go back two pages when previous is called twice in one commit', () => {
		const { result } = renderHook(() => usePagingState())

		act(() => {
			result.current.goTo(3)
		})
		act(() => {
			result.current.previous()
			result.current.previous()
		})

		expect(result.current.state.pageIndex).toBe(1)
	})

	test('should not go below the first page', () => {
		const { result } = renderHook(() => usePagingState())

		act(() => {
			result.current.previous()
			result.current.previous()
		})

		expect(result.current.state.pageIndex).toBe(0)
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

	test('should replace — not merge — the whole record via setAllArtifacts', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => {
			result.current.setArtifact('status', { values: ['draft'] } satisfies EnumFilterArtifact)
		})
		expect(result.current.hasActiveFilters).toBe(true)

		// A saved preset arrives as a whole record; a filter it omits must end up unset.
		act(() => {
			result.current.setAllArtifacts({
				title: { mode: 'startsWith', query: 'beta' } satisfies TextFilterArtifact,
			})
		})

		expect(result.current.getArtifact('title')).toEqual({ mode: 'startsWith', query: 'beta' })
		expect(result.current.getArtifact('status')).toBeUndefined()
		expect(result.current.resolvedWhere).toEqual({ title: { startsWithCI: 'beta' } })
	})
})
