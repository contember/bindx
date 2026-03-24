/**
 * Column type definitions — headless behavior layer for DataGrid columns.
 *
 * Each column type defines how to extract values, create filter handlers,
 * and whether sorting/text search is supported by default.
 *
 * These are framework-agnostic — no React dependency.
 */

import type { FilterHandler, FilterArtifact, EntityAccessor } from '@contember/bindx'
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
	readonly extractValue: (accessor: EntityAccessor<object>, fieldName: string) => TValue
}

export function defineColumnType<TValue, TFilterArtifact extends FilterArtifact>(
	def: ColumnTypeDef<TValue, TFilterArtifact>,
): ColumnTypeDef<TValue, TFilterArtifact> {
	return def
}

// ============================================================================
// Value Extractors
// ============================================================================

/**
 * Access a field on an EntityAccessor by name.
 * EntityAccessor is a Proxy — bracket notation triggers the proxy get trap.
 */
export function accessField(accessor: EntityAccessor<object>, fieldName: string): unknown {
	// EntityAccessor is a Proxy — bracket access goes through the get trap
	return (accessor as unknown as Record<string, unknown>)[fieldName]
}

function extractScalarValue<T>(accessor: EntityAccessor<object>, fieldName: string): T | null {
	const fieldRef = accessField(accessor, fieldName) as { value?: unknown } | null
	if (!fieldRef || typeof fieldRef !== 'object') return null
	return (fieldRef.value ?? null) as T | null
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
	extractValue: (accessor, fieldName) => accessField(accessor, fieldName) ?? null,
})

export const hasManyColumnDef: ColumnTypeDef<unknown, RelationFilterArtifact> = defineColumnType({
	name: 'hasMany',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createRelationFilterHandler,
	extractValue: (accessor, fieldName) => accessField(accessor, fieldName) ?? null,
})
