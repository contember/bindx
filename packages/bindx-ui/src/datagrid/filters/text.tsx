/**
 * Text filter UI components for DataGrid.
 */
import type { ReactElement, ReactNode } from 'react'
import type { TextFilterArtifact } from '@contember/bindx'
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
import { useDefaultFieldLabel } from '#bindx-ui/datagrid/labels'
import { XIcon, MoreHorizontalIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#bindx-ui/ui/dropdown'
import { Button } from '#bindx-ui/ui/button'
import { InputBare, InputLike } from '#bindx-ui/ui/input'
import { DataGridActiveFilterUI } from '#bindx-ui/datagrid/ui'
import { DataGridNullFilter } from '#bindx-ui/datagrid/filters/common'
import { DataGridFilterMobileHiding } from '#bindx-ui/datagrid/filters/mobile'
import { dict } from '../../dict.js'

export type DataGridTextFilterProps<T> =
	& Omit<DataViewTextFilterProps<T>, 'children'>
	& {
		label?: ReactNode
	}

export function DataGridTextFilter<T>({ label, ...props }: DataGridTextFilterProps<T>): ReactElement {
	const defaultLabel = useDefaultFieldLabel(props.field)
	return (
		<DataViewTextFilter {...props}>
			<DataGridFilterMobileHiding>
				<DataGridTextFilterInner label={label ?? defaultLabel} />
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
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="secondary" className="px-3">
							{label} <DataViewTextFilterMatchModeLabel />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{Object.entries(dict.datagrid.textMatchMode).map(([mode, modeLabel]) => (
							<DataViewTextFilterMatchModeTrigger mode={mode as TextFilterArtifact['mode']} key={mode}>
								<DropdownMenuItem className="data-[active]:font-bold">
									{modeLabel}
								</DropdownMenuItem>
							</DataViewTextFilterMatchModeTrigger>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
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
