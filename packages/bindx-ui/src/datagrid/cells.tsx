/**
 * Cell components for DataGrid — render cell values with tooltip filter actions.
 *
 * These are UI wrappers used inside DataGrid column renderers or custom layouts.
 * They compose existing <HasOne>, <HasMany>, <Field> with tooltip components.
 */
import type { ReactElement, ReactNode } from 'react'
import type { FieldRef } from '@contember/bindx'
import { DataGridTooltipLabel } from '#bindx-ui/datagrid/ui'
import { DataGridEnumFieldTooltip, DataGridHasOneTooltip, DataGridHasManyTooltip } from '#bindx-ui/datagrid/tooltips'

// ============================================================================
// DataGridEnumCell
// ============================================================================

export interface DataGridEnumCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	value: string | null
	options?: Record<string, ReactNode>
	tooltipActions?: ReactNode
}

/**
 * Renders an enum cell value with a tooltip for filter actions.
 *
 * @example
 * ```tsx
 * <DataGridEnumColumn field={it.status} options={['draft', 'published']}>
 *   {(value) => (
 *     <DataGridEnumCell field={it.status} value={value} options={{ draft: 'Draft', published: 'Published' }} />
 *   )}
 * </DataGridEnumColumn>
 * ```
 */
export function DataGridEnumCell<T>({ field, filterName, value, options, tooltipActions }: DataGridEnumCellProps<T>): ReactElement | null {
	if (!value) return null

	return (
		<DataGridEnumFieldTooltip field={field} value={value} name={filterName} actions={tooltipActions}>
			<DataGridTooltipLabel>
				{options?.[value] ?? value}
			</DataGridTooltipLabel>
		</DataGridEnumFieldTooltip>
	)
}

// ============================================================================
// DataGridEnumListCell
// ============================================================================

export interface DataGridEnumListCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	values: readonly string[] | null
	options?: Record<string, ReactNode>
	tooltipActions?: ReactNode
}

/**
 * Renders an enum list cell with tooltips for each value.
 */
export function DataGridEnumListCell<T>({ field, filterName, values, options, tooltipActions }: DataGridEnumListCellProps<T>): ReactElement | null {
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

// ============================================================================
// DataGridHasOneCell
// ============================================================================

export interface DataGridHasOneCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	id: string | null
	children: ReactNode
	tooltipActions?: ReactNode
}

/**
 * Renders a has-one relation cell value with tooltip for filter actions.
 *
 * @example
 * ```tsx
 * <DataGridHasOneColumn field={it.author}>
 *   {(author) => (
 *     <DataGridHasOneCell field={it.author} id={author.id}>
 *       {author.name.value}
 *     </DataGridHasOneCell>
 *   )}
 * </DataGridHasOneColumn>
 * ```
 */
export function DataGridHasOneCell<T>({ field, filterName, id, children, tooltipActions }: DataGridHasOneCellProps<T>): ReactElement {
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

// ============================================================================
// DataGridHasManyCell
// ============================================================================

export interface DataGridHasManyCellProps<T> {
	field: FieldRef<T>
	filterName?: string
	id: string
	children: ReactNode
	tooltipActions?: ReactNode
}

/**
 * Renders a single item in a has-many relation cell with tooltip for filter actions.
 * Use inside a map() over has-many items.
 *
 * @example
 * ```tsx
 * <DataGridHasManyColumn field={it.tags}>
 *   {(tag) => (
 *     <DataGridHasManyCell field={it.tags} id={tag.id}>
 *       {tag.name.value}
 *     </DataGridHasManyCell>
 *   )}
 * </DataGridHasManyColumn>
 * ```
 */
export function DataGridHasManyCell<T>({ field, filterName, id, children, tooltipActions }: DataGridHasManyCellProps<T>): ReactElement {
	return (
		<DataGridHasManyTooltip field={field} id={id} name={filterName} actions={tooltipActions}>
			<DataGridTooltipLabel>
				{children}
			</DataGridTooltipLabel>
		</DataGridHasManyTooltip>
	)
}
