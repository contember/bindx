// Regression test for https://github.com/contember/bindx/issues/125: a
// persisted filter record that predates a registered filter (it was written
// before the filter existed) leaves that filter out of `resolvedWhere`, while
// `filters` reports an artifact for it. The filter's `initialArtifact` is not
// applied either, so a filter meant to start constrained starts unconstrained.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, cleanup } from '@testing-library/react'
import { createEnumFilterHandler, createTextFilterHandler } from '@contember/bindx'
import type { EnumFilterArtifact, FilterArtifact, FilterHandler } from '@contember/bindx'
import { useFilteringState, type StateStorage } from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

/** A backend holding a record saved while the grid had only the `title` filter. */
function storageWithRecordWithoutStatus(): StateStorage {
	return {
		get: <T,>(key: string): T | undefined =>
			key === 'grid:filters' ? ({ title: { mode: 'contains', query: '' } } as T) : undefined,
		set: (): void => {},
		remove: (): void => {},
	}
}

const publishedOnly: EnumFilterArtifact = { values: ['published'] }

const filterDefs = new Map<string, { handler: FilterHandler<FilterArtifact>; initialArtifact?: FilterArtifact }>([
	['title', { handler: createTextFilterHandler('title') }],
	['status', { handler: createEnumFilterHandler('status'), initialArtifact: publishedOnly }],
])

describe('useFilteringState — stored record that predates a filter', () => {
	test('should start the missing filter at its initial artifact', () => {
		const { result } = renderHook(() => useFilteringState({
			filters: filterDefs,
			stateStorage: storageWithRecordWithoutStatus(),
			storageKey: 'grid',
		}))

		expect(result.current.getArtifact('status')).toEqual(publishedOnly)
		expect(result.current.resolvedWhere).toEqual({ status: { in: ['published'] } })
		expect(result.current.hasActiveFilters).toBe(true)
	})

	test('should report the same artifact through filters, getArtifact and resolvedWhere', () => {
		const { result } = renderHook(() => useFilteringState({
			filters: filterDefs,
			stateStorage: storageWithRecordWithoutStatus(),
			storageKey: 'grid',
		}))

		const shown = result.current.filters.get('status')?.artifact
		const handler = filterDefs.get('status')?.handler
		expect(result.current.getArtifact('status')).toEqual(shown)
		expect(result.current.resolvedWhere).toEqual(shown === undefined ? undefined : handler?.toWhere(shown))
	})
})
