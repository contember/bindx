/**
 * IsDefined filter UI components for DataGrid.
 */
import type { ReactElement, ReactNode } from 'react'
import {
	DataViewIsDefinedFilter,
	type DataViewIsDefinedFilterProps,
	DataViewNullFilterTrigger,
} from '@contember/bindx-dataview'
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import { CheckIcon, XIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { Button } from '#bindx-ui/ui/button'
import {
	DataGridFilterSelectTriggerUI,
	DataGridSingleFilterUI,
} from '#bindx-ui/datagrid/ui'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

export type DataGridIsDefinedFilterUIProps<T> =
	& Omit<DataViewIsDefinedFilterProps<T>, 'children'>
	& {
		label?: ReactNode
	}

export function DataGridIsDefinedFilterUI<T>({ label, ...props }: DataGridIsDefinedFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewIsDefinedFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridSingleFilterUI>
					<DataGridIsDefinedFilterSelect label={label ?? defaultLabel} />
					<DataGridIsDefinedFilterList />
				</DataGridSingleFilterUI>
			</DataGridFilterMobileHiding>
		</DataViewIsDefinedFilter>
	)
}

const DataGridIsDefinedFilterList = (): ReactElement => (
	<>
		<DataViewNullFilterTrigger action="unset">
			<Button variant="outline" size="sm" className='space-x-1 data-[current="none"]:hidden data-[current="include"]:hidden h-6'>
				<CheckIcon size={16} />
				<span>{dict.boolean.true}</span>
				<XIcon className="w-2 h-2" />
			</Button>
		</DataViewNullFilterTrigger>
		<DataViewNullFilterTrigger action="unset">
			<Button variant="outline" size="sm" className='space-x-1 data-[current="none"]:hidden data-[current="exclude"]:hidden h-6'>
				<XIcon size={16} />
				<span>{dict.boolean.false}</span>
				<XIcon className="w-2 h-2" />
			</Button>
		</DataViewNullFilterTrigger>
	</>
)

const DataGridIsDefinedFilterSelect = ({ label }: { label?: ReactNode }): ReactElement => (
	<Popover>
		<PopoverTrigger asChild>
			<DataGridFilterSelectTriggerUI>{label}</DataGridFilterSelectTriggerUI>
		</PopoverTrigger>
		<PopoverContent className="w-52">
			<DataGridIsDefinedFilterControls />
		</PopoverContent>
	</Popover>
)

export const DataGridIsDefinedFilterControls = (): ReactElement => {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				<DataViewNullFilterTrigger action="toggleExclude">
					<Button size="sm" className="w-full data-[active]:shadow-inner data-[active]:text-blue-500" variant="outline">
						<CheckIcon size={16} />
						{dict.boolean.true}
					</Button>
				</DataViewNullFilterTrigger>
				<DataViewNullFilterTrigger action="toggleInclude">
					<Button size="sm" className="w-full data-[active]:shadow-inner data-[active]:text-blue-500" variant="outline">
						<XIcon size={16} />
						{dict.boolean.false}
					</Button>
				</DataViewNullFilterTrigger>
			</div>
		</div>
	)
}
