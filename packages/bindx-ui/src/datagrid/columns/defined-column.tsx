import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { createColumn, isDefinedColumnDef } from '@contember/bindx-dataview'
import { DataGridIsDefinedFilterControls } from '#bindx-ui/datagrid/filters/defined'

function renderIsDefinedDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? '\u2713' : '\u2717'
}

export const IsDefinedColumn = createColumn(isDefinedColumnDef, {
	renderCell: renderIsDefinedDefault,
	renderFilter: () => <DataGridIsDefinedFilterControls />,
})
