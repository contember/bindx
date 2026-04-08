import type { ReactElement, ReactNode } from 'react'
import type { FieldRef } from '@contember/bindx'
import { DataGridTooltipLabel } from '#bindx-ui/datagrid/ui'
import { DataGridHasManyTooltip } from '#bindx-ui/datagrid/tooltips'

export interface HasManyCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	id: string
	children: ReactNode
	tooltipActions?: ReactNode
}

export function HasManyCell<T>({ field, filterName, id, children, tooltipActions }: HasManyCellProps<T>): ReactElement {
	return (
		<DataGridHasManyTooltip field={field} id={id} name={filterName} actions={tooltipActions}>
			<DataGridTooltipLabel>
				{children}
			</DataGridTooltipLabel>
		</DataGridHasManyTooltip>
	)
}
