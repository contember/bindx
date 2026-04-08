import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { createColumn, textColumnDef } from '@contember/bindx-dataview'
import { DataGridTextFilterInner } from '#bindx-ui/datagrid/filters/text'

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

export const TextColumn = createColumn(textColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <DataGridTextFilterInner />,
})
