/**
 * Date filter UI components for DataGrid.
 */
import type { ReactElement, ReactNode } from 'react'
import { useCallback, useId } from 'react'
import {
	DataViewDateFilter,
	type DataViewDateFilterProps,
	DataViewDateFilterInput,
	DataViewDateFilterResetTrigger,
	DataViewNullFilterTrigger,
	useDataViewFilter,
	useDataViewFilterName,
} from '@contember/bindx-dataview'
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import type { DateFilterArtifact } from '@contember/bindx'
import { XIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { Input } from '#bindx-ui/ui/input'
import { Button } from '#bindx-ui/ui/button'
import { Label } from '#bindx-ui/ui/label'
import {
	DataGridActiveFilterUI,
	DataGridFilterSelectTriggerUI,
	DataGridSingleFilterUI,
} from '#bindx-ui/datagrid/ui'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

export interface DataGridPredefinedDateRange {
	start: string
	end: string
	label: ReactNode
}

export const createDataGridDateRange = (label: ReactNode, dayDeltaStart: number, dayDeltaEnd: number): DataGridPredefinedDateRange => {
	const start = new Date(new Date().setDate(new Date().getDate() + dayDeltaStart))
	const end = new Date(new Date().setDate(new Date().getDate() + dayDeltaEnd))
	return {
		label,
		start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
		end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
	}
}

export type DataGridDateFilterUIProps<T> =
	& Omit<DataViewDateFilterProps<T>, 'children'>
	& {
		label?: ReactNode
		ranges?: DataGridPredefinedDateRange[]
	}

export function DataGridDateFilterUI<T>({ label, ranges, ...props }: DataGridDateFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewDateFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridSingleFilterUI>
					<DataGridDateFilterSelect label={label ?? defaultLabel} ranges={ranges} />
					<DataGridDateFilterList />
				</DataGridSingleFilterUI>
			</DataGridFilterMobileHiding>
		</DataViewDateFilter>
	)
}

const formatDate = (value: string): string => {
	const date = new Date(value)
	if (isNaN(date.getTime())) return value
	return date.toLocaleDateString()
}

const DataGridDateFilterRange = (): ReactElement | null => {
	const [artifact] = useDataViewFilter<DateFilterArtifact>(useDataViewFilterName())
	if (!artifact) return null

	const { start, end } = artifact
	const startFormatted = start ? formatDate(start) : undefined
	const endFormatted = end ? formatDate(end) : undefined

	if (startFormatted !== undefined && endFormatted !== undefined) {
		return <>{startFormatted} – {endFormatted}</>
	}
	if (startFormatted !== undefined) {
		return <>≥ {startFormatted}</>
	}
	if (endFormatted !== undefined) {
		return <>≤ {endFormatted}</>
	}
	return null
}

const DataGridDateFilterList = (): ReactElement => (
	<>
		<DataViewDateFilterResetTrigger>
			<DataGridActiveFilterUI>
				<DataGridDateFilterRange />
			</DataGridActiveFilterUI>
		</DataViewDateFilterResetTrigger>
		<DataViewNullFilterTrigger action="unset">
			<DataGridActiveFilterUI>
				<span className="italic">{dict.datagrid.na}</span>
			</DataGridActiveFilterUI>
		</DataViewNullFilterTrigger>
	</>
)

const defaultRanges = [createDataGridDateRange(dict.datagrid.today, 0, 0)]

const DataGridDateFilterSelect = ({ label, ranges = defaultRanges }: {
	label?: ReactNode
	ranges?: DataGridPredefinedDateRange[]
}): ReactElement => {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<DataGridFilterSelectTriggerUI>{label}</DataGridFilterSelectTriggerUI>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<div className="flex">
					{ranges.length > 0 && (
						<div className="flex flex-col gap-2 bg-gray-50 p-4 border-r border-gray-200">
							{ranges.map(({ start, end, label: rangeLabel }) => (
								<DataGridRangeFilter start={start} end={end} label={rangeLabel} key={`${start}-${end}`} />
							))}
						</div>
					)}
					<DataGridDateFilterControls layout={ranges.length > 0 ? 'column' : 'row'} />
				</div>
			</PopoverContent>
		</Popover>
	)
}

const DataGridRangeFilter = ({ start, end, label }: DataGridPredefinedDateRange): ReactElement => {
	const name = useDataViewFilterName()
	const [filter, setFilter] = useDataViewFilter<DateFilterArtifact>(name)
	const isActive = filter?.start === start && filter?.end === end
	const handleClick = useCallback(() => setFilter({ start, end }), [setFilter, start, end])

	return (
		<Button variant="outline" size="sm" className={isActive ? 'shadow-inner bg-gray-100' : ''} onClick={handleClick}>
			{label}
		</Button>
	)
}

export const DataGridDateFilterControls = ({ layout }: { layout?: 'row' | 'column' }): ReactElement => {
	const id = useId()

	return (
		<div className="flex flex-col">
			<div className={layout === 'row' ? 'flex gap-4 px-4 py-2' : 'flex flex-col px-4 py-2 gap-2'}>
				<div className="space-y-2">
					<div className="flex justify-between items-end h-5">
						<Label htmlFor={`${id}-start`}>{dict.datagrid.dateStart}:</Label>
						<DataViewDateFilterResetTrigger type="start">
							<span className="text-sm text-gray-500 cursor-pointer hover:bg-gray-100 rounded-sm p-0.5">
								<XIcon className="w-3 h-3" />
							</span>
						</DataViewDateFilterResetTrigger>
					</div>
					<DataViewDateFilterInput type="start">
						<Input inputSize="sm" placeholder={dict.datagrid.dateStart} type="date" id={`${id}-start`} />
					</DataViewDateFilterInput>
				</div>
				<div className="space-y-2">
					<div className="flex justify-between items-end h-5">
						<Label htmlFor={`${id}-end`}>{dict.datagrid.dateEnd}:</Label>
						<DataViewDateFilterResetTrigger type="end">
							<span className="text-sm text-gray-500 cursor-pointer hover:bg-gray-100 rounded-sm p-0.5">
								<XIcon className="w-3 h-3" />
							</span>
						</DataViewDateFilterResetTrigger>
					</div>
					<DataViewDateFilterInput type="end">
						<Input inputSize="sm" placeholder={dict.datagrid.dateEnd} type="date" id={`${id}-end`} />
					</DataViewDateFilterInput>
				</div>
			</div>
			<div className="mt-auto p-2 border-t border-gray-200">
				<DataGridNullFilter />
			</div>
		</div>
	)
}
