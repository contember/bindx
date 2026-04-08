import type { ReactElement, ReactNode } from 'react'
import type { FieldRef } from '@contember/bindx'
import { DataGridTooltipLabel } from '#bindx-ui/datagrid/ui'
import { DataGridHasOneTooltip } from '#bindx-ui/datagrid/tooltips'

export interface HasOneCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	id: string | null
	children: ReactNode
	tooltipActions?: ReactNode
}

export function HasOneCell<T>({ field, filterName, id, children, tooltipActions }: HasOneCellProps<T>): ReactElement {
	if (!id) {
		return <>{children}</>
	}

	return (
		<DataGridHasOneTooltip field={field} id={id} name={filterName} actions={tooltipActions}>
			<DataGridTooltipLabel>
				{children}
			</DataGridTooltipLabel>
		</DataGridHasOneTooltip>
	)
}
