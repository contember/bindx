// Regression test for https://github.com/contember/bindx/issues/127
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, cleanup, act } from '@testing-library/react'
import { usePagingState, type StateStorage } from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

/** Serializes like the web storages do, starting with a page index stored by an earlier visit. */
function createStorageWithPageIndex(pageIndex: number): StateStorage & { readonly written: Map<string, unknown> } {
	const serialized = new Map<string, string>([['dataview:pageIndex', JSON.stringify(pageIndex)]])
	const written = new Map<string, unknown>()
	return {
		written,
		get: <T,>(key: string): T | undefined => {
			const raw = serialized.get(key)
			return raw === undefined ? undefined : JSON.parse(raw)
		},
		set: (key: string, value: unknown): void => {
			serialized.set(key, JSON.stringify(value))
			written.set(key, value)
		},
		remove: (key: string): void => {
			serialized.delete(key)
		},
	}
}

describe('usePagingState — page index beyond the last page', () => {
	test('should move back into range when the total count shrinks below the current page', () => {
		const { result } = renderHook(() => usePagingState({ initialItemsPerPage: 50 }))

		act(() => {
			result.current.setTotalCount(800)
		})
		act(() => {
			result.current.goTo(14)
		})
		// A narrower filter: the count query now reports 33 rows, i.e. one page.
		act(() => {
			result.current.setTotalCount(33)
		})

		expect(result.current.info.totalPages).toBe(1)
		expect(result.current.state.pageIndex).toBeLessThan(1)
		expect(result.current.queryOffset).toBe(0)
	})

	test('should not query past the last page when a stored page index exceeds the total', () => {
		const storage = createStorageWithPageIndex(14)
		const { result } = renderHook(() =>
			usePagingState({ initialItemsPerPage: 50, currentPageStateStorage: storage }),
		)

		act(() => {
			result.current.setTotalCount(33)
		})

		expect(result.current.info.totalPages).toBe(1)
		expect(result.current.state.pageIndex).toBeLessThan(1)
		expect(result.current.queryOffset).toBe(0)
		expect(storage.written.get('dataview:pageIndex')).toBe(0)
	})

	test('should keep a stored page index while the total is unknown', () => {
		const { result } = renderHook(() =>
			usePagingState({ initialItemsPerPage: 50, currentPageStateStorage: createStorageWithPageIndex(14) }),
		)

		expect(result.current.info.totalPages).toBeNull()
		expect(result.current.state.pageIndex).toBe(14)
		expect(result.current.queryOffset).toBe(700)
	})

	test('should move to the last existing page and navigate from there', () => {
		const { result } = renderHook(() => usePagingState({ initialItemsPerPage: 50 }))

		act(() => {
			result.current.setTotalCount(800)
		})
		act(() => {
			result.current.goTo(14)
		})
		act(() => {
			result.current.setTotalCount(120)
		})

		expect(result.current.state.pageIndex).toBe(2)
		expect(result.current.queryOffset).toBe(100)
		expect(result.current.hasNext).toBe(false)

		act(() => {
			result.current.previous()
		})

		expect(result.current.state.pageIndex).toBe(1)
	})

	test('should clamp to the first page when the total drops to zero', () => {
		const { result } = renderHook(() => usePagingState({ initialItemsPerPage: 50 }))

		act(() => {
			result.current.setTotalCount(800)
		})
		act(() => {
			result.current.goTo(14)
		})
		act(() => {
			result.current.setTotalCount(0)
		})

		expect(result.current.state.pageIndex).toBe(0)
		expect(result.current.queryOffset).toBe(0)
	})
})
