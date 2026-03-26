import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { createColumn, numberColumnDef } from '@contember/bindx-dataview'
import { DataGridNumberFilterControls } from '#bindx-ui/datagrid/filters/number'

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

export const DataGridNumberColumn = createColumn(numberColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <DataGridNumberFilterControls />,
})
