/**
 * Styled DataGrid column components.
 *
 * Each column is self-contained — it defines its own cell rendering, filter UI,
 * and cell wrapper (e.g. tooltip).
 *
 * Scalar columns: `createColumn(typeDef, { renderCell, renderFilter })`
 * Relation columns: `createRelationColumn(typeDef, cellConfig, { renderFilter, renderCellWrapper })`
 */

import React, { type ReactElement, type ReactNode } from 'react'
import type { EntityAccessor, EntityDef, EnumFilterArtifact, EnumListFilterArtifact, FieldRefBase } from '@contember/bindx'
import {
	createColumn,
	createRelationColumn,
	hasOneCellConfig,
	hasManyCellConfig,
	getRelatedAccessor,
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
	useDataViewFilterName,
	useDataViewContext,
	DataViewFilterScope,
	DataViewEachRow,
	DataViewInfiniteLoadProvider,
	DataViewInfiniteLoadScrollObserver,
	DataViewInfiniteLoadTrigger,
	DataViewLoaderState,
	SelectDataView,
	SelectOptionsContext,
	useDataViewRelationFilterFactory,
	type UseDataViewRelationFilterResult,
} from '@contember/bindx-dataview'
import type { ColumnRenderProps, ColumnComponentProps, RelationFilterContext, RelationCellWrapperContext, RelationColumnComponent, DataGridHasOneColumnProps, DataGridHasManyColumnProps } from '@contember/bindx-dataview'
import { DataGridTextFilterInner } from './filters/text.js'
import { DataGridBooleanFilterControls } from './filters/boolean.js'
import { DataGridNumberFilterControls } from './filters/number.js'
import { DataGridDateFilterControls } from './filters/date.js'
import { DataGridEnumFilterControls } from './filters/enum.js'
import { DataGridIsDefinedFilterControls } from './filters/defined.js'
import { DataGridNullFilter } from './filters/common.js'
import { useEnumOptionsFormatter } from '../labels/index.js'
import { DataGridHasOneTooltip } from './tooltips.js'
import { DataGridFilterSelectItemUI, DataGridTooltipLabel } from './ui.js'
import { SelectDefaultFilter } from '../select/filter.js'
import { Loader } from '../ui/loader.js'
import { Button } from '../ui/button.js'
import { ArrowBigDownDash } from 'lucide-react'
import { useCallback } from 'react'

// Re-export action/generic columns from dataview
export {
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
} from '@contember/bindx-dataview'

// ============================================================================
// Scalar Column Renderers
// ============================================================================

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

function renderBooleanDefault({ value }: ColumnRenderProps<boolean | null>): React.ReactNode {
	return value != null ? String(value) : ''
}

function renderIsDefinedDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? '\u2713' : '\u2717'
}

function renderDateTimeDefault({ value }: ColumnRenderProps<string | null>): React.ReactNode {
	if (typeof value !== 'string') return ''
	const date = new Date(value)
	if (isNaN(date.getTime())) return value
	return date.toLocaleString()
}

function renderEnumListDefault({ value }: ColumnRenderProps<readonly string[] | null>): React.ReactNode {
	if (!Array.isArray(value)) return ''
	return value.join(', ')
}

function ColumnEnumFilterControls(): ReactElement {
	const filterName = useDataViewFilterName()
	const { columns } = useDataViewContext()
	const enumFormatter = useEnumOptionsFormatter()
	const column = columns.find(c => c.filterName === filterName)

	// Priority: explicit options prop > context formatter > empty
	let optionsRecord: Record<string, ReactNode>
	if (column?.enumOptions && Object.keys(column.enumOptions).length > 0) {
		optionsRecord = column.enumOptions
	} else if (column?.enumName) {
		optionsRecord = enumFormatter(column.enumName)
	} else {
		optionsRecord = {}
	}

	return <DataGridEnumFilterControls options={optionsRecord} />
}

// ============================================================================
// Styled Scalar Columns
// ============================================================================

export const DataGridTextColumn = createColumn(textColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <DataGridTextFilterInner />,
})

export const DataGridNumberColumn = createColumn(numberColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <DataGridNumberFilterControls />,
})

export const DataGridDateColumn = createColumn(dateColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <DataGridDateFilterControls layout="column" />,
})

export const DataGridDateTimeColumn = createColumn(dateTimeColumnDef, {
	renderCell: renderDateTimeDefault,
	renderFilter: () => <DataGridDateFilterControls layout="column" />,
})

export const DataGridBooleanColumn = createColumn(booleanColumnDef, {
	renderCell: renderBooleanDefault,
	renderFilter: () => <DataGridBooleanFilterControls />,
})

const _DataGridEnumColumn = createColumn(enumColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <ColumnEnumFilterControls />,
})

type ExtractEnum<F> = F extends FieldRefBase<infer T> ? Exclude<T, null | undefined> & string : string

export const DataGridEnumColumn = <F extends FieldRefBase<any>>(props: {
	field: F
	header?: ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: ExtractEnum<F> | null, accessor: EntityAccessor<object>) => ReactNode
	options?: { [K in ExtractEnum<F>]?: ReactNode }
}): ReactNode => null
DataGridEnumColumn.staticRender = _DataGridEnumColumn.staticRender

