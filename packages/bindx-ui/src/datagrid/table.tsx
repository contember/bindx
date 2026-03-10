/**
 * Styled DataGrid table primitives.
 */
import { uic } from '../utils/uic.js'

export const DataGridContainer = uic('div', {
	baseClass: 'w-full space-y-4',
	displayName: 'DataGridContainer',
})

export const DataGridTableWrapper = uic('div', {
	baseClass: 'rounded-md border border-input overflow-auto',
	displayName: 'DataGridTableWrapper',
})

export const DataGridTable = uic('table', {
	baseClass: 'w-full caption-bottom text-sm',
	displayName: 'DataGridTable',
})

export const DataGridThead = uic('thead', {
	baseClass: '[&_tr]:border-b',
	displayName: 'DataGridThead',
})

export const DataGridTbody = uic('tbody', {
	baseClass: '[&_tr:last-child]:border-0',
	displayName: 'DataGridTbody',
})

export const DataGridHeaderRow = uic('tr', {
	baseClass: 'border-b transition-colors hover:bg-muted/50',
	displayName: 'DataGridHeaderRow',
})

export const DataGridRow = uic('tr', {
	baseClass: 'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
	displayName: 'DataGridRow',
})

export const DataGridHeaderCell = uic('th', {
	baseClass: 'h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
	displayName: 'DataGridHeaderCell',
})

export const DataGridCell = uic('td', {
	baseClass: 'p-4 align-middle [&:has([role=checkbox])]:pr-0',
	displayName: 'DataGridCell',
})

export const DataGridEmptyState = uic('div', {
	baseClass: 'flex items-center justify-center p-8 text-muted-foreground',
	displayName: 'DataGridEmptyState',
})
