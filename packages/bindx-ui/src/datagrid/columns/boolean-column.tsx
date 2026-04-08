import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { createColumn, booleanColumnDef } from '@contember/bindx-dataview'
import { DataGridBooleanFilterControls } from '#bindx-ui/datagrid/filters/boolean'

function renderBooleanDefault({ value }: ColumnRenderProps<boolean | null>): React.ReactNode {
	return value != null ? String(value) : ''
}

export const BooleanColumn = createColumn(booleanColumnDef, {
	renderCell: renderBooleanDefault,
	renderFilter: () => <DataGridBooleanFilterControls />,
})
