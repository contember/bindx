import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { createColumn, dateColumnDef, dateTimeColumnDef } from '@contember/bindx-dataview'
import { DataGridDateFilterControls } from '#bindx-ui/datagrid/filters/date'

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

function renderDateTimeDefault({ value }: ColumnRenderProps<string | null>): React.ReactNode {
	if (typeof value !== 'string') return ''
	const date = new Date(value)
	if (isNaN(date.getTime())) return value
	return date.toLocaleString()
}

export const DateColumn = createColumn(dateColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <DataGridDateFilterControls layout="column" />,
})

export const DateTimeColumn = createColumn(dateTimeColumnDef, {
	renderCell: renderDateTimeDefault,
	renderFilter: () => <DataGridDateFilterControls layout="column" />,
})
