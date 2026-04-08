import React, { type ReactElement, type ReactNode, useCallback } from 'react'
import type { EntityAccessor, EntityDef, FieldRef } from '@contember/bindx'
import {
	createRelationColumn,
	hasOneColumnDef,
	hasOneCellConfig,
	getRelatedAccessor,
	useDataViewRelationFilterFactory,
	DataViewFilterScope,
	DataViewEachRow,
	DataViewInfiniteLoadProvider,
	DataViewInfiniteLoadScrollObserver,
	DataViewInfiniteLoadTrigger,
	DataViewLoaderState,
	SelectDataView,
	SelectOptionsContext,
	type UseDataViewRelationFilterResult,
} from '@contember/bindx-dataview'
import type { RelationFilterContext, RelationCellWrapperContext, RelationColumnComponent, DataGridHasOneColumnProps } from '@contember/bindx-dataview'
import { DataGridHasOneTooltip } from '#bindx-ui/datagrid/tooltips'
import { DataGridFilterSelectItemUI, DataGridTooltipLabel } from '#bindx-ui/datagrid/ui'
import { SelectDefaultFilter } from '#bindx-ui/select/filter'
import { Loader } from '#bindx-ui/ui/loader'
import { Button } from '#bindx-ui/ui/button'
import { ArrowBigDownDash } from 'lucide-react'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'

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

const _HasOneColumn: RelationColumnComponent = createRelationColumn(hasOneColumnDef, hasOneCellConfig, relationUI)
export const HasOneColumn: {
	<TEntity, TSelected>(props: DataGridHasOneColumnProps<TEntity, TSelected>): null
	staticRender: typeof _HasOneColumn.staticRender
} = _HasOneColumn
