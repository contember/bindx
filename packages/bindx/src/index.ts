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
	EntityDef,
	InferEntityDef,
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
	EntityFieldsAccessor,
	EntityFieldsRef,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	FieldRefMeta,
	// Ref types (pointer, no data access)
	FieldRef,
	HasManyRef,
	HasOneRef,
	HasOneRefInterface,
	EntityRef,
	EntityRefInterface,
	// Accessor types (live data access, extends Ref)
	FieldAccessor,
	HasManyAccessor,
	HasOneAccessor,
	EntityAccessor,
	// Type extraction helpers
	ExtractHasOneEntityName,
	ExtractHasManyEntityName,
	ExtractRoleMap,
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
	UniqueWhereValue,
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
export { scalar, hasOne, hasMany, defineSchema, entityDef, roleEntityDef, SchemaRegistry, ContemberSchema, SchemaLoader } from './schema/index.js'

// Role types
export type {
	UnionToIntersection,
	RoleNames,
	CommonEntity,
	EntityForRoles,
	ResolveEntity,
	SingleRoleMap,
	DefaultRole,
} from './schema/index.js'
export { DEFAULT_ROLE } from './schema/index.js'

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
export { createFragment, buildQueryFromSelection, SELECTION_META, createSelectionBuilder, SelectionMetaCollector, mergeSelections, createEmptySelection, SelectionScope } from './selection/index.js'
export type { HasManyParams } from './selection/index.js'

// Handles
export { EntityHandle, HasOneHandle, HasManyListHandle, FieldHandle } from './handles/index.js'

// Handle symbols
export { FIELD_REF_META } from './handles/index.js'

// Adapter
export { MockAdapter, ContemberAdapter, unwrapPaginateFields } from './adapter/index.js'

// Core
export { createEntityLoader, resolveSelectionMeta, buildQuery } from './core/index.js'

// Actions
export {
	setEntityData,
	setLoadState,
	setField,
	resetEntity,
	commitEntity,
	connectRelation,
	disconnectRelation,
	deleteRelation,
	setPersisting,
	addFieldError,
	clearFieldErrors,
	addEntityError,
	clearEntityErrors,
	addRelationError,
	clearRelationErrors,
	clearAllServerErrors,
	clearAllErrors,
} from './core/actions.js'

// Store
export { SnapshotStore, type HasManyRemovalType, isTempId, isPlaceholderId, isPersistedId, generatePlaceholderId } from './store/SnapshotStore.js'
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
	UpdateMode,
} from './persistence/index.js'

// Utils
export { deepEqual } from './utils/deepEqual.js'
export { generateHasManyAlias } from './utils/aliasGenerator.js'

// Contember integration
export { MutationCollector, ContemberSchemaMutationAdapter, type SchemaNames } from './contember/index.js'
export type { MutationSchemaProvider, EntityMutationResult } from './contember/index.js'

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
	ErrorCategory,
	BindxError,
	ClientError,
	ServerError,
	LoadError,
	FieldError,
	ErrorState,
	ErrorInput,
	PathElement,
	ContemberMutationError,
	ContemberValidationError,
	ContemberMutationResult,
	ResolvedErrorTarget,
	ResolvedError,
	ErrorPathContext,
} from './errors/index.js'

export {
	ExecutionErrorTypes,
	isExecutionErrorType,
	classifyError,
	isRetryableCategory,
	createClientError,
	createServerError,
	createLoadError,
	isClientError,
	isServerError,
	isLoadError,
	filterErrorsBySource,
	filterStickyErrors,
	UnfetchedFieldError,
	resolveErrorPath,
	resolveAllErrors,
} from './errors/index.js'


// Re-export bindx-client types
export {
	ContentClient,
	type ContentClientOptions,
	type ContentQuery,
	type ContentMutation,
	ContentOperation,
	type MutationResult as ClientMutationResult,
	MutationFailedError,
	type QuerySpecContext,
	querySpecToGraphQl,
	buildGetArgs,
	buildListArgs,
	buildCreateArgs,
	buildUpdateArgs,
	buildDeleteArgs,
	buildMutationSelection,
	mutationFragments,
	unwrapPaginateResult,
} from '@contember/bindx-client'
export { qb } from '@contember/bindx-client'

// DataView / DataGrid
export type {
	TextFilterArtifact,
	NumberFilterArtifact,
	NumberRangeFilterArtifact,
	DateFilterArtifact,
	BooleanFilterArtifact,
	EnumFilterArtifact,
	EnumListFilterArtifact,
	RelationFilterArtifact,
	IsDefinedFilterArtifact,
	FilterArtifact,
	FilterHandler,
	ColumnType,
	ColumnDefinition,
	SortingDirections,
	SortingDirectionAction,
	SortingState,
	PagingState,
	PagingInfo,
	DataViewLayout,
	SelectionValues,
	SelectionState,
} from './dataview/index.js'

export {
	createTextFilterHandler,
	createFullTextFilterHandler,
	createNumberFilterHandler,
	createNumberRangeFilterHandler,
	createDateFilterHandler,
	createBooleanFilterHandler,
	createEnumFilterHandler,
	createEnumListFilterHandler,
	createRelationFilterHandler,
	createIsDefinedFilterHandler,
} from './dataview/index.js'

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
