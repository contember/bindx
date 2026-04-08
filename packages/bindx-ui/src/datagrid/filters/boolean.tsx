/**
 * Boolean filter UI components for DataGrid.
 */
import type { ReactElement, ReactNode } from 'react'
import {
	DataViewBooleanFilter,
	type DataViewBooleanFilterProps,
	DataViewBooleanFilterTrigger,
	DataViewNullFilterTrigger,
} from '@contember/bindx-dataview'
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { Button } from '#bindx-ui/ui/button'
import {
	DataGridActiveFilterUI,
	DataGridFilterSelectTriggerUI,
	DataGridSingleFilterUI,
} from '#bindx-ui/datagrid/ui'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

export type DataGridBooleanFilterUIProps<T> =
	& Omit<DataViewBooleanFilterProps<T>, 'children'>
	& {
		label?: ReactNode
	}

export function DataGridBooleanFilterUI<T>({ label, ...props }: DataGridBooleanFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewBooleanFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridSingleFilterUI>
					<DataGridBooleanFilterSelect label={label ?? defaultLabel} />
					<DataGridBooleanFilterList />
				</DataGridSingleFilterUI>
			</DataGridFilterMobileHiding>
		</DataViewBooleanFilter>
	)
}

const formatBoolean = (value: boolean): string => value ? dict.boolean.true : dict.boolean.false

const DataGridBooleanFilterList = (): ReactElement => (
	<>
		{[true, false].map(value => (
			<DataViewBooleanFilterTrigger action="unset" value={value} key={value.toString()}>
				<DataGridActiveFilterUI className='data-[current=none]:hidden'>
					{formatBoolean(value)}
				</DataGridActiveFilterUI>
			</DataViewBooleanFilterTrigger>
		))}
		<DataViewNullFilterTrigger action="unset">
			<DataGridActiveFilterUI>
				<span className="italic">{dict.datagrid.na}</span>
			</DataGridActiveFilterUI>
		</DataViewNullFilterTrigger>
	</>
)

const DataGridBooleanFilterSelect = ({ label }: { label?: ReactNode }): ReactElement => (
	<Popover>
		<PopoverTrigger asChild>
			<DataGridFilterSelectTriggerUI>{label}</DataGridFilterSelectTriggerUI>
		</PopoverTrigger>
		<PopoverContent className="w-52">
			<DataGridBooleanFilterControls />
		</PopoverContent>
	</Popover>
)

export const DataGridBooleanFilterControls = (): ReactElement => {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				{[true, false].map(it => (
					<DataViewBooleanFilterTrigger action="toggle" value={it} key={it.toString()}>
						<Button size="lg" className="w-full data-[active]:shadow-inner data-[active]:text-blue-500" variant="outline">
							<span className="text-xs font-semibold">{formatBoolean(it)}</span>
						</Button>
					</DataViewBooleanFilterTrigger>
				))}
			</div>
			<DataGridNullFilter />
		</div>
	)
}
