/**
 * Styled sortable column header with filtering, sorting, and hiding controls.
 */
import type { ReactElement, ReactNode } from 'react'
import {
	DataViewSortingSwitch,
	DataViewSortingTrigger,
	DataViewVisibilityTrigger,
	useDataViewFilter,
} from '@contember/bindx-dataview'
import type { FieldRef } from '@contember/bindx'
import { ArrowDownAZIcon, ArrowUpDownIcon, ArrowUpZaIcon, EyeOffIcon, FilterIcon } from 'lucide-react'
import { cn } from '../utils/cn.js'
import { dict } from '../dict.js'
import { Button } from '#bindx-ui/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'

export interface DataGridColumnHeaderUIProps {
	children: ReactNode
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sortingField?: FieldRef<any>
	hidingName?: string
	filterName?: string
	filter?: ReactNode
	className?: string
}

export function DataGridColumnHeaderUI({
	sortingField,
	hidingName,
	children,
	filter,
	filterName,
	className,
}: DataGridColumnHeaderUIProps): ReactElement {
	let hasFilter = false
	if (filterName) {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const [, , { isEmpty }] = useDataViewFilter(filterName)
		hasFilter = !isEmpty
	}

	if (!sortingField && !hidingName && !filter) {
		return <div className={cn('text-xs', className)}>{children}</div>
	}

	return (
		<div className={cn('flex items-center space-x-2', className)}>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="flex-inline gap-1 -ml-3 h-8 data-[state=open]:bg-accent"
					>
						<span>{children}</span>
						{sortingField && (
							<DataViewSortingSwitch
								field={sortingField}
								asc={<ArrowDownAZIcon className="h-4 w-4 text-blue-600" />}
								desc={<ArrowUpZaIcon className="h-4 w-4 text-blue-600" />}
								none={<ArrowUpDownIcon className="h-4 w-4" />}
							/>
						)}
						{hasFilter && <FilterIcon className="h-4 w-4 text-blue-600" />}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-3">
					<div className="flex flex-col gap-1">
						{(sortingField || hidingName) && (
							<div className="flex gap-2 border border-gray-200 rounded-sm p-1">
								{sortingField && (
									<>
										<DataViewSortingTrigger field={sortingField} action="toggleAsc">
											<Button variant="ghost" className="data-[active]:text-blue-600 cursor-pointer flex-1" size="sm">
												<ArrowDownAZIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
												{dict.datagrid.columnAsc}
											</Button>
										</DataViewSortingTrigger>
										<DataViewSortingTrigger field={sortingField} action="toggleDesc">
											<Button variant="ghost" className="data-[active]:text-blue-600 cursor-pointer flex-1" size="sm">
												<ArrowUpZaIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
												{dict.datagrid.columnDesc}
											</Button>
										</DataViewSortingTrigger>
									</>
								)}
								{hidingName && (
									<DataViewVisibilityTrigger name={hidingName} value={false}>
										<Button variant="ghost" size="sm">
											<EyeOffIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
											{dict.datagrid.columnHide}
										</Button>
									</DataViewVisibilityTrigger>
								)}
							</div>
						)}
						{filter && (
							<div className="py-2">
								{filter}
							</div>
						)}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	)
}
