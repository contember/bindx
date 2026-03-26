/**
 * DefaultSelectDataView — pre-configured select options list with search,
 * infinite scroll, and keyboard navigation.
 */

import React, { type ReactNode } from 'react'
import type { EntityAccessor, OrderDirection } from '@contember/bindx'
import type { FieldRef } from '@contember/bindx'
import {
	SelectDataView,
	SelectOption,
	SelectItemTrigger,
	DataViewInfiniteLoadProvider,
	DataViewInfiniteLoadTrigger,
	DataViewInfiniteLoadScrollObserver,
	DataViewKeyboardEventHandler,
	DataViewLoaderState,
	DataViewEachRow,
	DataViewHighlightRow,
	useSelectHandleSelect,
} from '@contember/bindx-dataview'
import { Loader } from '#bindx-ui/ui/loader'
import { Button } from '#bindx-ui/ui/button'
import { ArrowBigDownDash } from 'lucide-react'
import { SelectDefaultFilter } from '#bindx-ui/select/filter'
import { SelectListItemUI } from '#bindx-ui/select/ui'

export interface DefaultSelectDataViewProps {
	/** Per-item render function */
	children: (it: EntityAccessor<object>) => ReactNode
	/** Field(s) to search across */
	queryField?: FieldRef<unknown> | FieldRef<unknown>[] | string[]
	/** Initial sort order */
	initialSorting?: Partial<Record<string, OrderDirection>>
	/** Static filter for the options list */
	filter?: Record<string, unknown>
}

export function DefaultSelectDataView({
	children,
	queryField,
	initialSorting,
	filter,
}: DefaultSelectDataViewProps): ReactNode {
	return (
		<SelectDataView
			queryField={queryField}
			initialSorting={initialSorting}
			filter={filter}
			selection={children}
		>
			<SelectListInner>
				{children}
			</SelectListInner>
		</SelectDataView>
	)
}

function SelectListInner({
	children,
}: {
	children: (it: EntityAccessor<object>) => ReactNode
}): ReactNode {
	const handleSelect = useSelectHandleSelect()

	return (
		<DataViewInfiniteLoadProvider>
			<DataViewKeyboardEventHandler onSelectHighlighted={handleSelect}>
				<div className={'flex flex-col gap-4 group-data-[side="top"]:flex-col-reverse'} tabIndex={-1}>
					<SelectDefaultFilter />
					<div className={'flex flex-col gap-1 max-h-96 overflow-y-auto'}>
						<DataViewLoaderState refreshing>
							<Loader position={'absolute'} />
						</DataViewLoaderState>
						<DataViewLoaderState refreshing loaded>
							<DataViewEachRow>
								{(item, index) => (
									<DataViewHighlightRow key={item.id} index={index}>
										<SelectOption entity={item}>
											<SelectItemTrigger entity={item}>
												<SelectListItemUI>
													{children(item)}
												</SelectListItemUI>
											</SelectItemTrigger>
										</SelectOption>
									</DataViewHighlightRow>
								)}
							</DataViewEachRow>
							<DataViewLoaderState loaded>
								<DataViewInfiniteLoadScrollObserver />
							</DataViewLoaderState>
							<DataViewInfiniteLoadTrigger>
								<Button size="sm" variant="ghost" className="disabled:hidden">
									<ArrowBigDownDash size={16} />
								</Button>
							</DataViewInfiniteLoadTrigger>
						</DataViewLoaderState>
					</div>
					<DataViewLoaderState initial>
						<Loader position={'static'} size={'sm'} />
					</DataViewLoaderState>
					<DataViewLoaderState failed>
						<div>Failed to load data</div>
					</DataViewLoaderState>
				</div>
			</DataViewKeyboardEventHandler>
		</DataViewInfiniteLoadProvider>
	)
}
