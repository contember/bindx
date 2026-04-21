// Core DataGrid
export { DataGrid, type DataGridProps, QUERY_FILTER_NAME } from './DataGrid.js'
export { HasManyDataGrid, type HasManyDataGridProps } from './HasManyDataGrid.js'

// Column type definitions (Layer 1: headless behavior)
export {
	defineColumnType,
	type ColumnTypeDef,
	textColumnDef,
	numberColumnDef,
	dateColumnDef,
	dateTimeColumnDef,
	booleanColumnDef,
	enumColumnDef,
	enumListColumnDef,
	uuidColumnDef,
	isDefinedColumnDef,
	hasOneColumnDef,
	hasManyColumnDef,
	accessField,
} from './columnTypes.js'

// ColumnLeaf, extraction, and children analysis
export {
	ColumnLeaf,
	type ColumnLeafProps,
	extractColumnLeaves,
	analyzeChildren,
	type ChildrenAnalysisResult,
} from './columnLeaf.js'

// Marker components (toolbar content, layout)
export {
	DataGridToolbarContent,
	type DataGridToolbarContentProps,
	DataGridLayout,
	type DataGridLayoutProps,
} from './markers.js'

// createColumn factory (Layer 2: UI wrapping)
export {
	createColumn,
	createColumnStaticRender,
	type ColumnRenderProps,
	type FilterRenderProps,
	type CreateColumnConfig,
	type ColumnComponentProps,
	type ColumnComponent,
} from './createColumn.js'

// createRelationColumn factory (Layer 2: relation columns)
export {
	createRelationColumn,
	hasOneCellConfig,
	hasManyCellConfig,
	type RelationColumnConfig,
	type RelationFilterContext,
	type RelationCellWrapperContext,
	type RelationColumnProps,
	type RelationColumnComponent,
} from './createRelationColumn.jsx'

// Column components
export {
	DataGridTextColumn,
	DataGridNumberColumn,
	DataGridDateColumn,
	DataGridDateTimeColumn,
	DataGridBooleanColumn,
	DataGridEnumColumn,
	DataGridEnumListColumn,
	DataGridUuidColumn,
	DataGridIsDefinedColumn,
	DataGridHasOneColumn,
	DataGridHasManyColumn,
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
	type ColumnMeta,
	extractFieldName,
	extractRelatedEntityName,
	hasFieldRefMeta,
	getRelatedAccessor,
} from './columns.js'

// State hooks
export {
	useFilteringState,
	useSortingState,
	usePagingState,
	useSelectionState,
	type FilteringState,
	type RegisteredFilter,
	type UseFilteringOptions,
	type UseSortingOptions,
	type SortingStateResult,
	type UsePagingOptions,
	type PagingStateResult,
	type UseSelectionOptions,
	type SelectionStateResult,
} from './useDataViewState.js'

// Context
export {
	useDataViewContext,
	useOptionalDataViewContext,
	DataViewProvider,
	type DataViewContextValue,
	type DataViewItem,
	type DataViewLoaderState as DataViewLoaderStateType,
	type DataViewElementData,
} from './DataViewContext.js'

// Low-level hook
export { useDataView, type UseDataViewOptions, type DataViewResult } from './useDataView.js'

// Data attribute helper
export { dataAttribute } from './dataAttribute.js'

// Filter name context
export {
	useDataViewFilterName,
	useOptionalDataViewFilterName,
	DataViewFilterNameProvider,
} from './filterContext.js'

// Filter scope and registration components
export {
	DataViewFilterScope,
	type DataViewFilterScopeProps,
	DataViewFilter,
	type DataViewFilterProps,
	DataViewHasFilterType,
	type DataViewHasFilterTypeProps,
} from './filterScope.js'

// Filter wrapper components (typed name scoping)
export {
	DataViewTextFilter,
	type DataViewTextFilterProps,
	DataViewBooleanFilter,
	type DataViewBooleanFilterProps,
	DataViewNumberFilter,
	type DataViewNumberFilterProps,
	DataViewDateFilter,
	type DataViewDateFilterProps,
	DataViewEnumFilter,
	type DataViewEnumFilterProps,
	DataViewEnumListFilter,
	type DataViewEnumListFilterProps,
	DataViewHasOneFilter,
	type DataViewHasOneFilterProps,
	DataViewHasManyFilter,
	type DataViewHasManyFilterProps,
	DataViewIsDefinedFilter,
	type DataViewIsDefinedFilterProps,
	DataViewUnionTextFilter,
	type DataViewUnionTextFilterProps,
} from './filterWrappers.js'

// Filter hooks
export {
	useDataViewFilter,
	type UseDataViewFilterResult,
	useDataViewBooleanFilter,
	useDataViewBooleanFilterFactory,
	type DataViewSetBooleanFilterAction,
	type DataViewBooleanFilterCurrent,
	type UseDataViewBooleanFilterResult,
	useDataViewEnumFilter,
	useDataViewEnumFilterFactory,
	type DataViewSetEnumFilterAction,
	type DataViewEnumFilterCurrent,
	type UseDataViewEnumFilterResult,
	useDataViewRelationFilter,
	useDataViewRelationFilterFactory,
	type DataViewSetRelationFilterAction,
	type DataViewRelationFilterCurrent,
	type UseDataViewRelationFilterResult,
	useDataViewTextFilterInput,
	type UseDataViewTextFilterInputResult,
	useDataViewTextFilterMatchMode,
	type UseDataViewTextFilterMatchModeResult,
	useDataViewNumberFilterInput,
	type UseDataViewNumberFilterInputResult,
	type UseDataViewNumberFilterInputProps,
	useDataViewNullFilter,
	type DataViewSetNullFilterAction,
	type DataViewNullFilterState,
	type UseDataViewNullFilterResult,
} from './filterHooks.js'

