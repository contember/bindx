import { type ReactElement, type ReactNode } from 'react'
import type { EntityAccessor, FieldRef } from '@contember/bindx'
import {
	createColumn,
	enumColumnDef,
	enumListColumnDef,
	useDataViewFilterName,
	useDataViewContext,
} from '@contember/bindx-dataview'
import type { ColumnRenderProps } from '@contember/bindx-dataview'
import { DataGridEnumFilterControls } from '#bindx-ui/datagrid/filters/enum'
import { useEnumOptionsFormatter } from '#bindx-ui/labels/index'

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

function renderEnumListDefault({ value }: ColumnRenderProps<readonly string[] | null>): React.ReactNode {
	if (!Array.isArray(value)) return ''
	return value.join(', ')
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

const _EnumColumn = createColumn(enumColumnDef, {
	renderCell: renderScalarDefault,
	renderFilter: () => <ColumnEnumFilterControls />,
})

type ExtractEnum<F> = F extends FieldRef<infer T> ? Exclude<T, null | undefined> & string : string

export const EnumColumn = <F extends FieldRef<any>>(props: {
	field: F
	header?: ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: ExtractEnum<F> | null, accessor: EntityAccessor<object>) => ReactNode
	options?: { [K in ExtractEnum<F>]?: ReactNode }
}): ReactNode => null
EnumColumn.staticRender = _EnumColumn.staticRender

const _EnumListColumn = createColumn(enumListColumnDef, {
	renderCell: renderEnumListDefault,
	renderFilter: () => <ColumnEnumFilterControls />,
})

type ExtractEnumList<F> = F extends FieldRef<infer T>
	? T extends readonly (infer U)[] | null ? U & string : string
	: string

export const EnumListColumn = <F extends FieldRef<any>>(props: {
	field: F
	header?: ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: ExtractEnumList<F>[] | null, accessor: EntityAccessor<object>) => ReactNode
	options?: { [K in ExtractEnumList<F>]?: ReactNode }
}): ReactNode => null
EnumListColumn.staticRender = _EnumListColumn.staticRender
