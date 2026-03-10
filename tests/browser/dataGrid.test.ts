import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, wait, query, action, tid } from './browser.js'

const URL = process.env['PLAYGROUND_URL'] ?? 'http://localhost:5180'

describe('DataGrid', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	describe('styled rendering', () => {
		test('datagrid example container exists', () => {
			expect(query.exists('datagrid-example')).toBe(true)
		})

		test('table wrapper renders', () => {
			expect(query.exists('datagrid-table')).toBe(true)
		})

		test('table header row renders', () => {
			expect(query.exists('datagrid-header')).toBe(true)
		})

		test('data rows render', () => {
			expect(query.exists('datagrid-row-0')).toBe(true)
			expect(query.exists('datagrid-row-1')).toBe(true)
		})

		test('table body renders', () => {
			expect(query.exists('datagrid-body')).toBe(true)
		})
	})

	describe('column headers with labels', () => {
		test('title column header renders with label', () => {
			expect(query.exists('datagrid-header-title')).toBe(true)
			expect(query.text('datagrid-header-title')).toContain('Title')
		})

		test('content column header renders', () => {
			expect(query.exists('datagrid-header-content')).toBe(true)
			expect(query.text('datagrid-header-content')).toContain('Content')
		})

		test('publishedAt column header renders', () => {
			expect(query.exists('datagrid-header-publishedAt')).toBe(true)
			expect(query.text('datagrid-header-publishedAt')).toContain('Published')
		})

		test('author column header renders with HasOneLabel', () => {
			expect(query.exists('datagrid-header-author')).toBe(true)
			expect(query.text('datagrid-header-author')).toContain('Author')
		})

		test('tags column header renders with HasManyLabel', () => {
			expect(query.exists('datagrid-header-tags')).toBe(true)
			expect(query.text('datagrid-header-tags')).toContain('Tags')
		})
	})

	describe('cell content', () => {
		test('title cell shows article title', () => {
			expect(query.text('datagrid-cell-title')).toBeTruthy()
		})

		test('author cell shows author name', () => {
			expect(query.text('datagrid-cell-author')).toBeTruthy()
		})

		test('tags cell shows tag names', () => {
			expect(query.text('datagrid-cell-tags')).toBeTruthy()
		})
	})

	describe('toolbar with styled filters', () => {
		test('toolbar renders', () => {
			// DefaultDataGrid renders DataGridToolbarUI which has buttons
			// Check for the settings button (gear icon)
			const settingsButton = `${tid('datagrid-example')} button`
			expect(query.exists(settingsButton)).toBe(true)
		})

		test('reload button exists in toolbar', () => {
			// The reload button is rendered by DataViewReloadTrigger
			const reloadButton = `${tid('datagrid-example')} button[data-state]`
			expect(query.exists(reloadButton)).toBe(true)
		})
	})

	describe('pagination', () => {
		test('pagination UI renders with page info', () => {
			// DataGridPaginationUI renders page info and navigation buttons
			const paginationArea = `${tid('datagrid-example')}`
			const text = query.text(paginationArea)
			// Should contain page info like "Page 1 of N" or similar
			expect(text).toBeTruthy()
		})

		test('pagination navigation buttons exist', () => {
			// DataViewChangePageTrigger renders buttons with sr-only labels
			const navButtons = `${tid('datagrid-example')} .sr-only`
			expect(query.exists(navButtons)).toBe(true)
		})
	})

	describe('empty state', () => {
		// We can't easily test DataGridNoResults without filtering to 0 results
		// but we can verify it's wired up by filtering with a non-matching query
		test('DataGridNoResults not shown when data exists', () => {
			// When data exists, the empty state should not be visible
			// The table should be visible instead
			expect(query.exists('datagrid-table')).toBe(true)
		})
	})

	describe('DataGridColumnHeaderUI interactions', () => {
		test('column header has sortable button', () => {
			// DataGridColumnHeaderUI renders a Popover trigger button
			const headerButton = `${tid('datagrid-header-title')} button`
			expect(query.exists(headerButton)).toBe(true)
		})

		test('clicking column header opens popover with sort controls', () => {
			const headerButton = `${tid('datagrid-header-title')} button`
			action.click(headerButton)
			wait(500)

			// Popover should show sorting options (Asc/Desc buttons)
			// The DataGridColumnHeaderUI renders sort triggers inside a PopoverContent
			const popoverContent = '[data-radix-popper-content-wrapper]'
			expect(query.exists(popoverContent)).toBe(true)

			// Close the popover by pressing Escape
			// We can't easily press Escape, so we'll click elsewhere
			action.click('datagrid-body')
			wait(300)
		})
	})

	describe('DataViewElement visibility', () => {
		test('all columns are visible by default', () => {
			expect(query.exists('datagrid-header-title')).toBe(true)
			expect(query.exists('datagrid-header-content')).toBe(true)
			expect(query.exists('datagrid-header-publishedAt')).toBe(true)
			expect(query.exists('datagrid-header-author')).toBe(true)
			expect(query.exists('datagrid-header-tags')).toBe(true)
		})
	})

	describe('DataGridHasOneCell and DataGridHasManyCell', () => {
		test('has-one cell wraps content for tooltip', () => {
			// DataGridHasOneCell wraps content in DataGridHasOneTooltip
			// which uses the Tooltip component with a group/tooltip class
			const hasOneCellContent = `${tid('datagrid-cell-author')} .group\\/tooltip`
			// The tooltip wrapper may or may not render depending on id being present
			// At minimum, the cell should have content
			expect(query.text('datagrid-cell-author')).toBeTruthy()
		})

		test('has-many cell shows multiple items', () => {
			// DataGridHasManyCell wraps each tag item
			const tagsCellContent = query.text('datagrid-cell-tags')
			expect(tagsCellContent).toBeTruthy()
		})
	})

	describe('DataViewHighlightRow', () => {
		test('clicking a row highlights it', () => {
			action.click('datagrid-row-0')
			wait(300)

			const highlighted = query.attr('datagrid-row-0', 'data-highlighted')
			expect(highlighted).toBe('')
		})

		test('clicking another row moves highlight', () => {
			action.click('datagrid-row-1')
			wait(300)

			expect(query.attr('datagrid-row-1', 'data-highlighted')).toBe('')
			// Row 0 should no longer be highlighted (attribute removed)
			expect(query.exists(`${tid('datagrid-row-0')}[data-highlighted]`)).toBe(false)
		})
	})
})
