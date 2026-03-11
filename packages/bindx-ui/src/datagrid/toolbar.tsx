/**
 * Styled DataGrid toolbar — with filters, settings, export, and reload.
 */
import React, { type ReactElement, type ReactNode, useState } from 'react'
import {
	DataViewReloadTrigger,
	useDataViewContext,
	DataViewFilterScope,
	DataViewHasFilterType,
	QUERY_FILTER_NAME,
	dataAttribute,
} from '@contember/bindx-dataview'
import { FilterIcon, RefreshCcwIcon, SettingsIcon } from 'lucide-react'
import { Button } from '../ui/button.js'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js'
import { cn } from '../utils/cn.js'
import { dict } from '../dict.js'
import { DataGridToolbarVisibleElements } from './elements.js'
import { DataGridAutoExport } from './export.js'
import { DataGridLayoutSwitcher } from './layout-switcher.js'
import { DataGridPerPageSelector } from './pagination.js'
import { DataGridToolbarWrapperUI } from './ui.js'
import { DataGridShowFiltersContext } from './filters/mobile.js'
import { DataGridTextFilterInner } from './filters/text.js'

export interface DataGridToolbarUIProps {
	children?: ReactNode
	className?: string
	sticky?: boolean
}

export function DataGridToolbarUI({ children, className, sticky }: DataGridToolbarUIProps): ReactElement {
	const [showFilters, setShowFilters] = useState(false)

	return (
		<DataGridShowFiltersContext.Provider value={showFilters}>
			<DataGridToolbarWrapperUI sticky={sticky} className={className}>
				<div className="ml-auto flex gap-2 items-center sm:order-1">
					<Button
						variant="outline"
						size="sm"
						className="gap-2 sm:hidden data-[active]:bg-gray-50 data-[active]:shadow-inner"
						data-active={dataAttribute(showFilters)}
						onClick={() => setShowFilters(!showFilters)}
					>
						<FilterIcon className="w-4 h-4" /> {dict.datagrid.filters}
					</Button>

					<Popover>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm" className="gap-2">
								<SettingsIcon className="w-4 h-4" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto min-w-48">
							<div className="flex flex-col gap-4">
								<DataGridLayoutSwitcher />
								<DataGridToolbarVisibleElements />
								<DataGridPerPageSelector />
							</div>
						</PopoverContent>
					</Popover>

					<DataGridAutoExport />
					<DataViewReloadTrigger>
						<Button variant="outline" size="sm" className="group gap-2">
							<RefreshCcwIcon className="w-4 h-4 group-data-[state=refreshing]:animate-spin" />
						</Button>
					</DataViewReloadTrigger>
				</div>

				<div className="flex flex-1 flex-wrap gap-2">
					{children ?? (
						<DataViewHasFilterType name={QUERY_FILTER_NAME}>
							<DataViewFilterScope name={QUERY_FILTER_NAME}>
								<DataGridTextFilterInner />
							</DataViewFilterScope>
						</DataViewHasFilterType>
					)}
				</div>
			</DataGridToolbarWrapperUI>
		</DataGridShowFiltersContext.Provider>
	)
}
