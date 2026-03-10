/**
 * Shared test helpers for DataGrid tests.
 *
 * Since DataGrid is now headless (context provider only), tests need
 * their own rendering components that consume the DataView context.
 */
import React, { type ReactElement } from 'react'
import {
	useDataViewContext,
	type ColumnMeta,
	renderCellValue,
} from '@contember/bindx-dataview'
import type { FilterArtifact } from '@contember/bindx'

/**
 * Test table that renders a full table from DataView context.
 * Supports sort indicators, cell rendering via accessors, and highlight.
 */
export function TestTable(): ReactElement {
	const { items, columns, loaderState, sorting, selection, highlightIndex, setHighlightIndex } = useDataViewContext()

	if (loaderState === 'initial') {
		return <div data-testid="datagrid-loading">Loading...</div>
	}

	if (items.length === 0) {
		return <div data-testid="datagrid-empty">No items found</div>
	}

	return (
		<table data-testid="datagrid-table">
			<thead>
				<tr data-testid="datagrid-header">
					{columns.map((col, i) => {
						if (!selection.isVisible(col.fieldName ?? `col-${i}`)) return null
						return (
							<th
								key={i}
								data-testid={`datagrid-header-${col.fieldName ?? i}`}
								onClick={col.sortable && col.fieldRef
									? () => sorting.setOrderBy(col.fieldRef!, 'next')
									: undefined}
								style={col.sortable ? { cursor: 'pointer' } : undefined}
							>
								{col.header}
								{col.sortable && col.fieldRef && (
									<SortIndicator direction={sorting.directionOf(col.fieldRef)} />
								)}
							</th>
						)
					})}
				</tr>
			</thead>
			<tbody>
				{items.map((item, rowIndex) => {
					return (
						<tr
							key={item.id}
							data-testid={`datagrid-row-${rowIndex}`}
							data-highlighted={highlightIndex === rowIndex ? '' : undefined}
							onClick={() => setHighlightIndex(rowIndex)}
						>
							{columns.map((col, colIndex) => {
								if (!selection.isVisible(col.fieldName ?? `col-${colIndex}`)) return null
								return (
									<td
										key={colIndex}
										data-testid={`datagrid-row-${rowIndex}-col-${col.fieldName ?? colIndex}`}
									>
										{renderCellValue(col, item)}
									</td>
								)
							})}
						</tr>
					)
				})}
			</tbody>
		</table>
	)
}

function SortIndicator({ direction }: { direction: string | null }): ReactElement {
	if (!direction) {
		return <span data-testid="sort-indicator" data-direction="none"> ↕</span>
	}
	return (
		<span data-testid="sort-indicator" data-direction={direction}>
			{direction === 'asc' ? ' ↑' : ' ↓'}
		</span>
	)
}

/**
 * Test toolbar that renders filter controls from DataView context.
 * Matches the data-testid structure of the old DataGridToolbar.
 */
export function TestToolbar(): ReactElement {
	const { filtering, columns } = useDataViewContext()
	const filterableColumns = columns.filter(col => col.filterable && col.fieldName)

	return (
		<div data-testid="datagrid-toolbar">
			{filterableColumns.length > 0 && (
				<div data-testid="datagrid-toolbar-filters">
					{filterableColumns.map(col => (
						<FilterControl
							key={col.fieldName!}
							column={col}
							artifact={filtering.getArtifact(col.fieldName!)}
							onArtifactChange={(artifact) => filtering.setArtifact(col.fieldName!, artifact as FilterArtifact)}
							onReset={() => filtering.resetFilter(col.fieldName!)}
						/>
					))}
				</div>
			)}
			<div data-testid="datagrid-toolbar-actions">
				{filtering.hasActiveFilters && (
					<button
						data-testid="datagrid-toolbar-reset"
						onClick={() => filtering.resetAll()}
					>
						Clear all filters
					</button>
				)}
			</div>
		</div>
	)
}

interface FilterControlProps {
	column: ColumnMeta
	artifact: unknown
	onArtifactChange: (artifact: unknown) => void
	onReset: () => void
}

function FilterControl({ column, artifact, onArtifactChange, onReset }: FilterControlProps): ReactElement {
	const fieldName = column.fieldName!

	switch (column.type) {
		case 'text':
			return <TextFilterControl fieldName={fieldName} header={column.header} artifact={artifact} onChange={onArtifactChange} onReset={onReset} />
		case 'boolean':
			return <BooleanFilterControl fieldName={fieldName} header={column.header} artifact={artifact} onChange={onArtifactChange} onReset={onReset} />
		case 'enum':
		case 'enumList':
			return <EnumFilterControl fieldName={fieldName} header={column.header} artifact={artifact} onChange={onArtifactChange} onReset={onReset} options={column.enumOptions ?? []} />
		default:
			return <span />
	}
}

