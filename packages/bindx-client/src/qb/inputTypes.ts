/**
 * Type-safe mutation input types derived from entity model types.
 *
 * These mirror the approach in @contember/client-content's ContentClientInput,
 * but derive types structurally from the entity model (TEntity) rather than
 * from a separate EntityTypeLike shape.
 */

// ============================================================================
// Helpers for discriminating field types from entity model
// ============================================================================

/** Detects if T is a plain object (not Date, Function, Array, etc.) */
type IsPlainObject<T> =
	T extends Date ? false
	: T extends Function ? false
	: T extends readonly unknown[] ? false
	: T extends object ? true
	: false

/** Extract scalar (non-relation) keys from an entity */
type ScalarKeys<T> = {
	[K in keyof T]: K extends 'id' ? never
		: NonNullable<T[K]> extends readonly unknown[] ? never
		: IsPlainObject<NonNullable<T[K]>> extends true ? never
		: K
}[keyof T]

/** Extract has-one relation keys from an entity */
type HasOneKeys<T> = {
	[K in keyof T]: NonNullable<T[K]> extends readonly unknown[] ? never
		: IsPlainObject<NonNullable<T[K]>> extends true ? K
		: never
}[keyof T]

/** Extract has-many relation keys from an entity */
type HasManyKeys<T> = {
	[K in keyof T]: NonNullable<T[K]> extends readonly (infer U)[]
		? IsPlainObject<U> extends true ? K : never
		: never
}[keyof T]

/** Extract the item type from a has-many array field */
type HasManyItem<T, K extends keyof T> = NonNullable<T[K]> extends readonly (infer U)[] ? U : never

// ============================================================================
// UniqueWhere
// ============================================================================

/**
 * Unique where input for identifying a single entity.
 * Always supports `{ id: string }`. Other unique fields can be added via EntityDef.
 */
export type UniqueWhere<_T> = { readonly id: string } & Record<string, unknown>

// ============================================================================
// Create inputs
// ============================================================================

/** Input for creating a has-one relation */
export type CreateOneRelationInput<T> =
	| { readonly connect: UniqueWhere<T> }
	| { readonly create: CreateDataInput<T> }
	| { readonly connectOrCreate: { readonly connect: UniqueWhere<T>; readonly create: CreateDataInput<T> } }

/** Input for creating has-many relations */
export type CreateManyRelationInput<T> = readonly CreateOneRelationInput<T>[]

/** Data input for creating an entity */
export type CreateDataInput<T> =
	& { readonly [K in ScalarKeys<T> & string]?: T[K] }
	& { readonly [K in HasOneKeys<T> & string]?: CreateOneRelationInput<NonNullable<T[K]>> }
	& { readonly [K in HasManyKeys<T> & string]?: CreateManyRelationInput<HasManyItem<T, K>> }

// ============================================================================
// Update inputs
// ============================================================================

/** Input for updating a has-one relation */
export type UpdateOneRelationInput<T> =
	| { readonly create: CreateDataInput<T> }
	| { readonly connect: UniqueWhere<T> }
	| { readonly connectOrCreate: { readonly connect: UniqueWhere<T>; readonly create: CreateDataInput<T> } }
	| { readonly delete: true }
	| { readonly disconnect: true }
	| { readonly update: UpdateDataInput<T> }
	| { readonly upsert: { readonly update: UpdateDataInput<T>; readonly create: CreateDataInput<T> } }

/** Single item in an update-many relation input */
export type UpdateManyRelationInputItem<T> =
	| { readonly create: CreateDataInput<T> }
	| { readonly connect: UniqueWhere<T> }
	| { readonly connectOrCreate: { readonly connect: UniqueWhere<T>; readonly create: CreateDataInput<T> } }
	| { readonly disconnect: UniqueWhere<T> }
	| { readonly delete: UniqueWhere<T> }
	| { readonly update: { readonly by: UniqueWhere<T>; readonly data: UpdateDataInput<T> } }
	| { readonly upsert: { readonly by: UniqueWhere<T>; readonly update: UpdateDataInput<T>; readonly create: CreateDataInput<T> } }

/** Input for updating has-many relations */
export type UpdateManyRelationInput<T> = readonly UpdateManyRelationInputItem<T>[]

/** Data input for updating an entity */
export type UpdateDataInput<T> =
	& { readonly [K in ScalarKeys<T> & string]?: T[K] }
	& { readonly [K in HasOneKeys<T> & string]?: UpdateOneRelationInput<NonNullable<T[K]>> }
	& { readonly [K in HasManyKeys<T> & string]?: UpdateManyRelationInput<HasManyItem<T, K>> }
