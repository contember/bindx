export {
	type RelationType,
	type ScalarFieldDef,
	type HasOneRelationDef,
	type HasManyRelationDef,
	type FieldDef,
	type EntitySchemaDef,
	type SchemaDefinition,
	type InferModel,
	type InferEntityNames,
	type EntityDef,
	type InferEntityDef,
	scalar,
	enumScalar,
	type EnumFieldDef,
	hasOne,
	hasMany,
	defineSchema,
	entityDef,
	roleEntityDef,
} from './types.js'

export {
	type UnionToIntersection,
	type RoleNames,
	type CommonEntity,
	type EntityForRoles,
	type ResolveEntity,
	type SingleRoleMap,
	type DefaultRole,
	DEFAULT_ROLE,
} from './roles.js'

export { SchemaRegistry } from './SchemaRegistry.js'

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
} from './ContemberSchema.js'

export { SchemaLoader, type SchemaLoaderClient } from './SchemaLoader.js'
