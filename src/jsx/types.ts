import type { ReactNode } from 'react'

/**
 * Marker symbol for identifying bindx components
 */
export const BINDX_COMPONENT = Symbol('BINDX_COMPONENT')

/**
 * Marker symbol for field reference metadata
 */
export const FIELD_REF_META = Symbol('FIELD_REF_META')

/**
 * Base metadata for all field references
 */
export interface FieldRefMeta {
	readonly path: string[]
	readonly fieldName: string
	readonly isArray: boolean
	readonly isRelation: boolean
}

/**
 * Reference to a scalar field - works in both collection and runtime phases
 */
export interface FieldRef<T> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Current value (null in collection phase, real value in runtime) */
	readonly value: T | null

	/** Server value for dirty tracking */
	readonly serverValue: T | null

	/** Whether value differs from server */
	readonly isDirty: boolean

	/** Update the value */
	setValue(value: T | null): void

	/** Input binding props */
	readonly inputProps: {
		value: T | null
		setValue: (value: T | null) => void
	}
}

/**
 * Reference to a has-many relation
 */
export interface HasManyRef<T> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Number of items */
	readonly length: number

	/** Whether any item has been modified */
	readonly isDirty: boolean

	/** Iterate over items */
	map<R>(fn: (item: EntityRef<T>, index: number) => R): R[]

	/** Add a new item */
	add(data?: Partial<T>): void

	/** Remove item by key */
	remove(key: string): void
}

/**
 * Reference to a has-one relation
 */
export interface HasOneRef<T> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Entity ID (null if disconnected) */
	readonly id: string | null

	/** Whether relation is dirty */
	readonly isDirty: boolean

	/** Nested entity fields */
	readonly fields: EntityFields<T>

	/** Connect to existing entity */
	connect(id: string): void

	/** Disconnect relation */
	disconnect(): void
}

/**
 * Extract scalar field keys from entity type
 */
type ScalarKeys<T> = {
	[K in keyof T]: T[K] extends (infer _U)[]
		? never
		: NonNullable<T[K]> extends object
			? K extends 'id'
				? K
				: never
			: K
}[keyof T]

/**
 * Extract has-many relation keys from entity type
 */
type HasManyKeys<T> = {
	[K in keyof T]: T[K] extends (infer _U)[] ? K : never
}[keyof T]

/**
 * Extract has-one relation keys from entity type
 */
type HasOneKeys<T> = {
	[K in keyof T]: T[K] extends (infer _U)[]
		? never
		: NonNullable<T[K]> extends object
			? K extends 'id'
				? never
				: K
			: never
}[keyof T]

/**
 * Map entity fields to their corresponding ref types
 */
export type EntityFields<T> = {
	[K in ScalarKeys<T>]: FieldRef<T[K]>
} & {
	[K in HasManyKeys<T>]: HasManyRef<T[K] extends (infer U)[] ? U : never>
} & {
	[K in HasOneKeys<T>]: HasOneRef<NonNullable<T[K]>>
}

/**
 * Reference to an entity - provides typed field access
 */
export interface EntityRef<T> {
	/** Entity ID */
	readonly id: string

	/** Typed field accessors */
	readonly fields: EntityFields<T>

	/** Raw data snapshot */
	readonly data: T | null

	/** Whether entity is dirty */
	readonly isDirty: boolean
}

/**
 * Selection metadata collected during first pass
 */
export interface JsxSelectionMeta {
	fields: Map<string, JsxSelectionFieldMeta>
}

/**
 * Metadata for a single field in selection
 */
export interface JsxSelectionFieldMeta {
	fieldName: string
	path: string[]
	isArray: boolean
	isRelation: boolean
	nested?: JsxSelectionMeta
	hasManyParams?: {
		filter?: unknown
		orderBy?: unknown
		limit?: number
		offset?: number
	}
}

/**
 * Props for Field component
 */
export interface FieldProps<T> {
	field: FieldRef<T>
	children?: (accessor: FieldRef<T>) => ReactNode
	format?: (value: T | null) => ReactNode
}

/**
 * Options for HasMany relation
 */
export interface HasManyComponentOptions {
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
}

/**
 * Props for HasMany component
 */
export interface HasManyProps<T> {
	field: HasManyRef<T>
	children: (item: EntityRef<T>, index: number) => ReactNode
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
}

/**
 * Props for HasOne component
 */
export interface HasOneProps<T> {
	field: HasOneRef<T>
	children: (entity: EntityRef<T>) => ReactNode
}

/**
 * Props for Entity component
 */
export interface EntityComponentProps<TSchema, K extends keyof TSchema> {
	name: K
	id: string
	children: (entity: EntityRef<TSchema[K]>) => ReactNode
}

/**
 * Props for If conditional component
 */
export interface IfProps {
	condition: boolean | FieldRef<boolean>
	then: ReactNode
	else?: ReactNode
}

/**
 * Interface for components that can provide selection info
 */
export interface SelectionProvider {
	getSelection(
		props: unknown,
		collectNested: (children: ReactNode) => JsxSelectionMeta,
	): JsxSelectionFieldMeta | JsxSelectionFieldMeta[] | null
}
