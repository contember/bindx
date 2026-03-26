/**
 * Number filter UI components for DataGrid.
 */
import type { ReactElement, ReactNode } from 'react'
import {
	DataViewNumberFilter,
	type DataViewNumberFilterProps,
	DataViewNumberFilterInput,
	DataViewNumberFilterResetTrigger,
	DataViewNullFilterTrigger,
	useDataViewFilter,
	useDataViewFilterName,
} from '@contember/bindx-dataview'
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import type { NumberRangeFilterArtifact } from '@contember/bindx'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { Input } from '#bindx-ui/ui/input'
import {
	DataGridActiveFilterUI,
	DataGridFilterSelectTriggerUI,
	DataGridSingleFilterUI,
} from '#bindx-ui/datagrid/ui'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

export type DataGridNumberFilterUIProps<T> =
	& Omit<DataViewNumberFilterProps<T>, 'children'>
	& {
		label?: ReactNode
	}

export function DataGridNumberFilterUI<T>({ label, ...props }: DataGridNumberFilterUIProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewNumberFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridSingleFilterUI>
					<DataGridNumberFilterSelect label={label ?? defaultLabel} />
					<DataGridNumberFilterList />
				</DataGridSingleFilterUI>
			</DataGridFilterMobileHiding>
		</DataViewNumberFilter>
	)
}

const DataGridNumberFilterRange = (): ReactElement | null => {
	const [artifact] = useDataViewFilter<NumberRangeFilterArtifact>(useDataViewFilterName())
	if (!artifact) return null

	if (artifact.min !== undefined && artifact.min !== null && artifact.max !== undefined && artifact.max !== null) {
		return <>{artifact.min} – {artifact.max}</>
	}
	if (artifact.min !== undefined && artifact.min !== null) {
		return <>≥ {artifact.min}</>
	}
	if (artifact.max !== undefined && artifact.max !== null) {
		return <>≤ {artifact.max}</>
	}
	return null
}

const DataGridNumberFilterList = (): ReactElement => (
	<>
		<DataViewNumberFilterResetTrigger>
			<DataGridActiveFilterUI>
				<DataGridNumberFilterRange />
			</DataGridActiveFilterUI>
		</DataViewNumberFilterResetTrigger>
		<DataViewNullFilterTrigger action="unset">
			<DataGridActiveFilterUI>
				<span className="italic">{dict.datagrid.na}</span>
			</DataGridActiveFilterUI>
		</DataViewNullFilterTrigger>
	</>
)

const DataGridNumberFilterSelect = ({ label }: { label?: ReactNode }): ReactElement => (
	<Popover>
		<PopoverTrigger asChild>
			<DataGridFilterSelectTriggerUI>{label}</DataGridFilterSelectTriggerUI>
		</PopoverTrigger>
		<PopoverContent>
			<DataGridNumberFilterControls />
		</PopoverContent>
	</Popover>
)

export const DataGridNumberFilterControls = (): ReactElement => {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-center items-center">
				<DataViewNumberFilterInput type="from">
					<Input inputSize="sm" placeholder={dict.datagrid.numberFrom} type="number" />
				</DataViewNumberFilterInput>
				<span className="mx-4 font-bold">–</span>
				<DataViewNumberFilterInput type="to">
					<Input inputSize="sm" placeholder={dict.datagrid.numberTo} type="number" />
				</DataViewNumberFilterInput>
			</div>
			<DataGridNullFilter />
		</div>
	)
}
