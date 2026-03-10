/**
 * Core types for the DataView/DataGrid system.
 *
 * These types are framework-agnostic and define the filter artifact system,
 * filter handlers, sorting state, and paging state.
 */

import type { EntityWhere, EntityOrderBy, OrderDirection } from '../selection/queryTypes.js'

// ============================================================================
// Filter Artifact Types
// ============================================================================

/**
 * Text filter artifact - stored as user's filter state
 */
export interface TextFilterArtifact {
	readonly mode: 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'notContains'
	readonly query: string
	readonly nullCondition?: boolean
}

/**
 * Number filter artifact
 */
export interface NumberFilterArtifact {
	readonly mode: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
	readonly value: number | null
	readonly nullCondition?: boolean
}

/**
 * Number range filter artifact
 */
export interface NumberRangeFilterArtifact {
	readonly min: number | null
	readonly max: number | null
	readonly nullCondition?: boolean
}

/**
 * Date filter artifact
 */
export interface DateFilterArtifact {
	readonly start: string | null
	readonly end: string | null
	readonly nullCondition?: boolean
}

/**
 * Boolean filter artifact
 */
export interface BooleanFilterArtifact {
	readonly includeTrue?: boolean
	readonly includeFalse?: boolean
	readonly nullCondition?: boolean
}

/**
 * Enum filter artifact
 */
export interface EnumFilterArtifact {
	readonly values?: readonly string[]
	readonly notValues?: readonly string[]
	readonly nullCondition?: boolean
}

/**
 * Relation filter artifact (hasOne/hasMany)
 */
export interface RelationFilterArtifact {
	readonly id?: readonly string[]
	readonly notId?: readonly string[]
	readonly nullCondition?: boolean
}

/**
 * Enum list filter artifact - for array enum fields (uses 'includes' condition)
 */
export interface EnumListFilterArtifact {
	readonly values?: readonly string[]
	readonly notValues?: readonly string[]
	readonly nullCondition?: boolean
}

/**
 * IsDefined filter artifact
 */
export interface IsDefinedFilterArtifact {
	readonly defined: boolean | null
}

/**
 * Union of all filter artifact types
 */
export type FilterArtifact =
	| TextFilterArtifact
	| NumberFilterArtifact
	| NumberRangeFilterArtifact
	| DateFilterArtifact
	| BooleanFilterArtifact
	| EnumFilterArtifact
	| EnumListFilterArtifact
	| RelationFilterArtifact
	| IsDefinedFilterArtifact

// ============================================================================
// Filter Handler
// ============================================================================

/**
 * Filter handler converts a filter artifact into an EntityWhere clause.
 * Returns undefined when the filter is not active (artifact is empty/default).
 */
export interface FilterHandler<TArtifact = FilterArtifact> {
	/** Convert artifact to where clause */
	toWhere(artifact: TArtifact): Record<string, unknown> | undefined

	/** Check if artifact represents an active filter */
	isActive(artifact: TArtifact): boolean

	/** Create default (empty/inactive) artifact */
	defaultArtifact(): TArtifact
}

// ============================================================================
// Column Definition Types
// ============================================================================

/**
 * Column type discriminator
 */
export type ColumnType = 'text' | 'number' | 'date' | 'dateTime' | 'boolean' | 'enum' | 'enumList' | 'uuid' | 'isDefined' | 'hasOne' | 'hasMany' | 'action' | 'custom'

/**
 * Base column definition - framework-agnostic metadata
 */
export interface ColumnDefinition {
	/** Column type */
	readonly type: ColumnType
	/** Field name on the entity (null for action columns) */
	readonly field: string | null
	/** Whether this column supports sorting */
	readonly sortable: boolean
	/** Filter handler for this column (null if no filtering) */
	readonly filterHandler: FilterHandler | null
	/** Initial filter artifact (null if no filtering) */
	readonly filterArtifact: FilterArtifact | null
}

// ============================================================================
// Sorting State
// ============================================================================

/**
 * Sorting directions - map of field → direction.
 * Supports multi-column sorting (order of keys = sort priority).
 */
export type SortingDirections = Readonly<Record<string, OrderDirection>>

/**
 * Sorting direction action for triggers
 */
export type SortingDirectionAction = OrderDirection | 'next' | 'toggleAsc' | 'toggleDesc' | 'clear'

/**
 * Sorting state - supports multiple sorted columns
 */
export interface SortingState {
	readonly directions: SortingDirections
}

// ============================================================================
// Selection State (Column Visibility + Layout)
// ============================================================================

/**
 * Layout definition for DataView
 */
export interface DataViewLayout {
	readonly name: string
	readonly label?: string
}

/**
 * Selection values - current layout + column visibility
 */
export interface SelectionValues {
	readonly layout?: string
	readonly visibility: Readonly<Record<string, boolean>>
}

/**
 * Selection state - includes values + available layouts
 */
export interface SelectionState {
	readonly values: SelectionValues
	readonly layouts: readonly DataViewLayout[]
}

// ============================================================================
// Paging State
// ============================================================================

/**
 * Paging state
 */
export interface PagingState {
	readonly pageIndex: number
	readonly itemsPerPage: number
}

/**
 * Paging info (computed from state + data)
 */
export interface PagingInfo {
	readonly totalCount: number | null
	readonly totalPages: number | null
}
