/**
 * React Bindx - Type-safe React data binding framework
 *
 * @packageDocumentation
 */

// ============================================================================
// Re-export core types and functions from @contember/bindx
// ============================================================================

export type {
	// Schema types
	RelationType,
	ScalarFieldDef,
	HasOneRelationDef,
	HasManyRelationDef,
	FieldDef,
	EntitySchemaDef,
	SchemaDefinition,
	InferModel,
	InferEntityNames,
	// Selection types
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
	// Handle types
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
	// Adapter types
	BackendAdapter,
	QueryOptions,
	Query,
	GetQuery,
	ListQuery,
	QueryResult,
	GetQueryResult,
	ListQueryResult,
	MockDataStore,
	MockAdapterOptions,
	ContemberAdapterOptions,
	// Core types
	EntityLoadResult,
	EntityListLoadResult,
	LoadEntityOptions,
	LoadEntityListOptions,
	SelectionInput,
	CoreFluentDefiner,
	// Store types
	EntitySnapshot,
	FieldSnapshot,
	HasOneRelationSnapshot,
	HasManySnapshot,
	EntityState,
	LoadStatus,
	// Undo types
	UndoManagerConfig,
	UndoState,
	UndoEntry,
	// Event types
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
	EventTypeMap,
	InterceptorResult,
	Interceptor,
	EventListener,
	Unsubscribe,
	BeforeEventTypes,
	AfterEventTypes,
} from '@contember/bindx'

export {
	// Schema utilities
	scalar,
	hasOne,
	hasMany,
	defineSchema,
	SchemaRegistry,
	// Selection utilities
	createFragment,
	buildQueryFromSelection,
	// Handles
	EntityHandle,
	HasOneHandle,
	HasManyListHandle,
	FieldHandle,
	// Handle symbols
	FIELD_REF_META,
	// Adapter
	MockAdapter,
	ContemberAdapter,
	// Core
	createEntityLoader,
	resolveSelectionMeta,
	buildQuery,
	// Store
	SnapshotStore,
	ActionDispatcher,
	// ID type detection
	isTempId,
	isPlaceholderId,
	isPersistedId,
	generatePlaceholderId,
	// Persistence
	BatchPersister,
	ChangeRegistry,
	// Undo
	UndoManager,
	// Events
	EventEmitter,
	// Internal
	__internal,
} from '@contember/bindx'

// ============================================================================
// React-specific types
// ============================================================================

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
	// Persistence hook types
	PersistApi,
	EntityPersistApi,
	AnyRefWithMeta,
} from './hooks/index.js'

// Persistence types from @contember/bindx
export type {
	DirtyEntity,
	PersistScope,
	AllScope,
	EntityScope,
	FieldsScope,
	RelationScope,
	CustomScope,
	EntityPersistResult,
	PersistenceResult,
	BatchPersistOptions,
} from '@contember/bindx'

// JSX types
export type {
	FieldProps,
	HasManyProps,
	HasOneProps,
	IfProps,
	EntityComponentProps,
	HasManyComponentOptions,
	ShowProps,
	SelectionPropMeta,
	EntityPropKeys,
	EntityFromProp,
	SelectionFromProp,
	ImplicitFragmentProperties,
	// Component builder types
	BindxComponentBase,
	BindxComponent,
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
	CreateComponentFn,
	// Interface types
	InterfaceEntityPropConfig,
	ImplicitInterfaceEntityConfig,
	ExplicitInterfaceEntityConfig,
	AddInterfaces,
	InterfaceSelectorsMap,
	AnyEntityPropConfig,
	// Entity prop config types
	EntityPropConfig,
	ImplicitEntityConfig,
	ExplicitEntityConfig,
	// State helpers
	AddImplicitEntity,
	AddExplicitEntity,
	AddImplicitInterfaceEntity,
	AddExplicitInterfaceEntity,
	SetScalarProps,
	// Props building
	BuildEntityProps,
	BuildProps,
	BuildFragmentProps,
	InitialBuilderState,
} from './jsx/index.js'

// ============================================================================
// React-specific functions & components
// ============================================================================

// Hooks
export {
	BindxProvider,
	useBackendAdapter,
	useSnapshotStore,
	useDispatcher,
	useBatchPersister,
	useBindxContext,
	createBindx,
	// Persistence
	usePersist,
	usePersistEntity,
	// Undo
	useUndo,
	// Events
	useOnEvent,
	useOnEntityEvent,
	useOnFieldEvent,
	useIntercept,
	useInterceptEntity,
	useInterceptField,
	// Contember
	ContemberBindxProvider,
} from './hooks/index.js'

// Undo hook types
export type { UndoHookResult } from './hooks/useUndo.js'


// JSX Components
export {
	Field,
	HasMany,
	HasOne,
	If,
	Show,
	Entity,
	type EntityProps,
	EntityList,
	type EntityListProps,
	BINDX_COMPONENT,
	// Component (unified API)
	isBindxComponent,
	mergeFragments,
	COMPONENT_MARKER,
	COMPONENT_BRAND,
	COMPONENT_SELECTIONS,
	createComponentBuilder,
	getComponentBrand,
	setBrandValidation,
	validateBrand,
} from './jsx/index.js'

// ============================================================================
// Role-based schema types and components
// ============================================================================

export type {
	RoleContextValue,
	EntityContextValue,
	HasRoleProviderValue,
	HasRoleProviderProps,
	RoleAwareEntityProps,
	RoleAwareEntityComponent,
	RoleAwareEntityListProps,
	RoleAwareEntityListComponent,
	HasRoleProps,
	HasRoleComponent,
	RoleAwareUseEntity,
	RoleAwareUseEntityList,
	RoleAwareBindx,
	RoleAwareFragmentFactory,
	RoleAwareFragmentConfigToProps,
	RoleAwareFragmentConfigToFragments,
	RoleAwareExplicitFragmentComponent,
	RoleAwareCreateComponentOptions,
	RoleAwareCreateComponent,
} from './roles/index.js'

export {
	EntityContext,
	useEntityContext,
	createRoleContext,
	createUseRoleContext,
	createRoleAwareBindx,
	HasRoleProvider,
	useHasRoleContext,
	RoleAwareProvider,
} from './roles/index.js'

// Re-export role types from core
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
} from '@contember/bindx'

export { isValidRole, RoleSchemaRegistry } from '@contember/bindx'

// ============================================================================
// Internal React API
// ============================================================================

export {
	SelectionMetaCollector,
	mergeSelections,
	createEmptySelection,
	createCollectorProxy,
	createRuntimeAccessor,
	analyzeJsx,
	collectSelection,
	convertToQuerySelection,
	debugSelection,
} from './jsx/index.js'
