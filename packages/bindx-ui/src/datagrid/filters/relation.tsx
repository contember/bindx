/**
 * Relation filter UI components for DataGrid — has-one and has-many toolbar filters.
 */
import { type ReactElement, type ReactNode, useCallback } from 'react'
import {
	DataViewHasOneFilter,
	DataViewHasManyFilter,
	DataViewNullFilterTrigger,
	useDataViewFilterName,
	useDataViewRelationFilterFactory,
	type UseDataViewRelationFilterResult,
} from '@contember/bindx-dataview'
import type { FieldRef } from '@contember/bindx'
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import {
	DataGridActiveFilterUI,
	DataGridExcludeActionButtonUI,
	DataGridFilterActionButtonUI,
	DataGridFilterSelectItemUI,
	DataGridFilterSelectTriggerUI,
	DataGridSingleFilterUI,
} from '#bindx-ui/datagrid/ui'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

// ============================================================================
// Relation filter item
// ============================================================================

export interface RelationFilterItem {
	id: string
	label: ReactNode
}

// ============================================================================
// DataGridHasOneFilterUI
// ============================================================================

export interface DataGridHasOneFilterUIProps<T> {
	field: FieldRef<T>
	name?: string
	label?: ReactNode
	items: readonly RelationFilterItem[]
}

/**
 * Has-one relation filter for DataGrid toolbar with default UI.
 */
export function DataGridHasOneFilterUI<T>({ label, items, ...props }: DataGridHasOneFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewHasOneFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridRelationFilterInner label={label ?? defaultLabel} items={items} />
			</DataGridFilterMobileHiding>
		</DataViewHasOneFilter>
	)
}

// ============================================================================
// DataGridHasManyFilterUI
// ============================================================================

export interface DataGridHasManyFilterUIProps<T> {
	field: FieldRef<T>
	name?: string
	label?: ReactNode
	items: readonly RelationFilterItem[]
}

/**
 * Has-many relation filter for DataGrid toolbar with default UI.
 */
export function DataGridHasManyFilterUI<T>({ label, items, ...props }: DataGridHasManyFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewHasManyFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridRelationFilterInner label={label ?? defaultLabel} items={items} />
			</DataGridFilterMobileHiding>
		</DataViewHasManyFilter>
	)
}

// ============================================================================
// DataGridRelationFilteredItemsList
// ============================================================================

export interface DataGridRelationFilteredItemsListProps {
	items: readonly RelationFilterItem[]
}

/**
 * Renders active relation filter items as dismissable badges.
 */
export function DataGridRelationFilteredItemsList({ items }: DataGridRelationFilteredItemsListProps): ReactElement {
	const filterName = useDataViewFilterName()
	const filterFactory = useDataViewRelationFilterFactory(filterName)

	return (
		<>
			{items.map(item => (
				<DataGridRelationFilteredItem key={item.id} item={item} filterFactory={filterFactory} />
			))}
			<DataViewNullFilterTrigger action="unset">
				<DataGridActiveFilterUI>
					<span className="italic">{dict.datagrid.na}</span>
				</DataGridActiveFilterUI>
			</DataViewNullFilterTrigger>
		</>
	)
}

function DataGridRelationFilteredItem({ item, filterFactory }: {
	item: RelationFilterItem
	filterFactory: (id: string) => UseDataViewRelationFilterResult
}): ReactElement | null {
	const [current, setFilter] = filterFactory(item.id)

	const handleUnset = useCallback(() => setFilter('unset'), [setFilter])

	if (current === 'none') {
		return null
	}

	return (
		<button type="button" onClick={handleUnset}>
			<DataGridActiveFilterUI className={current === 'exclude' ? 'line-through' : undefined}>
				{item.label}
			</DataGridActiveFilterUI>
		</button>
	)
}

// ============================================================================
// DataGridRelationFilterControls
// ============================================================================

export interface DataGridRelationFilterControlsProps {
	items: readonly RelationFilterItem[]
}

/**
 * Renders the list of relation filter items with include/exclude controls.
 */
export function DataGridRelationFilterControls({ items }: DataGridRelationFilterControlsProps): ReactElement {
	const filterFactory = useDataViewRelationFilterFactory(useDataViewFilterName())

	return (
		<div className="relative flex flex-col gap-2">
			{items.map(item => (
				<DataGridRelationFilterSelectItem key={item.id} item={item} filterFactory={filterFactory} />
			))}
			<DataGridNullFilter />
		</div>
	)
}

// ============================================================================
// Internal components
// ============================================================================

function DataGridRelationFilterInner({ label, items }: { label: ReactNode; items: readonly RelationFilterItem[] }): ReactElement {
	return (
		<DataGridSingleFilterUI>
			<DataGridRelationFilterSelect label={label} items={items} />
			<DataGridRelationFilteredItemsList items={items} />
		</DataGridSingleFilterUI>
	)
}

function DataGridRelationFilterSelect({ label, items }: {
	label?: ReactNode
	items: readonly RelationFilterItem[]
}): ReactElement {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<DataGridFilterSelectTriggerUI>{label}</DataGridFilterSelectTriggerUI>
			</PopoverTrigger>
			<PopoverContent className="p-2">
				<DataGridRelationFilterControls items={items} />
			</PopoverContent>
		</Popover>
	)
}

function DataGridRelationFilterSelectItem({ item, filterFactory }: {
	item: RelationFilterItem
	filterFactory: (id: string) => UseDataViewRelationFilterResult
}): ReactElement {
	const [current, setFilter] = filterFactory(item.id)
	const include = useCallback(() => setFilter('toggleInclude'), [setFilter])
	const exclude = useCallback(() => setFilter('toggleExclude'), [setFilter])

	return (
		<DataGridFilterSelectItemUI
			onExclude={exclude}
			onInclude={include}
			isExcluded={current === 'exclude'}
			isIncluded={current === 'include'}
		>
			{item.label}
		</DataGridFilterSelectItemUI>
	)
}
