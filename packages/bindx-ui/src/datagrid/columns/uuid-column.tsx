import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { createColumn, uuidColumnDef } from '@contember/bindx-dataview'

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

export const UuidColumn = createColumn(uuidColumnDef, {
	renderCell: renderScalarDefault,
})