const _DataGridEnumListColumn = createColumn(enumListColumnDef, {
	renderCell: renderEnumListDefault,
	renderFilter: () => <ColumnEnumFilterControls />,
})

type ExtractEnumList<F> = F extends FieldRefBase<infer T>
	? T extends readonly (infer U)[] | null ? U & string : string
	: string

export const DataGridEnumListColumn = <F extends FieldRefBase<any>>(props: {
	field: F
	header?: ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: ExtractEnumList<F>[] | null, accessor: EntityAccessor<object>) => ReactNode
	options?: { [K in ExtractEnumList<F>]?: ReactNode }
}): ReactNode => null
DataGridEnumListColumn.staticRender = _DataGridEnumListColumn.staticRender

export const DataGridUuidColumn = createColumn(uuidColumnDef, {
	renderCell: renderScalarDefault,
})

export const DataGridIsDefinedColumn = createColumn(isDefinedColumnDef, {
	renderCell: renderIsDefinedDefault,
	renderFilter: () => <DataGridIsDefinedFilterControls />,
})

// ============================================================================
// Styled Relation Columns
// ============================================================================

const relationUI = {
	renderFilter: (ctx: RelationFilterContext) => (
		<RelationFilterUI {...ctx} />
	),
	renderCellWrapper: ({ content, item, fieldName, filterName, fieldRef }: RelationCellWrapperContext) => {
		const id = getRelatedAccessor(item, fieldName)?.id ?? null
		if (!id) return content
		return (
			<DataGridHasOneTooltip field={fieldRef} name={filterName} id={id}>
				<DataGridTooltipLabel>{content}</DataGridTooltipLabel>
			</DataGridHasOneTooltip>
		)
	},
}

const _DataGridHasOneColumn: RelationColumnComponent = createRelationColumn(hasOneColumnDef, hasOneCellConfig, relationUI)
export const DataGridHasOneColumn: {
	<TEntity, TSelected>(props: DataGridHasOneColumnProps<TEntity, TSelected>): null
	staticRender: typeof _DataGridHasOneColumn.staticRender
} = _DataGridHasOneColumn

const _DataGridHasManyColumn: RelationColumnComponent = createRelationColumn(hasManyColumnDef, hasManyCellConfig, relationUI)
export const DataGridHasManyColumn: {
	<TEntity, TSelected>(props: DataGridHasManyColumnProps<TEntity, TSelected>): null
	staticRender: typeof _DataGridHasManyColumn.staticRender
} = _DataGridHasManyColumn

// ============================================================================
// Relation Filter UI
// ============================================================================

function extractScalarFieldNames(selection: unknown): string[] {
	if (!selection || typeof selection !== 'object') return []
	const meta = selection as { fields?: Map<string, { nested?: unknown }> }
	if (!meta.fields) return []
	const names: string[] = []
	for (const [name, field] of meta.fields) {
		if (!field.nested) names.push(name)
	}
	return names
}

function RelationFilterUI({ filterName, entityName, selection, renderItem }: RelationFilterContext): ReactElement {
	const entityDef: EntityDef = { $name: entityName }
	const filterFactory = useDataViewRelationFilterFactory(filterName)
	const queryFields = extractScalarFieldNames(selection)

	return (
		<DataViewFilterScope name={filterName}>
			<SelectOptionsContext.Provider value={entityDef}>
				<SelectDataView selection={renderItem} queryField={queryFields.length > 0 ? queryFields : undefined}>
					<DataViewInfiniteLoadProvider>
						<div className="flex flex-col gap-2">
							<SelectDefaultFilter />
							<div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
								<DataViewLoaderState refreshing>
									<Loader position="absolute" />
								</DataViewLoaderState>
								<DataViewLoaderState refreshing loaded>
									<DataViewEachRow>
										{(item) => (
											<RelationFilterItem key={item.id} item={item} filterFactory={filterFactory} renderItem={renderItem} />
										)}
									</DataViewEachRow>
									<DataViewLoaderState loaded>
										<DataViewInfiniteLoadScrollObserver />
									</DataViewLoaderState>
									<DataViewInfiniteLoadTrigger>
										<Button size="sm" variant="ghost" className="disabled:hidden w-full">
											<ArrowBigDownDash size={16} />
										</Button>
									</DataViewInfiniteLoadTrigger>
								</DataViewLoaderState>
								<DataViewLoaderState initial>
									<Loader position="static" size="sm" />
								</DataViewLoaderState>
							</div>
							<DataGridNullFilter />
						</div>
					</DataViewInfiniteLoadProvider>
				</SelectDataView>
			</SelectOptionsContext.Provider>
		</DataViewFilterScope>
	)
}

function RelationFilterItem({ item, filterFactory, renderItem }: {
	item: EntityAccessor<object>
	filterFactory: (id: string) => UseDataViewRelationFilterResult
	renderItem: (accessor: EntityAccessor<object>) => ReactNode
}): ReactElement {
	const [current, setFilter] = filterFactory(item.id)
	const include = useCallback(() => setFilter('toggleInclude'), [setFilter])
	const exclude = useCallback(() => setFilter('toggleExclude'), [setFilter])

	return (
		<DataGridFilterSelectItemUI
			onInclude={include}
			onExclude={exclude}
			isIncluded={current === 'include'}
			isExcluded={current === 'exclude'}
		>
			{renderItem(item)}
		</DataGridFilterSelectItemUI>
	)
}
