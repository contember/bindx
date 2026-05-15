/**
 * Enum filter UI components for DataGrid.
 */
import { type ReactElement, type ReactNode, useCallback } from 'react'
import {
	DataViewEnumFilter,
	type DataViewEnumFilterProps,
	DataViewEnumFilterTrigger,
	DataViewEnumListFilter,
	DataViewNullFilterTrigger,
	useDataViewEnumFilterFactory,
	useDataViewFilterName,
	type UseDataViewEnumFilterResult,
} from '@contember/bindx-dataview'
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { Button } from '#bindx-ui/ui/button'
import {
	DataGridActiveFilterUI,
	DataGridFilterSelectItemUI,
	DataGridFilterSelectTriggerUI,
	DataGridSingleFilterUI,
} from '#bindx-ui/datagrid/ui'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

export type DataGridEnumFilterUIProps<T> =
	& Omit<DataViewEnumFilterProps<T>, 'children'>
	& {
		options: Record<string, ReactNode>
		label?: ReactNode
	}

export function DataGridEnumFilterUI<T>({ options, label, ...props }: DataGridEnumFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewEnumFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridSingleFilterUI>
					<DataGridEnumFilterSelect options={options} label={label ?? defaultLabel} />
					<DataGridEnumFilterList options={options} />
				</DataGridSingleFilterUI>
			</DataGridFilterMobileHiding>
		</DataViewEnumFilter>
	)
}

export type DataGridEnumListFilterUIProps<T> =
	& Omit<DataViewEnumFilterProps<T>, 'children'>
	& {
		options: Record<string, ReactNode>
		label?: ReactNode
	}

export function DataGridEnumListFilterUI<T>({ options, label, ...props }: DataGridEnumListFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewEnumListFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridSingleFilterUI>
					<DataGridEnumFilterSelect options={options} label={label ?? defaultLabel} />
					<DataGridEnumFilterList options={options} />
				</DataGridSingleFilterUI>
			</DataGridFilterMobileHiding>
		</DataViewEnumListFilter>
	)
}

const DataGridEnumFilterList = ({ options }: { options: Record<string, ReactNode> }): ReactElement => (
	<>
		{Object.entries(options).map(([value, label]) => (
			<DataViewEnumFilterTrigger action="unset" value={value} key={value}>
				<DataGridActiveFilterUI>{label}</DataGridActiveFilterUI>
			</DataViewEnumFilterTrigger>
		))}
		<DataViewNullFilterTrigger action="unset">
			<DataGridActiveFilterUI>
				<span className="italic">{dict.datagrid.na}</span>
			</DataGridActiveFilterUI>
		</DataViewNullFilterTrigger>
	</>
)

const DataGridEnumFilterSelectItem = ({ value, children, filterFactory }: {
	value: string
	children: ReactNode
	filterFactory: (value: string) => UseDataViewEnumFilterResult
}): ReactElement => {
	const [current, setFilter] = filterFactory(value)
	const include = useCallback(() => setFilter('toggleInclude'), [setFilter])
	const exclude = useCallback(() => setFilter('toggleExclude'), [setFilter])

	return (
		<DataGridFilterSelectItemUI
			onExclude={exclude}
			onInclude={include}
			isExcluded={current === 'exclude'}
			isIncluded={current === 'include'}
		>
			{children}
		</DataGridFilterSelectItemUI>
	)
}

const DataGridEnumFilterSelect = ({ options, label }: {
	options: Record<string, ReactNode>
	label?: ReactNode
}): ReactElement => {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<DataGridFilterSelectTriggerUI>{label}</DataGridFilterSelectTriggerUI>
			</PopoverTrigger>
			<PopoverContent className="p-2">
				<DataGridEnumFilterControls options={options} />
			</PopoverContent>
		</Popover>
	)
}

export const DataGridEnumFilterControls = ({ options }: { options: Record<string, ReactNode> }): ReactElement => {
	const filterFactory = useDataViewEnumFilterFactory(useDataViewFilterName())

	return (
		<div className="relative flex flex-col gap-2">
			{Object.entries(options).map(([value, label]) => (
				<DataGridEnumFilterSelectItem value={value} key={value} filterFactory={filterFactory}>
					{label}
				</DataGridEnumFilterSelectItem>
			))}
			<DataGridNullFilter />
		</div>
	)
}
