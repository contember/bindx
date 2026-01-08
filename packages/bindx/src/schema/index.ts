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
	scalar,
	hasOne,
	hasMany,
	defineSchema,
} from './types.js'

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
