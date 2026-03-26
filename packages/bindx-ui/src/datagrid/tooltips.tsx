/**
 * Tooltip components for DataGrid cells — show filter/exclude actions on hover.
 */
import type { ReactElement, ReactNode } from 'react'
import type { FieldRef } from '@contember/bindx'
import {
	DataViewEnumFilter,
	DataViewEnumFilterTrigger,
	DataViewHasOneFilter,
	DataViewHasManyFilter,
	DataViewRelationFilterTrigger,
} from '@contember/bindx-dataview'
import { Tooltip } from '#bindx-ui/ui/tooltip'
import { DataGridExcludeActionButtonUI, DataGridFilterActionButtonUI } from '#bindx-ui/datagrid/ui'

// ============================================================================
// Enum Field Tooltip
// ============================================================================

export interface DataGridEnumFieldTooltipProps<T> {
	field: FieldRef<T>
	name?: string
	value: string
	children: ReactNode
	actions?: ReactNode
}

/**
 * Renders a value with a tooltip that allows to include/exclude the enum value from the filter.
 */
export function DataGridEnumFieldTooltip<T>({ children, actions, value, field, name }: DataGridEnumFieldTooltipProps<T>): ReactElement {
	return (
		<DataViewEnumFilter field={field} name={name}>
			<Tooltip
				content={
					<div className="flex gap-1">
						<DataViewEnumFilterTrigger action="toggleInclude" value={value}>
							<DataGridFilterActionButtonUI />
						</DataViewEnumFilterTrigger>
						<DataViewEnumFilterTrigger action="toggleExclude" value={value}>
							<DataGridExcludeActionButtonUI />
						</DataViewEnumFilterTrigger>
						{actions}
					</div>
				}
			>
				{children}
			</Tooltip>
		</DataViewEnumFilter>
	)
}

// ============================================================================
// Has-One Tooltip
// ============================================================================

export interface DataGridHasOneTooltipProps<T> {
	field: FieldRef<T>
	name?: string
	id: string
	children: ReactNode
	actions?: ReactNode
}

/**
 * Renders a value with a tooltip that allows to include/exclude from the has-one relation filter.
 */
export function DataGridHasOneTooltip<T>({ children, actions, field, name, id }: DataGridHasOneTooltipProps<T>): ReactElement {
	return (
		<DataViewHasOneFilter field={field} name={name}>
			<DataGridRelationFieldTooltipInner id={id} actions={actions}>
				{children}
			</DataGridRelationFieldTooltipInner>
		</DataViewHasOneFilter>
	)
}

// ============================================================================
// Has-Many Tooltip
// ============================================================================

export interface DataGridHasManyTooltipProps<T> {
	field: FieldRef<T>
	name?: string
	id: string
	children: ReactNode
	actions?: ReactNode
}

/**
 * Renders a value with a tooltip that allows to include/exclude from the has-many relation filter.
 */
export function DataGridHasManyTooltip<T>({ children, actions, field, name, id }: DataGridHasManyTooltipProps<T>): ReactElement {
	return (
		<DataViewHasManyFilter field={field} name={name}>
			<DataGridRelationFieldTooltipInner id={id} actions={actions}>
				{children}
			</DataGridRelationFieldTooltipInner>
		</DataViewHasManyFilter>
	)
}

// ============================================================================
// Internal
// ============================================================================

function DataGridRelationFieldTooltipInner({ children, actions, id }: { children: ReactNode; actions?: ReactNode; id: string }): ReactElement {
	return (
		<Tooltip
			content={
				<div className="flex gap-1">
					<DataViewRelationFilterTrigger action="toggleInclude" id={id}>
						<DataGridFilterActionButtonUI />
					</DataViewRelationFilterTrigger>
					<DataViewRelationFilterTrigger action="toggleExclude" id={id}>
						<DataGridExcludeActionButtonUI />
					</DataViewRelationFilterTrigger>
					{actions}
				</div>
			}
		>
			{children}
		</Tooltip>
	)
}
