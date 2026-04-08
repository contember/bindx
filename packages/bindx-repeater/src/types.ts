import type { ReactNode } from 'react'
import type { EntityAccessor, HasManyRef, AnyBrand, FieldRef } from '@contember/bindx'

/**
 * Index for adding items to the repeater.
 * - number: Adds at the specified index
 * - 'first': Adds at the beginning
 * - 'last' or undefined: Adds at the end
 */
export type RepeaterAddItemIndex = number | 'first' | 'last' | undefined

/**
 * Index for moving items within the repeater.
 * - number: Moves to the specified index
 * - 'first': Moves to the beginning
 * - 'last': Moves to the end
 * - 'previous': Moves to the previous position
 * - 'next': Moves to the next position
 */
export type RepeaterMoveItemIndex = number | 'first' | 'last' | 'previous' | 'next'

/**
 * Callback for preprocessing a newly created entity.
 */
export type RepeaterPreprocessCallback<T> = (entity: EntityAccessor<T>) => void

/**
 * Information about a single repeater item, passed to the map callback.
 */
export interface RepeaterItemInfo {
	/** Index of the item in the sorted list */
	index: number

	/** Whether this is the first item */
	isFirst: boolean

	/** Whether this is the last item */
	isLast: boolean

	/** Remove this item from the repeater */
	remove: () => void

	/** Move this item up (to previous position). Only available when sortableBy is defined. */
	moveUp: () => void

	/** Move this item down (to next position). Only available when sortableBy is defined. */
	moveDown: () => void
}

/**
 * Items collection object passed to the repeater render function.
 * Provides a type-safe map() method for iterating over items.
 */
export interface RepeaterItems<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/**
	 * Map over items with full type safety.
	 * Each item receives the entity accessor and item info (index, isFirst, isLast, remove, moveUp, moveDown).
	 */
	map: <R>(
		fn: (
			entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>,
			info: RepeaterItemInfo,
		) => R
	) => R[]

	/** Number of items in the repeater */
	length: number
}

/**
 * Methods available at the repeater level for adding items.
 */
export interface RepeaterMethods<T = unknown> {
	/**
	 * Adds a new item to the repeater.
	 * @param index - Where to add the item (default: 'last')
	 * @param preprocess - Optional callback to preprocess the new entity
	 */
	addItem: (index?: RepeaterAddItemIndex, preprocess?: RepeaterPreprocessCallback<T>) => void

	/** Whether the repeater is empty */
	isEmpty: boolean
}

/**
 * Render function type for the Repeater component.
 */
export type RepeaterRenderFn<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = (
	items: RepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema>,
	methods: RepeaterMethods<TEntity>,
) => ReactNode

/**
 * Props for the Repeater component.
 * Types flow from the field prop to the children callback for full type safety.
 */
export interface RepeaterProps<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** The has-many relation field */
	field: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>

	/** Optional field name for sorting (must be a numeric field) */
	sortableBy?: string

	/** Render function that receives items collection and methods */
	children: RepeaterRenderFn<TEntity, TSelected, TBrand, TEntityName, TSchema>
}

// ============================================================================
// Block Repeater Types
// ============================================================================

/**
 * Block definition for headless use.
 * Optional render/form functions declare block-specific field selections.
 */
export interface BlockDefinition<TEntity extends object = object, TSelected = TEntity> {
	label?: ReactNode
	/**
	 * Called during selection collection to discover field dependencies for this block type.
	 * Receives a collector proxy entity and block info.
	 * Return JSX that accesses all fields this block type needs.
	 *
	 * When present, core getSelection calls this directly per block type
	 * instead of relying on the children callback for field discovery.
	 */
	staticRender?: (entity: EntityAccessor<object>, info: BlockRepeaterItemInfo) => ReactNode
}

/**
 * Extended item info with block type discrimination.
 */
export interface BlockRepeaterItemInfo extends RepeaterItemInfo {
	/** Value of the discrimination field */
	blockType: string | null
	/** Resolved block definition, undefined if block type is unknown */
	block: { name: string; label?: ReactNode } | undefined
}

/**
 * Items collection for BlockRepeater with BlockRepeaterItemInfo.
 */
export interface BlockRepeaterItems<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	map: <R>(
		fn: (
			entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>,
			info: BlockRepeaterItemInfo,
		) => R,
	) => R[]

	/** Number of items in the repeater */
	length: number
}

/**
 * Methods for BlockRepeater — addItem requires a block type.
 */
export interface BlockRepeaterMethods<TBlockNames extends string> {
	/** Add a new item with the given block type */
	addItem: (type: TBlockNames, index?: RepeaterAddItemIndex) => void

	/** Whether the repeater is empty */
	isEmpty: boolean

	/** List of all defined blocks */
	blockList: ReadonlyArray<{ name: TBlockNames; label?: ReactNode }>
}

/**
 * Render function type for BlockRepeater.
 */
export type BlockRepeaterRenderFn<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
	TBlockNames extends string = string,
> = (
	items: BlockRepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema>,
	methods: BlockRepeaterMethods<TBlockNames>,
) => ReactNode

/**
 * Props for the BlockRepeater component.
 */
export interface BlockRepeaterProps<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
	TBlockNames extends string = string,
> {
	/** The has-many relation field */
	field: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>

	/** Name of the scalar field used to discriminate block types */
	discriminationField: string

	/** Optional field name for sorting (must be a numeric field) */
	sortableBy?: string

	/** Block definitions keyed by block type name */
	blocks: Record<TBlockNames, BlockDefinition>

	/** Render function that receives items collection and methods */
	children?: BlockRepeaterRenderFn<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>
}
