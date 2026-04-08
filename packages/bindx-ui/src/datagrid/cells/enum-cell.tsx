import type { ReactElement, ReactNode } from 'react'
import type { FieldRef } from '@contember/bindx'
import { DataGridTooltipLabel } from '#bindx-ui/datagrid/ui'
import { DataGridEnumFieldTooltip } from '#bindx-ui/datagrid/tooltips'

export interface EnumCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	value: string | null
	options?: Record<string, ReactNode>
	tooltipActions?: ReactNode
}

export function EnumCell<T>({ field, filterName, value, options, tooltipActions }: EnumCellProps<T>): ReactElement | null {
	if (!value) return null

	return (
		<DataGridEnumFieldTooltip field={field} value={value} name={filterName} actions={tooltipActions}>
			<DataGridTooltipLabel>
				{options?.[value] ?? value}
			</DataGridTooltipLabel>
		</DataGridEnumFieldTooltip>
	)
}

export interface EnumListCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	values: readonly string[] | null
	options?: Record<string, ReactNode>
	tooltipActions?: ReactNode
}

export function EnumListCell<T>({ field, filterName, values, options, tooltipActions }: EnumListCellProps<T>): ReactElement | null {
	if (!values || values.length === 0) return null

	return (
		<div className="flex flex-wrap gap-2">
			{values.map(value => (
				<DataGridEnumFieldTooltip key={value} field={field} value={value} name={filterName} actions={tooltipActions}>
					<DataGridTooltipLabel>
						{options?.[value] ?? value}
					</DataGridTooltipLabel>
				</DataGridEnumFieldTooltip>
			))}
		</div>
	)
}
