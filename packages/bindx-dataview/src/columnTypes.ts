/**
 * Column type definitions — headless behavior layer for DataGrid columns.
 *
 * Each column type defines how to extract values, create filter handlers,
 * and whether sorting/text search is supported by default.
 *
 * These are framework-agnostic — no React dependency.
 */

import type { FilterHandler, FilterArtifact } from '@contember/bindx'
import type {
	TextFilterArtifact,
	NumberRangeFilterArtifact,
	DateFilterArtifact,
	BooleanFilterArtifact,
	EnumFilterArtifact,
	EnumListFilterArtifact,
	IsDefinedFilterArtifact,
	RelationFilterArtifact,
} from '@contember/bindx'
import {
	createTextFilterHandler,
	createNumberRangeFilterHandler,
	createDateFilterHandler,
	createBooleanFilterHandler,
	createEnumFilterHandler,
	createEnumListFilterHandler,
	createIsDefinedFilterHandler,
	createRelationFilterHandler,
} from '@contember/bindx'

// ============================================================================
// Column Type Definition Interface
// ============================================================================

export interface ColumnTypeDef<TValue = unknown, TFilterArtifact extends FilterArtifact = FilterArtifact> {
	readonly name: string
	readonly defaultSortable: boolean
	readonly isTextSearchable: boolean
	readonly createFilterHandler: (fieldName: string) => FilterHandler<TFilterArtifact>
	readonly extractValue: (accessor: Record<string, unknown>, fieldName: string) => TValue
}

export function defineColumnType<TValue, TFilterArtifact extends FilterArtifact>(
	def: ColumnTypeDef<TValue, TFilterArtifact>,
): ColumnTypeDef<TValue, TFilterArtifact> {
	return def
}

// ============================================================================
// Value Extractors
// ============================================================================

function extractScalarValue<T>(accessor: Record<string, unknown>, fieldName: string): T | null {
	const fieldRef = accessor[fieldName]
	if (!fieldRef || typeof fieldRef !== 'object') return null
	return ((fieldRef as { value?: unknown }).value ?? null) as T | null
}

// ============================================================================
// Built-in Column Type Definitions
// ============================================================================

export const textColumnDef: ColumnTypeDef<string | null, TextFilterArtifact> = defineColumnType({
	name: 'text',
	defaultSortable: true,
	isTextSearchable: true,
	createFilterHandler: createTextFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<string>(accessor, fieldName),
})

export const numberColumnDef: ColumnTypeDef<number | null, NumberRangeFilterArtifact> = defineColumnType({
	name: 'number',
	defaultSortable: true,
	isTextSearchable: false,
	createFilterHandler: createNumberRangeFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<number>(accessor, fieldName),
})

export const dateColumnDef: ColumnTypeDef<string | null, DateFilterArtifact> = defineColumnType({
	name: 'date',
	defaultSortable: true,
	isTextSearchable: false,
	createFilterHandler: createDateFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<string>(accessor, fieldName),
})

export const dateTimeColumnDef: ColumnTypeDef<string | null, DateFilterArtifact> = defineColumnType({
	name: 'dateTime',
	defaultSortable: true,
	isTextSearchable: false,
	createFilterHandler: createDateFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<string>(accessor, fieldName),
})

export const booleanColumnDef: ColumnTypeDef<boolean | null, BooleanFilterArtifact> = defineColumnType({
	name: 'boolean',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createBooleanFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<boolean>(accessor, fieldName),
})

export const enumColumnDef: ColumnTypeDef<string | null, EnumFilterArtifact> = defineColumnType({
	name: 'enum',
	defaultSortable: true,
	isTextSearchable: false,
	createFilterHandler: createEnumFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<string>(accessor, fieldName),
})

export const enumListColumnDef: ColumnTypeDef<readonly string[] | null, EnumListFilterArtifact> = defineColumnType({
	name: 'enumList',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createEnumListFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<readonly string[]>(accessor, fieldName),
})

export const uuidColumnDef: ColumnTypeDef<string | null, TextFilterArtifact> = defineColumnType({
	name: 'uuid',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createTextFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<string>(accessor, fieldName),
})

export const isDefinedColumnDef: ColumnTypeDef<unknown, IsDefinedFilterArtifact> = defineColumnType({
	name: 'isDefined',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createIsDefinedFilterHandler,
	extractValue: (accessor, fieldName) => extractScalarValue<unknown>(accessor, fieldName),
})

export const hasOneColumnDef: ColumnTypeDef<unknown, RelationFilterArtifact> = defineColumnType({
	name: 'hasOne',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createRelationFilterHandler,
	extractValue: (accessor, fieldName) => accessor[fieldName] ?? null,
})

export const hasManyColumnDef: ColumnTypeDef<unknown, RelationFilterArtifact> = defineColumnType({
	name: 'hasMany',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createRelationFilterHandler,
	extractValue: (accessor, fieldName) => accessor[fieldName] ?? null,
})
