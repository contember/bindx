/**
 * Schema type definitions for bindx.
 * Provides type-safe entity and relation definitions.
 */

/**
 * Relation type discriminator
 */
export type RelationType = 'hasOne' | 'hasMany'

/**
 * Scalar field definition
 */
export interface ScalarFieldDef {
	readonly type: 'scalar'
}

/**
 * Has-one relation definition
 */
export interface HasOneRelationDef<TTarget extends string = string> {
	readonly type: 'hasOne'
	readonly target: TTarget
	/** Inverse field name on the target entity (for bidirectional relations) */
	readonly inverse?: string
}

/**
 * Has-many relation definition
 */
export interface HasManyRelationDef<TTarget extends string = string> {
	readonly type: 'hasMany'
	readonly target: TTarget
	/** Inverse field name on the target entity (for bidirectional relations) */
	readonly inverse?: string
}

/**
 * Union of all field definition types
 */
export type FieldDef<TTarget extends string = string> =
	| ScalarFieldDef
	| HasOneRelationDef<TTarget>
	| HasManyRelationDef<TTarget>

/**
 * Entity schema definition - maps field names to their definitions
 */
export interface EntitySchemaDef<TEntityNames extends string = string> {
	readonly fields: Record<string, FieldDef<TEntityNames>>
}

/**
 * Complete schema definition mapping entity names to their schemas.
 * TModels provides the TypeScript types for each entity.
 */
export interface SchemaDefinition<
	TModels extends { [K in keyof TModels]: object },
	TEntityNames extends string = keyof TModels & string,
> {
	readonly entities: {
		[K in TEntityNames]: EntitySchemaDef<TEntityNames>
	}
}

/**
 * Helper function to create a scalar field definition
 */
export function scalar(): ScalarFieldDef {
	return { type: 'scalar' }
}

/**
 * Helper function to create a has-one relation definition
 */
export function hasOne<TTarget extends string>(
	target: TTarget,
	options?: { inverse?: string },
): HasOneRelationDef<TTarget> {
	return {
		type: 'hasOne',
		target,
		inverse: options?.inverse,
	}
}

/**
 * Helper function to create a has-many relation definition
 */
export function hasMany<TTarget extends string>(
	target: TTarget,
	options?: { inverse?: string },
): HasManyRelationDef<TTarget> {
	return {
		type: 'hasMany',
		target,
		inverse: options?.inverse,
	}
}

/**
 * Helper function to define a complete schema with full type inference.
 *
 * @example
 * ```typescript
 * interface Author {
 *   id: string
 *   name: string
 *   articles: Article[]
 * }
 *
 * interface Article {
 *   id: string
 *   title: string
 *   author: Author
 * }
 *
 * const schema = defineSchema<{
 *   Author: Author
 *   Article: Article
 * }>({
 *   entities: {
 *     Author: {
 *       fields: {
 *         id: scalar(),
 *         name: scalar(),
 *         articles: hasMany('Article', { inverse: 'author' })
 *       }
 *     },
 *     Article: {
 *       fields: {
 *         id: scalar(),
 *         title: scalar(),
 *         author: hasOne('Author', { inverse: 'articles' })
 *       }
 *     }
 *   }
 * })
 * ```
 */
export function defineSchema<TModels extends { [K in keyof TModels]: object }>(
	definition: SchemaDefinition<TModels>,
): SchemaDefinition<TModels> {
	return definition
}

/**
 * Infers the model type for a given entity name from a schema
 */
export type InferModel<
	TSchema extends SchemaDefinition<any>,
	TEntityName extends keyof TSchema['entities'],
> = TSchema extends SchemaDefinition<infer TModels>
	? TEntityName extends keyof TModels
		? TModels[TEntityName]
		: never
	: never

/**
 * Infers all entity names from a schema
 */
export type InferEntityNames<TSchema extends SchemaDefinition<any>> = keyof TSchema['entities'] & string
