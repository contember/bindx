/**
 * Bindx - Type-safe React data binding framework
 *
 * @packageDocumentation
 */

// ============================================================================
// Public API - Types
// ============================================================================

// Schema types
export type {
	RelationType,
	ScalarFieldDef,
	HasOneRelationDef,
	HasManyRelationDef,
	FieldDef,
	EntitySchemaDef,
	SchemaDefinition,
	InferModel,
	InferEntityNames,
} from './schema/index.js'

// Selection types
export type {
	SelectionBuilder,
	SelectionMeta,
	SelectionFieldMeta,
	FluentFragment,
	FluentDefiner,
	HasManyOptions,
	InferSelection,
	QuerySpec,
	QueryFieldSpec,
} from './selection/index.js'

// Accessor types (interfaces only)
export type {
	FieldAccessor,
	EntityAccessor,
	EntityAccessorBase,
	RootEntityAccessor,
	HasOneAccessor,
	HasOneRelationState,
	PlaceholderEntityAccessor,
	EntityListAccessor,
	EntityListItem,
	AccessorFromShape,
	AccessorFromShapeInternal,
	RelationChange,
} from './accessors/index.js'

// Hook types
export type {
	BindxProviderProps,
	BindxContextValue,
	UseEntityOptions,
	UseEntityListOptions,
	LoadingEntityAccessor,
	ErrorEntityAccessor,
	ReadyEntityAccessor,
	EntityAccessorResult,
	LoadingEntityListAccessor,
	ErrorEntityListAccessor,
	ReadyEntityListAccessor,
	EntityListAccessorResult,
} from './hooks/index.js'

// Handle types
export type { InputProps } from './handles/index.js'

// Adapter types
export type {
	BackendAdapter,
	FetchOptions,
	MockDataStore,
	MockAdapterOptions,
} from './adapter/index.js'

// Core types
export type {
	EntityLoadResult,
	EntityListLoadResult,
	LoadEntityOptions,
	LoadEntityListOptions,
	SelectionInput,
	FluentDefiner as CoreFluentDefiner,
} from './core/index.js'

// Store types
export type {
	EntitySnapshot,
	FieldSnapshot,
	HasOneRelationSnapshot,
	HasManySnapshot,
	EntityState,
	LoadStatus,
} from './store/snapshots.js'

// JSX types
export type {
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	FieldProps,
	HasManyProps,
	HasOneProps,
	IfProps,
	EntityComponentProps,
	HasManyComponentOptions,
	ShowProps,
} from './jsx/index.js'

// Unified handle types
export type {
	EntityFields,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	FieldRefMeta,
} from './handles/index.js'

// ============================================================================
// Public API - Functions & Components
// ============================================================================

// Schema utilities
export { scalar, hasOne, hasMany, defineSchema, SchemaRegistry } from './schema/index.js'

// Selection utilities
export { createFragment, buildQueryFromSelection } from './selection/index.js'

// Hooks
export {
	BindxProvider,
	useBackendAdapter,
	useSnapshotStore,
	useDispatcher,
	usePersistence,
	useBindxContext,
	useIdentityMap, // Legacy alias
	createBindx,
} from './hooks/index.js'

// Handles
export { EntityHandle, HasOneHandle, HasManyListHandle, FieldHandle } from './handles/index.js'

// Adapter
export { MockAdapter } from './adapter/index.js'

// Core
export { createEntityLoader, resolveSelectionMeta, buildQuery } from './core/index.js'

// Store
export { SnapshotStore } from './store/SnapshotStore.js'
export { ActionDispatcher } from './core/ActionDispatcher.js'
export { PersistenceManager } from './core/PersistenceManager.js'

// JSX Components
export {
	Field,
	HasMany,
	HasOne,
	If,
	Show,
	Entity,
	type EntityProps,
	BINDX_COMPONENT,
	FIELD_REF_META,
} from './jsx/index.js'

// ============================================================================
// Internal API (for advanced use cases)
// ============================================================================

/**
 * Internal exports for advanced use cases.
 *
 * @internal
 * @remarks
 * These exports are implementation details and may change without notice.
 * Use the public API whenever possible.
 */
export * as __internal from './internal.js'
