/**
 * Text filter UI components for DataGrid.
 */
import type { ReactElement, ReactNode } from 'react'
import {
	DataViewFilterScope,
	DataViewHasFilterType,
	DataViewNullFilterTrigger,
	DataViewTextFilter,
	DataViewTextFilterInput,
	DataViewTextFilterMatchModeLabel,
	DataViewTextFilterMatchModeTrigger,
	type DataViewTextFilterProps,
	DataViewTextFilterResetTrigger,
	DataViewUnionTextFilter,
	type DataViewUnionTextFilterProps,
	QUERY_FILTER_NAME,
} from '@contember/bindx-dataview'
import { FIELD_REF_META } from '@contember/bindx'
import { XIcon, MoreHorizontalIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.js'
import { Button } from '../../ui/button.js'
import { InputBare, InputLike } from '../../ui/input.js'
import { DataGridActiveFilterUI } from '../ui.js'
import { DataGridNullFilter } from './common.js'
import { DataGridFilterMobileHiding } from './mobile.js'
import { dict } from '../../dict.js'

export type DataGridTextFilterProps<T> =
	& Omit<DataViewTextFilterProps<T>, 'children'>
	& {
		label?: ReactNode
	}

export function DataGridTextFilter<T>({ label, ...props }: DataGridTextFilterProps<T>): ReactElement {
	return (
		<DataViewTextFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridTextFilterInner label={label ?? props.field[FIELD_REF_META].fieldName} />
			</DataGridFilterMobileHiding>
		</DataViewTextFilter>
	)
}

export type DataGridUnionTextFilterProps<T> =
	& Omit<DataViewUnionTextFilterProps<T>, 'children'>
	& {
		label?: ReactNode
	}

export function DataGridUnionTextFilter<T>({ label, ...props }: DataGridUnionTextFilterProps<T>): ReactElement {
	return (
		<DataViewUnionTextFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridTextFilterInner label={label} />
			</DataGridFilterMobileHiding>
		</DataViewUnionTextFilter>
	)
}

export interface DataGridQueryFilterProps {
	label?: ReactNode
}

export const DataGridQueryFilter = ({ label }: DataGridQueryFilterProps): ReactElement => (
	<DataViewHasFilterType name={QUERY_FILTER_NAME}>
		<DataViewFilterScope name={QUERY_FILTER_NAME}>
			<DataGridFilterMobileHiding>
				<DataGridTextFilterInner label={label} />
			</DataGridFilterMobileHiding>
		</DataViewFilterScope>
	</DataViewHasFilterType>
)

export const DataGridTextFilterInner = ({ label }: { label?: ReactNode }): ReactElement => {
	return (
		<InputLike className="p-1 relative basis-1/4 min-w-56">
			<div className="flex items-center gap-1">
				<DataViewTextFilterMatchModeTrigger mode="contains">
					<Button size="sm" variant="secondary" className="px-3">
						{label} <DataViewTextFilterMatchModeLabel />
					</Button>
				</DataViewTextFilterMatchModeTrigger>
			</div>

			<DataViewTextFilterInput>
				<InputBare placeholder={dict.datagrid.textPlaceholder} className="w-full ml-2" />
			</DataViewTextFilterInput>

			<div className="ml-auto flex gap-1 items-center">
				<DataViewNullFilterTrigger action="unset">
					<DataGridActiveFilterUI className="ml-auto">
						<span className="italic">{dict.datagrid.na}</span>
					</DataGridActiveFilterUI>
				</DataViewNullFilterTrigger>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="p-0.5 h-5 w-5">
							<MoreHorizontalIcon />
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						<DataViewTextFilterResetTrigger>
							<Button size="sm" className="w-full text-left justify-start gap-1" variant="ghost">
								<XIcon className="w-3 h-3" /> {dict.datagrid.textReset}
							</Button>
						</DataViewTextFilterResetTrigger>
						<DataGridNullFilter />
					</PopoverContent>
				</Popover>
			</div>
		</InputLike>
	)
}
