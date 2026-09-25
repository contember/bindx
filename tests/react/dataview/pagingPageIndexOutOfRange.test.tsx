// Regression test for <issue-url — filled in after the issue is filed>
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, cleanup, act } from '@testing-library/react'
import { usePagingState, type StateStorage } from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

function createStorageWithPageIndex(pageIndex: number): StateStorage {
	return {
		get: (key: string): unknown => (key.endsWith('pageIndex') ? pageIndex : undefined),
		set: (): void => {},
		remove: (): void => {},
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
		const { result } = renderHook(() =>
			usePagingState({ initialItemsPerPage: 50, currentPageStateStorage: createStorageWithPageIndex(14) }),
		)

		act(() => {
			result.current.setTotalCount(33)
		})

		expect(result.current.info.totalPages).toBe(1)
		expect(result.current.state.pageIndex).toBeLessThan(1)
		expect(result.current.queryOffset).toBe(0)
	})
})
