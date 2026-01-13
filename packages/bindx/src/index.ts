/**
 * Bindx - Core data binding framework (framework-agnostic)
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
	// Query types (typed filter/orderBy)
	EntityWhere,
	EntityOrderBy,
	ScalarCondition,
	OrderDirection,
	TypedHasManyOptions,
	AliasOptions,
} from './selection/index.js'

// Handle types
export type {
	HasOneRelationState,
	InputProps,
	EntityFields,
	SelectedEntityFields,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	FieldRefMeta,
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	EntityRefFor,
} from './handles/index.js'

// Brand types
export type { AnyBrand } from './brand/ComponentBrand.js'
export { ComponentBrand } from './brand/ComponentBrand.js'

// Adapter types
export type {
	BackendAdapter,
	QueryOptions,
	Query,
	GetQuery,
	ListQuery,
	QueryResult,
	GetQueryResult,
	ListQueryResult,
	PersistResult,
	CreateResult,
	DeleteResult,
	MockDataStore,
	MockAdapterOptions,
	ContemberAdapterOptions,
	EntityUniqueWhere,
	TransactionMutation as AdapterTransactionMutation,
	TransactionMutationResult as AdapterTransactionMutationResult,
	TransactionResult as AdapterTransactionResult,
} from './adapter/index.js'

// Core types
export type {
	EntityLoadResult,
	EntityListLoadResult,
	LoadEntityOptions,
	LoadEntityListOptions,
	SelectionInput,
	FluentDefiner as CoreFluentDefiner,
	MutationDataCollector,
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

// ============================================================================
// Public API - Functions & Classes
// ============================================================================

// Schema utilities
export { scalar, hasOne, hasMany, defineSchema, SchemaRegistry, ContemberSchema, SchemaLoader } from './schema/index.js'

// Contember schema types
export type {
	SchemaColumnType,
	SchemaColumn,
	SchemaRelationOrderBy,
	OwningRelation,
	InverseRelation,
	SchemaRelation,
	SchemaField,
	SchemaEntity,
	SchemaEnum,
	ContemberSchemaStore,
	RawContemberSchema,
	SchemaLoaderClient,
} from './schema/index.js'

// Selection utilities
export { createFragment, buildQueryFromSelection, SELECTION_META, createSelectionBuilder, SelectionMetaCollector, mergeSelections, createEmptySelection } from './selection/index.js'

// Handles
export { EntityHandle, HasOneHandle, HasManyListHandle, FieldHandle } from './handles/index.js'

// Handle symbols
export { FIELD_REF_META } from './handles/index.js'

// Adapter
export { MockAdapter, MockMutationCollector, ContemberAdapter } from './adapter/index.js'

// Core
export { createEntityLoader, resolveSelectionMeta, buildQuery } from './core/index.js'

// Actions
export { setEntityData, setLoadState, setField, resetEntity, commitEntity } from './core/actions.js'

// Store
export { SnapshotStore, type HasManyRemovalType } from './store/SnapshotStore.js'
export { ActionDispatcher } from './core/ActionDispatcher.js'

// Persistence
export { BatchPersister, type BatchPersisterOptions } from './persistence/index.js'
export { ChangeRegistry, type DirtyEntity } from './persistence/index.js'
export type {
	AllScope,
	EntityScope,
	FieldsScope,
	RelationScope,
	CustomScope,
	PersistScope,
	FieldPersistResult,
	EntityPersistResult,
	PersistError as PersistenceError,
	PersistenceResult,
	TransactionMutation,
	TransactionMutationResult,
	TransactionResult,
	BatchPersistOptions,
} from './persistence/index.js'

// Utils
export { deepEqual } from './utils/deepEqual.js'

// Contember integration
export { MutationCollector } from './contember/index.js'

// Undo/Redo
export { UndoManager } from './undo/index.js'
export type {
	UndoManagerConfig,
	UndoState,
	UndoEntry,
	PartialStoreSnapshot,
	StoreAffectedKeys,
} from './undo/index.js'

// Store types (for undo)
export type {
	StoredRelationState,
	StoredHasManyState,
	EntityMeta,
} from './store/SnapshotStore.js'

// Event types
export type {
	BindxEvent,
	FieldScopedEvent,
	FieldChangingEvent,
	FieldChangedEvent,
	RelationConnectingEvent,
	RelationConnectedEvent,
	RelationDisconnectingEvent,
	RelationDisconnectedEvent,
	RelationDeletingEvent,
	RelationDeletedEvent,
	HasManyConnectingEvent,
	HasManyConnectedEvent,
	HasManyDisconnectingEvent,
	HasManyDisconnectedEvent,
	EntityPersistingEvent,
	EntityPersistedEvent,
	EntityPersistFailedEvent,
	EntityResettingEvent,
	EntityResetEvent,
	EntityDeletingEvent,
	EntityDeletedEvent,
	ErrorAddedEvent,
	ErrorsClearedEvent,
	LoadStateChangedEvent,
	BeforeEvent,
	AfterEvent,
	AnyBindxEvent,
	BeforeEventType,
	AfterEventType,
	AnyEventType,
	EventTypeMap,
	EventByType,
	InterceptorResult,
	Interceptor,
	EventListener,
	Unsubscribe,
	BeforeEventTypes,
	AfterEventTypes,
	FieldScopedEventTypes,
} from './events/index.js'

export { EventEmitter } from './events/index.js'

// Error types
export type {
	ExecutionErrorType,
	BindxError,
	ClientError,
	ServerError,
	FieldError,
	ErrorState,
	ErrorInput,
	PathElement,
	ContemberMutationError,
	ContemberValidationError,
	MappedError,
	ContemberMutationResult,
} from './errors/index.js'

export {
	createClientError,
	createServerError,
	isClientError,
	isServerError,
	filterErrorsBySource,
	filterStickyErrors,
	mapMutationError,
	mapValidationError,
	extractMappedErrors,
} from './errors/index.js'


// Re-export Contember types for convenience
export type { SchemaNames, SchemaEntityNames } from '@contember/client-content'

// Role-based schema types
export type {
	UnionToIntersection,
	RoleSchemaMap,
	RoleNames,
	IntersectRoleSchemas,
	EntityForRoles,
	SchemaForRole,
	EntityNamesForRoles,
	RoleSchemaDefinitions,
	RoleBindxConfig,
	RolesAreSubset,
	RequireRoleSubset,
	AssertRoleCompatibility,
} from './roles/index.js'

export { isValidRole, RoleSchemaRegistry } from './roles/index.js'

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
