// Regression test for https://github.com/contember/bindx/issues/141
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { SelectListItemUI } from '../../../packages/bindx-ui/src/select/ui.js'

/**
 * `DefaultSelectDataView` lays its options out in a `flex flex-col gap-1 max-h-96
 * overflow-y-auto` column. A flex item may shrink below its content only when it
 * has an explicit `min-height`, and `SelectListItemUI` sets `min-h-8`: once the
 * options overflow the 24rem, every row is squeezed to 32px, so an option that
 * renders two lines (a name and a detail line) overflows into the row below it.
 * The row has to opt out of shrinking so its height follows its content.
 */
describe('SelectListItemUI', () => {
	afterEach(() => cleanup())

	test('should not shrink below its content inside the overflowing option list', () => {
		const { getByRole } = render(
			<SelectListItemUI>
				<span>
					<span>Digitální bezpečnost dětí</span>
					<span>18. 11. 2026 · Pardubice · 33 / 80</span>
				</span>
			</SelectListItemUI>,
		)
		const classes = getByRole('button').className.split(/\s+/)
		expect(classes).toContain('min-h-8')
		expect(classes).toContain('shrink-0')
	})
})
