import React, { type ReactElement, type ReactNode } from 'react'
import type { EntityAccessor, FieldRef } from '@contember/bindx'
import {
	createColumn,
	createColumnStaticRender,
	enumColumnDef,
	enumListColumnDef,
	useDataViewFilterName,
	useDataViewContext,
} from '@contember/bindx-dataview'
import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { DataGridEnumFilterControls } from '#bindx-ui/datagrid/filters/enum'
import { useEnumOptionsFormatter } from '#bindx-ui/labels/index'

function EnumCellLabel({ value, enumOptions, enumName }: {
	value: string
	enumOptions: Readonly<Record<string, ReactNode>> | undefined
	enumName: string | undefined
}): ReactNode {
	const formatter = useEnumOptionsFormatter()
	if (enumOptions?.[value] != null) return enumOptions[value]
	if (enumName) {
		const resolved = formatter(enumName)
		if (resolved[value] != null) return resolved[value]
	}
	return value
}

function renderEnumDefault({ value, enumOptions, enumName }: ColumnRenderProps<string | null>): ReactNode {
	if (value == null) return ''
	return <EnumCellLabel value={value} enumOptions={enumOptions} enumName={enumName} />
}

function renderEnumListDefault({ value, enumOptions, enumName }: ColumnRenderProps<readonly string[] | null>): ReactNode {
	if (!Array.isArray(value)) return ''
	return value.map((v, i) => (
		<React.Fragment key={i}>
			{i > 0 ? ', ' : null}
			<EnumCellLabel value={v} enumOptions={enumOptions} enumName={enumName} />
		</React.Fragment>
	))
}

function ColumnEnumFilterControls(): ReactElement {
	const filterName = useDataViewFilterName()
	const { columns } = useDataViewContext()
	const enumFormatter = useEnumOptionsFormatter()
	const column = columns.find(c => c.filterName === filterName)

	let optionsRecord: Record<string, ReactNode>
	if (column?.enumOptions && Object.keys(column.enumOptions).length > 0) {
		optionsRecord = column.enumOptions
	} else if (column?.enumName) {
		optionsRecord = enumFormatter(column.enumName)
	} else {
		optionsRecord = {}
	}

	return <DataGridEnumFilterControls options={optionsRecord} />
}

type ExtractEnum<F> = F extends FieldRef<infer T> ? Exclude<T, null | undefined> & string : string

export const DataGridEnumColumn = Object.assign(
	<F extends FieldRef<any>>(_props: {
		field: F
		header?: ReactNode
		sortable?: boolean
		filter?: boolean
		children?: (value: ExtractEnum<F> | null, accessor: EntityAccessor<object>) => ReactNode
		options?: { [K in ExtractEnum<F>]?: ReactNode }
	}): ReactNode => null,
	{
		staticRender: createColumnStaticRender(enumColumnDef, {
			renderCell: renderEnumDefault,
			renderFilter: () => <ColumnEnumFilterControls />,
		}),
	},
)

type ExtractEnumList<F> = F extends FieldRef<infer T>
	? T extends readonly (infer U)[] | null ? U & string : string
	: string

export const DataGridEnumListColumn = Object.assign(
	<F extends FieldRef<any>>(_props: {
		field: F
		header?: ReactNode
		sortable?: boolean
		filter?: boolean
		children?: (value: ExtractEnumList<F>[] | null, accessor: EntityAccessor<object>) => ReactNode
		options?: { [K in ExtractEnumList<F>]?: ReactNode }
	}): ReactNode => null,
	{
		staticRender: createColumnStaticRender(enumListColumnDef, {
			renderCell: renderEnumListDefault,
			renderFilter: () => <ColumnEnumFilterControls />,
		}),
	},
)
