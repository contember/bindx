/**
 * Styled DataGrid — high-level component that renders the complete grid UI.
 */

// Re-export all styled primitives
export { DataGrid, type DataGridProps, HasManyDataGrid, type HasManyDataGridProps } from '#bindx-ui/datagrid/datagrid'
export { DataGridLayout, type DataGridLayoutProps } from '#bindx-ui/datagrid/layout'
export { DataGridToolbarUI, type DataGridToolbarUIProps } from '#bindx-ui/datagrid/toolbar'
export { DataGridPaginationUI, type DataGridPaginationUIProps, DataGridPerPageSelector } from '#bindx-ui/datagrid/pagination'
export { DataGridColumnHeaderUI, type DataGridColumnHeaderUIProps } from '#bindx-ui/datagrid/column-header'
export {
	DataGridContainer,
	DataGridTableWrapper,
	DataGridTable,
	DataGridThead,
	DataGridTbody,
	DataGridHeaderRow,
	DataGridRow,
	DataGridHeaderCell,
	DataGridCell,
	DataGridEmptyState,
} from '#bindx-ui/datagrid/table'
export { DataGridAutoTable, type DataGridAutoTableProps } from '#bindx-ui/datagrid/auto-table'
export { DataGridLoader, type DataGridLoaderProps } from '#bindx-ui/datagrid/loader'
export { DataGridLayoutSwitcher } from '#bindx-ui/datagrid/layout-switcher'
export { DataGridNoResults } from '#bindx-ui/datagrid/empty'
export { DataGridAutoExport } from '#bindx-ui/datagrid/export'
export { DataGridToolbarVisibleElements, type DataGridToolbarVisibleElementsProps } from '#bindx-ui/datagrid/elements'
export {
	DataGridToolbarWrapperUI,
	DataGridTooltipLabel,
	DataGridFilterActionButtonUI,
	DataGridExcludeActionButtonUI,
	DataGridActiveFilterUI,
	DataGridSingleFilterUI,
	DataGridFilterSelectTriggerUI,
	DataGridFilterSelectItemUI,
	type DataGridFilterSelectItemProps,
} from '#bindx-ui/datagrid/ui'

// Labels
export {
	DataViewFieldLabel,
	DataViewHasOneLabel,
	DataViewHasManyLabel,
	useDefaultFieldLabel,
} from '#bindx-ui/datagrid/labels'

// Cells
export {
	EnumCell,
	type EnumCellProps,
	EnumListCell,
	type EnumListCellProps,
	HasOneCell,
	type HasOneCellProps,
	HasManyCell,
	type HasManyCellProps,
} from '#bindx-ui/datagrid/cells/index'

// Tooltips
export {
	DataGridEnumFieldTooltip,
	type DataGridEnumFieldTooltipProps,
	DataGridHasOneTooltip,
	type DataGridHasOneTooltipProps,
	DataGridHasManyTooltip,
	type DataGridHasManyTooltipProps,
} from '#bindx-ui/datagrid/tooltips'

// Filters
export {
	DataGridBooleanFilterUI,
	type DataGridBooleanFilterUIProps,
	DataGridBooleanFilterControls,
	DataGridDateFilterUI,
	type DataGridDateFilterUIProps,
	type DataGridPredefinedDateRange,
	createDataGridDateRange,
	DataGridDateFilterControls,
	DataGridIsDefinedFilterUI,
	type DataGridIsDefinedFilterUIProps,
	DataGridIsDefinedFilterControls,
	DataGridEnumFilterUI,
	type DataGridEnumFilterUIProps,
	DataGridEnumListFilterUI,
	type DataGridEnumListFilterUIProps,
	DataGridEnumFilterControls,
	DataGridNumberFilterUI,
	type DataGridNumberFilterUIProps,
	DataGridNumberFilterControls,
	DataGridTextFilter,
	type DataGridTextFilterProps,
	DataGridUnionTextFilter,
	type DataGridUnionTextFilterProps,
	DataGridQueryFilter,
	type DataGridQueryFilterProps,
	DataGridTextFilterInner,
	DataGridNullFilter,
	DataGridHasOneFilterUI,
	type DataGridHasOneFilterUIProps,
	DataGridHasManyFilterUI,
	type DataGridHasManyFilterUIProps,
	DataGridRelationFilterControls,
	type DataGridRelationFilterControlsProps,
	DataGridRelationFilteredItemsList,
	type DataGridRelationFilteredItemsListProps,
	type RelationFilterItem,
} from '#bindx-ui/datagrid/filters/index'

// Styled columns (with inline filter UI)
export {
	TextColumn,
	NumberColumn,
	DateColumn,
	DateTimeColumn,
	BooleanColumn,
	EnumColumn,
	EnumListColumn,
	UuidColumn,
	IsDefinedColumn,
	HasOneColumn,
	HasManyColumn,
	DataGridActionColumn,
	DataGridColumn,
	type DataGridTextColumnProps,
	type DataGridNumberColumnProps,
	type DataGridDateColumnProps,
	type DataGridDateTimeColumnProps,
	type DataGridBooleanColumnProps,
	type DataGridEnumColumnProps,
	type DataGridEnumListColumnProps,
	type DataGridUuidColumnProps,
	type DataGridIsDefinedColumnProps,
	type DataGridHasOneColumnProps,
	type DataGridHasManyColumnProps,
	type DataGridActionColumnProps,
	type DataGridColumnProps,
} from '#bindx-ui/datagrid/columns/index'
