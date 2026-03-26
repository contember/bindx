/**
 * Styled DataGrid pagination.
 */
import React, { type ReactElement } from 'react'
import {
	DataViewChangePageTrigger,
	DataViewPagingInfo,
	DataViewSetItemsPerPageTrigger,
} from '@contember/bindx-dataview'
import { ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon } from 'lucide-react'
import { Button } from '#bindx-ui/ui/button'
import { dict, dictFormat } from '../dict.js'
import { uic } from '../utils/uic.js'

const PaginationWrapper = uic('div', {
	baseClass: 'flex gap-6 lg:gap-8 items-center justify-between mt-4 pb-4',
	variants: {
		sticky: {
			true: 'sticky bottom-0 z-50 bg-background pt-4 border-t border-gray-200',
		},
	},
})

export interface DataGridPaginationUIProps {
	sticky?: boolean
	className?: string
}

export function DataGridPaginationUI({ sticky, className }: DataGridPaginationUIProps = {}): ReactElement {
	return (
		<PaginationWrapper sticky={sticky} className={className}>
			<div>
				<DataViewPagingInfo>
					{(it) => (
						<div className="flex gap-2 items-center">
							<div className="font-normal text-sm text-gray-500">
								{it.totalCount === null
									? <span className="animate-pulse">...</span>
									: dictFormat(dict.datagrid.pageRowsCount, { totalCount: it.totalCount.toString() })
								}
							</div>
						</div>
					)}
				</DataViewPagingInfo>
			</div>
			<div className="flex items-center space-x-2">
				<DataViewPagingInfo>
					{(it) => (
						<div className="flex gap-2 items-center">
							<div className="text-sm">
								{it.totalPages !== null
									? dictFormat(dict.datagrid.pageInfo, { page: (it.pageIndex + 1).toString(), pagesCount: it.totalPages.toString() })
									: dictFormat(dict.datagrid.pageInfoShort, { page: (it.pageIndex + 1).toString() })
								}
							</div>
						</div>
					)}
				</DataViewPagingInfo>
				<DataViewChangePageTrigger page="first">
					<Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex">
						<span className="sr-only">{dict.datagrid.paginationFirstPage}</span>
						<ChevronsLeftIcon className="h-4 w-4" />
					</Button>
				</DataViewChangePageTrigger>
				<DataViewChangePageTrigger page="previous">
					<Button variant="outline" className="h-8 w-8 p-0">
						<span className="sr-only">{dict.datagrid.paginationPreviousPage}</span>
						<ChevronLeftIcon className="h-4 w-4" />
					</Button>
				</DataViewChangePageTrigger>
				<DataViewChangePageTrigger page="next">
					<Button variant="outline" className="h-8 w-8 p-0">
						<span className="sr-only">{dict.datagrid.paginationNextPage}</span>
						<ChevronRightIcon className="h-4 w-4" />
					</Button>
				</DataViewChangePageTrigger>
				<DataViewChangePageTrigger page="last">
					<Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex">
						<span className="sr-only">{dict.datagrid.paginationLastPage}</span>
						<ChevronsRightIcon className="h-4 w-4" />
					</Button>
				</DataViewChangePageTrigger>
			</div>
		</PaginationWrapper>
	)
}

export const DataGridPerPageSelector = (): ReactElement => {
	return (
		<div>
			<p className="text-xs font-medium text-gray-500 mb-1.5">{dict.datagrid.paginationRowsPerPage}</p>
			<div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
				{[10, 20, 50, 100].map(pageSize => (
					<DataViewSetItemsPerPageTrigger value={pageSize} key={pageSize}>
						<button className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors data-[active]:bg-gray-100 data-[active]:text-gray-900 data-[active]:font-medium">
							{pageSize}
						</button>
					</DataViewSetItemsPerPageTrigger>
				))}
			</div>
		</div>
	)
}