// Composable filter components
export {
	type DataViewFilterState,
	DataViewTextFilterInput,
	type DataViewTextFilterInputProps,
	DataViewTextFilterMatchModeTrigger,
	type DataViewTextFilterMatchModeTriggerProps,
	DataViewTextFilterMatchModeLabel,
	type DataViewTextFilterMatchModeLabelProps,
	DataViewTextFilterResetTrigger,
	type DataViewTextFilterResetTriggerProps,
	DataViewNumberFilterInput,
	type DataViewNumberFilterInputProps,
	DataViewDateFilterInput,
	type DataViewDateFilterInputProps,
	DataViewBooleanFilterTrigger,
	type DataViewBooleanFilterTriggerProps,
	DataViewEnumFilterTrigger,
	type DataViewEnumFilterTriggerProps,
	DataViewEnumFilterState,
	type DataViewEnumFilterStateProps,
	DataViewRelationFilterTrigger,
	type DataViewRelationFilterTriggerProps,
	DataViewRelationFilterState,
	type DataViewRelationFilterStateProps,
	DataViewNullFilterTrigger,
	type DataViewNullFilterTriggerProps,
	DataViewFilterResetTrigger,
	type DataViewFilterResetTriggerProps,
	DataViewDateFilterResetTrigger,
	type DataViewDateFilterResetTriggerProps,
	DataViewNumberFilterResetTrigger,
	type DataViewNumberFilterResetTriggerProps,
} from './filterComponents.js'

// Sorting components
export {
	DataViewSortingTrigger,
	type DataViewSortingTriggerProps,
	DataViewSortingSwitch,
	type DataViewSortingSwitchProps,
} from './sortingComponents.js'

// Paging components
export {
	DataViewChangePageTrigger,
	type DataViewChangePageTriggerProps,
	DataViewSetItemsPerPageTrigger,
	type DataViewSetItemsPerPageTriggerProps,
	DataViewPagingStateView,
	type DataViewPagingStateViewProps,
	DataViewPagingInfo,
	type DataViewPagingInfoProps,
} from './pagingComponents.js'

// Selection (visibility + layout) components
export {
	DataViewVisibilityTrigger,
	type DataViewVisibilityTriggerProps,
	DataViewElement,
	DataViewIsVisible,
	type DataViewElementProps,
	DataViewLayout,
	type DataViewLayoutProps,
	DataViewLayoutTrigger,
	type DataViewLayoutTriggerProps,
} from './selectionComponents.js'

// Export
export {
	DataViewExportTrigger,
	type DataViewExportTriggerProps,
	CsvExportFactory,
	type ExportFactory,
	type ExportResult,
	type ExportFactoryArgs,
	useDataViewFetchAllData,
	type FetchAllDataResult,
} from './export.js'

// Infinite scroll
export {
	DataViewInfiniteLoadProvider,
	type DataViewInfiniteLoadProviderProps,
	DataViewInfiniteLoadTrigger,
	type DataViewInfiniteLoadTriggerProps,
	DataViewInfiniteLoadScrollObserver,
	type DataViewInfiniteLoadScrollObserverProps,
	useDataViewInfiniteLoadTrigger,
} from './infiniteLoad.js'

// Loader state, reload, and conditional rendering
export {
	DataViewReloadTrigger,
	type DataViewReloadTriggerProps,
	DataViewLoaderState,
	type DataViewLoaderStateProps,
	DataViewLoaderStateSwitch,
	type DataViewLoaderStateSwitchProps,
	useDataViewLoaderState,
	useDataViewReload,
	useDataViewHighlightIndex,
	DataViewEmpty,
	type DataViewEmptyProps,
	DataViewNonEmpty,
	type DataViewNonEmptyProps,
	DataViewEachRow,
	type DataViewEachRowProps,
	DataViewHighlightRow,
	type DataViewHighlightRowProps,
	DataViewKeyboardEventHandler,
	type DataViewKeyboardEventHandlerProps,
} from './loaderComponents.js'

// Fine-grained context hooks
export {
	useDataViewSortingState,
	useDataViewSortingMethods,
	useDataViewSortingDirection,
	type DataViewSortingMethods,
	useDataViewPagingState,
	useDataViewPagingInfo,
	useDataViewPagingMethods,
	type DataViewPagingMethods,
	useDataViewFilteringState,
	useDataViewFilteringMethods,
	useDataViewFilterHandlerRegistry,
	type DataViewFilteringMethods,
	useDataViewSelectionState,
	useDataViewSelectionMethods,
	type DataViewSelectionState,
	type DataViewSelectionMethods,
	useDataViewElements,
} from './contextHooks.js'

// State storage
export {
	type StateStorage,
	type StateStorageOrName,
	type SetStoredState,
	useStoredState,
	buildDataViewKey,
} from './stateStorage.js'

// DataView key context
export {
	DataViewKeyProvider,
	type DataViewKeyProviderProps,
	useDataViewKey,
} from './DataViewKeyProvider.js'

// Select
export * from './select/index.js'
