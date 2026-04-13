/**
 * @contember/bindx-client
 *
 * Type-safe content client for Contember.
 * Foundation package: schema definitions, selection builder, query builder, and GraphQL execution.
 *
 * @packageDocumentation
 */

// Schema
export {
	type RelationType,
	type ScalarFieldDef,
	type HasOneRelationDef,
	type HasManyRelationDef,
	type HasManyRelationKind,
	type FieldDef,
	type EntitySchemaDef,
	type SchemaDefinition,
	type InferModel,
	type InferEntityNames,
	type EntityDef,
	type InferEntityDef,
	type EnumFieldDef,
	scalar,
	enumScalar,
	hasOne,
	hasMany,
	defineSchema,
	entityDef,
	roleEntityDef,
} from './schema/index.js'

export {
	type UnionToIntersection,
	type RoleNames,
	type CommonEntity,
	type EntityForRoles,
	type ResolveEntity,
	type SingleRoleMap,
	type DefaultRole,
	DEFAULT_ROLE,
} from './schema/index.js'

export { SchemaRegistry } from './schema/index.js'

export {
	type SchemaColumnType,
	type SchemaColumn,
	type SchemaRelationOrderBy,
	type OwningRelation,
	type InverseRelation,
	type SchemaRelation,
	type SchemaField,
	type SchemaEntity,
	type SchemaEnum,
	type ContemberSchemaStore,
	type RawContemberSchema,
	ContemberSchema,
} from './schema/index.js'

export { SchemaLoader, type SchemaLoaderClient } from './schema/index.js'

// Selection
export {
	SELECTION_META,
	type SelectionBuilder,
	type SelectionMeta,
	type SelectionFieldMeta,
	type FluentFragment,
	type FluentDefiner,
	type HasManyOptions,
	type InferSelection,
	type ScalarMethod,
	type HasOneMethod,
	type HasManyMethod,
} from './selection/index.js'

export {
	type EntityWhere,
	type EntityOrderBy,
	type ScalarCondition,
	type OrderDirection,
	type TypedHasManyOptions,
	type AliasOptions,
} from './selection/index.js'

export { createSelectionBuilder, getSelectionMeta } from './selection/index.js'
export { createFragment } from './selection/index.js'
export { buildQueryFromSelection, collectPaths, type QuerySpec, type QueryFieldSpec } from './selection/index.js'
export { SelectionMetaCollector, mergeSelections, createEmptySelection } from './selection/index.js'
export { SelectionScope, type HasManyParams } from './selection/index.js'

// Brand
export { ComponentBrand } from './brand/ComponentBrand.js'
export type { AnyBrand } from './brand/ComponentBrand.js'

// Utils
export { generateHasManyAlias } from './utils/aliasGenerator.js'

// Query Builder (static qb module)
export * as qb from './qb/index.js'

// Mutation input types
export type {
	UniqueWhere,
	CreateDataInput,
	UpdateDataInput,
	CreateOneRelationInput,
	CreateManyRelationInput,
	UpdateOneRelationInput,
	UpdateManyRelationInput,
	UpdateManyRelationInputItem,
} from './qb/inputTypes.js'

// Operations
export { ContentOperation, type ContentQuery, type ContentMutation } from './operations/index.js'
export type {
	MutationResult,
	MutationError,
	MutationErrorPathElement,
	ValidationResult,
	ValidationError,
	TransactionResult,
} from './operations/index.js'
export { MutationFailedError } from './operations/index.js'

// Client
export { ContentClient, type ContentClientOptions } from './client/index.js'

// GraphQL internals (for advanced use)
export { querySpecToGraphQl, unwrapPaginateResult, type QuerySpecContext } from './graphql/index.js'
export { buildTypedArgs, buildListArgs, buildGetArgs, buildCreateArgs, buildUpdateArgs, buildUpsertArgs, buildDeleteArgs } from './graphql/index.js'
export { mutationFragments, buildMutationSelection, buildNodeSelectionFromMutationData } from './graphql/index.js'