function TextFilterControl({ fieldName, header, artifact, onChange, onReset }: {
	fieldName: string; header: React.ReactNode; artifact: unknown; onChange: (a: unknown) => void; onReset: () => void
}): ReactElement {
	const a = artifact as { query?: string; mode?: string } | undefined
	const value = a?.query ?? ''
	const mode = a?.mode ?? 'contains'
	return (
		<div data-testid={`datagrid-filter-${fieldName}`}>
			<label data-testid={`datagrid-filter-${fieldName}-label`}>{header}</label>
			<select data-testid={`datagrid-filter-${fieldName}-mode`} value={mode} onChange={e => onChange({ mode: e.target.value, query: value })}>
				<option value="contains">Contains</option>
				<option value="startsWith">Starts with</option>
				<option value="endsWith">Ends with</option>
				<option value="equals">Equals</option>
				<option value="notContains">Not contains</option>
			</select>
			<input data-testid={`datagrid-filter-${fieldName}-input`} type="text" value={value} placeholder={`Filter ${fieldName}...`} onChange={e => onChange({ mode, query: e.target.value })} />
			{value.length > 0 && <button data-testid={`datagrid-filter-${fieldName}-reset`} onClick={onReset}>×</button>}
		</div>
	)
}

function BooleanFilterControl({ fieldName, header, artifact, onChange, onReset }: {
	fieldName: string; header: React.ReactNode; artifact: unknown; onChange: (a: unknown) => void; onReset: () => void
}): ReactElement {
	const a = artifact as { includeTrue?: boolean; includeFalse?: boolean } | undefined
	const includeTrue = a?.includeTrue === true
	const includeFalse = a?.includeFalse === true
	const isActive = includeTrue || includeFalse
	return (
		<div data-testid={`datagrid-filter-${fieldName}`}>
			<label data-testid={`datagrid-filter-${fieldName}-label`}>{header}</label>
			<button data-testid={`datagrid-filter-${fieldName}-true`} onClick={() => onChange({ ...a, includeTrue: includeTrue ? undefined : true })} data-active={String(includeTrue)}>True</button>
			<button data-testid={`datagrid-filter-${fieldName}-false`} onClick={() => onChange({ ...a, includeFalse: includeFalse ? undefined : true })} data-active={String(includeFalse)}>False</button>
			{isActive && <button data-testid={`datagrid-filter-${fieldName}-reset`} onClick={onReset}>×</button>}
		</div>
	)
}

function EnumFilterControl({ fieldName, header, artifact, onChange, onReset, options }: {
	fieldName: string; header: React.ReactNode; artifact: unknown; onChange: (a: unknown) => void; onReset: () => void; options: readonly string[]
}): ReactElement {
	const a = artifact as { values?: string[]; notValues?: string[] } | undefined
	const selectedValues = a?.values ?? []
	const toggleValue = (val: string): void => {
		const current = [...selectedValues]
		const index = current.indexOf(val)
		if (index >= 0) current.splice(index, 1)
		else current.push(val)
		onChange({ ...a, values: current })
	}
	return (
		<div data-testid={`datagrid-filter-${fieldName}`}>
			<label data-testid={`datagrid-filter-${fieldName}-label`}>{header}</label>
			<div data-testid={`datagrid-filter-${fieldName}-options`}>
				{options.map(option => (
					<label key={option}>
						<input type="checkbox" data-testid={`datagrid-filter-${fieldName}-option-${option}`} checked={selectedValues.includes(option)} onChange={() => toggleValue(option)} />
						{option}
					</label>
				))}
			</div>
			{selectedValues.length > 0 && <button data-testid={`datagrid-filter-${fieldName}-reset`} onClick={onReset}>×</button>}
		</div>
	)
}

/**
 * Test pagination that renders pagination controls from DataView context.
 * Matches the data-testid structure of the old DataGridPagination.
 */
export function TestPagination(): ReactElement {
	const { paging } = useDataViewContext()
	const { state, info, hasPrevious, hasNext } = paging
	const currentPage = state.pageIndex + 1
	const totalPages = info.totalPages

	return (
		<div data-testid="datagrid-pagination">
			<div data-testid="datagrid-pagination-controls">
				<button data-testid="datagrid-pagination-first" onClick={() => paging.first()} disabled={!hasPrevious}>First</button>
				<button data-testid="datagrid-pagination-prev" onClick={() => paging.previous()} disabled={!hasPrevious}>Previous</button>
				<span data-testid="datagrid-pagination-info">Page {currentPage}{totalPages !== null ? ` of ${totalPages}` : ''}</span>
				<button data-testid="datagrid-pagination-next" onClick={() => paging.next()} disabled={!hasNext}>Next</button>
				<button data-testid="datagrid-pagination-last" onClick={() => paging.last()} disabled={!hasNext || totalPages === null}>Last</button>
			</div>
			{info.totalCount !== null && <span data-testid="datagrid-pagination-total">{info.totalCount} total</span>}
			<select data-testid="datagrid-pagination-pagesize" value={state.itemsPerPage} onChange={e => paging.setItemsPerPage(Number(e.target.value))}>
				{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size} per page</option>)}
			</select>
		</div>
	)
}

export function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

export function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

export function getRowCount(container: Element): number {
	return container.querySelectorAll('tbody tr[data-testid^="datagrid-row-"]').length
}

export function getCellText(container: Element, row: number, field: string): string {
	return getByTestId(container, `datagrid-row-${row}-col-${field}`).textContent ?? ''
}
