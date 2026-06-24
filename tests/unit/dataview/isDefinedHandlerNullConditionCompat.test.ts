// Regression test for <issue-url — filled in after Step 7>
//
// `DataGridIsDefinedFilterControls` (bindx-ui) drives `DataViewNullFilterTrigger`,
// which writes a `nullCondition: boolean` field onto the filter artifact via
// `useDataViewNullFilter`. That field is the convention used by every other
// filter handler (text/number/date/enum/relation/boolean) — see e.g.
// `filterHandlers.test.ts > text filter > with null condition`.
//
// `createIsDefinedFilterHandler` is the outlier: its `IsDefinedFilterArtifact`
// shape is `{ defined: boolean | null }`. The handler's `isActive` and `toWhere`
// only inspect `defined` — `nullCondition` is completely ignored. So when the
// bindx-ui filter UI writes `nullCondition`, the handler never wakes up and
// the filter has no effect.
//
// `DataGridIsDefinedColumn` (in bindx-ui) wires these two together, but the
// combination is non-functional today and there are no existing usages to
// have caught it.
import '../../setup'
import { describe, expect, test } from 'bun:test'
import { createIsDefinedFilterHandler } from '@contember/bindx'

describe('createIsDefinedFilterHandler integration with DataViewNullFilterTrigger', () => {
	const handler = createIsDefinedFilterHandler('email')

	test('should treat artifact as active when DataGridIsDefinedFilterControls writes nullCondition: false (✓ button)', () => {
		// `DataGridIsDefinedFilterControls`'s ✓ button uses
		// `DataViewNullFilterTrigger action="toggleExclude"`, which calls
		// `useDataViewNullFilter`'s `toggleExclude` branch:
		//
		//   setFilter(it => ({ ...it, nullCondition: it?.nullCondition === false ? undefined : false }))
		//
		// Starting from the default artifact, this writes `nullCondition: false`.
		const afterExcludeClick = {
			...handler.defaultArtifact(),
			nullCondition: false,
		} as never

		expect(handler.isActive(afterExcludeClick)).toBe(true)
		expect(handler.toWhere(afterExcludeClick)).toEqual({ email: { isNull: false } })
	})

	test('should treat artifact as active when DataGridIsDefinedFilterControls writes nullCondition: true (✗ button)', () => {
		// `DataGridIsDefinedFilterControls`'s ✗ button uses
		// `DataViewNullFilterTrigger action="toggleInclude"`, which sets
		// `nullCondition: true`.
		const afterIncludeClick = {
			...handler.defaultArtifact(),
			nullCondition: true,
		} as never

		expect(handler.isActive(afterIncludeClick)).toBe(true)
		expect(handler.toWhere(afterIncludeClick)).toEqual({ email: { isNull: true } })
	})
})
