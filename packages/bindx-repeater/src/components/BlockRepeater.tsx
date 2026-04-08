import React, { useMemo, type ReactElement, type ReactNode } from 'react'
import type {
	EntityAccessor,
	HasManyRef,
	AnyBrand,
	SelectionFieldMeta,
	SelectionMeta,
	FieldRef,
} from '@contember/bindx'
import { SelectionScope, FIELD_REF_META } from '@contember/bindx'
import { createCollectorProxy, mergeSelections, BINDX_COMPONENT, SCOPE_REF, type SelectionProvider, useHasMany, useField } from '@contember/bindx-react'
import type {
	BlockRepeaterProps,
	BlockRepeaterItems,
	BlockRepeaterItemInfo,
	BlockRepeaterMethods,
	BlockDefinition,
	RepeaterAddItemIndex,
} from '../types.js'
import { useSortedItems } from '../hooks/useSortedItems.js'
import { sortEntities } from '../utils/sortEntities.js'
import { repairEntitiesOrder } from '../utils/repairEntitiesOrder.js'
import { arrayMove } from '../utils/arrayMove.js'

/**
 * Block repeater component for has-many relations with type discrimination.
 *
 * Each item has a discrimination field that determines its block type,
 * allowing different rendering based on the block type.
 *
 * @example
 * ```tsx
 * <BlockRepeater
 *   field={entity.blocks}
 *   discriminationField="type"
 *   sortableBy="order"
 *   blocks={{
 *     text: { label: 'Text' },
 *     image: { label: 'Image' },
 *   }}
 * >
 *   {(items, methods) => (
 *     <>
 *       {items.map((item, info) => {
 *         switch (info.blockType) {
 *           case 'text': return <div key={item.id}>{item.content.value}</div>
 *           case 'image': return <img key={item.id} src={item.url.value} />
 *           default: return null
 *         }
 *       })}
 *       {methods.blockList.map(b => (
 *         <button key={b.name} onClick={() => methods.addItem(b.name)}>
 *           Add {b.label ?? b.name}
 *         </button>
 *       ))}
 *     </>
 *   )}
 * </BlockRepeater>
 * ```
 */
export function BlockRepeater<
	TEntity extends object = object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
	TBlockNames extends string = string,
>({
	field,
	discriminationField,
	sortableBy,
	blocks,
	children,
}: BlockRepeaterProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactElement | null {
	const fieldAccessor = useHasMany(field)
	const sortedItems = useSortedItems(fieldAccessor, sortableBy)

	const items = useMemo((): BlockRepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema> => {
		const createItemInfo = (
			entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>,
			index: number,
		): BlockRepeaterItemInfo => {
			const isFirst = index === 0
			const isLast = index === sortedItems.length - 1

			const discriminationRef = (entity.$fields as Record<string, unknown>)[discriminationField] as import('@contember/bindx').FieldAccessor<string> | undefined
			const blockType = discriminationRef?.value ?? null
			const blockDef = blockType !== null ? (blocks as Record<string, BlockDefinition>)[blockType] : undefined
			const block = blockDef !== undefined && blockType !== null
				? { name: blockType, label: blockDef.label }
				: undefined

			const remove = (): void => {
				if (sortableBy) {
					const items = sortEntities(fieldAccessor.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
					const currentIndex = items.findIndex(item => item.id === entity.id)
					if (currentIndex !== -1) {
						items.splice(currentIndex, 1)
						repairEntitiesOrder(items, sortableBy)
					}
				}
				field.remove(entity.id)
			}

			const moveUp = (): void => {
				if (!sortableBy || isFirst) return
				const items = sortEntities(fieldAccessor.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
				const currentIndex = items.findIndex(item => item.id === entity.id)
				if (currentIndex === -1 || currentIndex === 0) return
				const newItems = arrayMove(items, currentIndex, currentIndex - 1)
				repairEntitiesOrder(newItems, sortableBy)
			}

			const moveDown = (): void => {
				if (!sortableBy || isLast) return
				const items = sortEntities(fieldAccessor.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
				const currentIndex = items.findIndex(item => item.id === entity.id)
				if (currentIndex === -1 || currentIndex === items.length - 1) return
				const newItems = arrayMove(items, currentIndex, currentIndex + 1)
				repairEntitiesOrder(newItems, sortableBy)
			}

			return { index, isFirst, isLast, remove, moveUp, moveDown, blockType, block }
		}

		return {
			map: <R,>(
				fn: (
					entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>,
					info: BlockRepeaterItemInfo,
				) => R,
			): R[] => {
				return sortedItems.map((entity, index) => {
					const info = createItemInfo(entity, index)
					return fn(entity, info)
				})
			},
			length: sortedItems.length,
		}
	}, [sortedItems, field, sortableBy, discriminationField, blocks])

	const methods = useMemo((): BlockRepeaterMethods<TBlockNames> => {
		const blockList = (Object.keys(blocks) as TBlockNames[]).map(name => ({
			name,
			label: (blocks as Record<string, BlockDefinition>)[name]?.label,
		}))

		const addItem = (
			type: TBlockNames,
			index: RepeaterAddItemIndex = 'last',
		): void => {
			if (!sortableBy) {
				if (index === 'last' || index === undefined) {
					const entityId = field.add()
					const items = fieldAccessor.items
					const newEntity = items.find(item => item.id === entityId)
					if (newEntity) {
						const discriminationRef = (newEntity.$fields as Record<string, unknown>)[discriminationField] as import('@contember/bindx').FieldAccessor<string> | undefined
						discriminationRef?.setValue(type)
					}
					return
				}
				throw new Error('Cannot add item at specific index without sortableBy field')
			}

			const currentItems = sortEntities(fieldAccessor.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]

			const resolvedIndex = (() => {
				switch (index) {
					case 'first':
						return 0
					case 'last':
					case undefined:
						return currentItems.length
					default:
						return index
				}
			})()

			const entityId = field.add()
			const items = fieldAccessor.items
			const newEntity = items.find(item => item.id === entityId)

			if (newEntity) {
				const newSortedItems = [...currentItems]
				newSortedItems.splice(resolvedIndex, 0, newEntity as EntityAccessor<TEntity, TSelected>)
				repairEntitiesOrder(newSortedItems, sortableBy)

				const discriminationRef = (newEntity.$fields as Record<string, unknown>)[discriminationField] as import('@contember/bindx').FieldAccessor<string> | undefined
				discriminationRef?.setValue(type)
			}
		}

		return {
			addItem,
			isEmpty: fieldAccessor.length === 0,
			blockList,
		}
	}, [field, sortableBy, blocks, discriminationField])

	if (!children) {
		return null
	}
	return <>{children(items, methods)}</>
}

// Factory wraps getSelection assignment to avoid module-level side effects
// which Vite dep optimizer (Rolldown with moduleSideEffects: false) would strip.
function createBlockRepeaterWithSelection() {
	const component = BlockRepeater as typeof BlockRepeater & SelectionProvider & { [BINDX_COMPONENT]: true }
	component[BINDX_COMPONENT] = true

	component.getSelection = (
		props: BlockRepeaterProps<unknown>,
		collectNested: (children: ReactNode) => SelectionMeta,
	): SelectionFieldMeta | null => {
	// Check if the field is a collector proxy with a scope reference (collection phase).
	// When present, we merge the collected selection directly into the scope tree,
	// which correctly handles deeply nested relations (e.g., page.blocks.items).
	const fieldScope = props.field && typeof props.field === 'object' && SCOPE_REF in props.field
		? (props.field as Record<symbol, unknown>)[SCOPE_REF] as SelectionScope
		: null

	const scope = new SelectionScope()
	const collectorEntity = createCollectorProxy<object>(scope)

	const blockNames = Object.keys(props.blocks) as string[]
	const blocksRecord = props.blocks as Record<string, BlockDefinition>

	// Path 1: collect field deps from block renderers
	// Calls staticRender if present, or any other callable properties (render, form)
	// that accept (entity, info) and return ReactNode.
	for (const blockName of blockNames) {
		const block = blocksRecord[blockName]
		if (!block) continue

		const mockInfo: BlockRepeaterItemInfo = {
			index: 0,
			isFirst: true,
			isLast: true,
			remove: () => {},
			moveUp: () => {},
			moveDown: () => {},
			blockType: blockName,
			block: { name: blockName, label: block.label },
		}

		const renderers = block.staticRender
			? [block.staticRender]
			: collectBlockRenderers(block)

		for (const renderer of renderers) {
			const jsx = renderer(collectorEntity, mockInfo)
			if (jsx) {
				collectNested(jsx)
			}
		}
	}

	// Path 2: children callback — for headless use or when blocks lack staticRender
	let jsxSelection: SelectionMeta | undefined
	if (props.children) {
		const mockItems: BlockRepeaterItems<unknown> = {
			map: (fn) => {
				for (const blockName of blockNames) {
					fn(collectorEntity, {
						index: 0,
						isFirst: true,
						isLast: true,
						remove: () => {},
						moveUp: () => {},
						moveDown: () => {},
						blockType: blockName,
						block: { name: blockName, label: blocksRecord[blockName]?.label },
					})
				}
				// Also call with null blockType for any fallback/default rendering paths
				fn(collectorEntity, {
					index: 0,
					isFirst: true,
					isLast: true,
					remove: () => {},
					moveUp: () => {},
					moveDown: () => {},
					blockType: null,
					block: undefined,
				})
				return []
			},
			length: 0,
		}

		const mockMethods: BlockRepeaterMethods<string> = {
			addItem: () => {},
			isEmpty: true,
			blockList: [],
		}

		const syntheticChildren = props.children(mockItems, mockMethods)
		jsxSelection = collectNested(syntheticChildren)
	}

	const nestedSelection = scope.toSelectionMeta()
	if (jsxSelection) {
		mergeSelections(nestedSelection, jsxSelection)
	}

	// Add discrimination field to selection
	nestedSelection.fields.set(props.discriminationField, {
		fieldName: props.discriminationField,
		alias: props.discriminationField,
		path: [props.discriminationField],
		isArray: false,
		isRelation: false,
	})

	// Add sortableBy field to selection if specified
	if (props.sortableBy) {
		nestedSelection.fields.set(props.sortableBy, {
			fieldName: props.sortableBy,
			alias: props.sortableBy,
			path: [props.sortableBy],
			isArray: false,
			isRelation: false,
		})
	}

	// If we have a scope reference, merge directly into the scope tree and return null
	// (no flat SelectionFieldMeta needed — the scope tree captures the full nesting)
	if (fieldScope) {
		fieldScope.mergeFromSelectionMeta(nestedSelection)
		return null
	}

	// Fallback: return SelectionFieldMeta for non-collector refs (e.g., explicit selection)
	const meta = props.field[FIELD_REF_META]
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: true,
		isRelation: true,
		nested: nestedSelection,
	}
}

	return component
}

export const BlockRepeaterWithMeta = createBlockRepeaterWithSelection()

type BlockRenderer = (entity: EntityAccessor<object>, info: BlockRepeaterItemInfo) => ReactNode

/**
 * Discovers callable renderer functions on a block definition (e.g., render, form).
 * Used during selection collection to call all renderers with a collector proxy.
 */
function collectBlockRenderers(block: BlockDefinition): BlockRenderer[] {
	const renderers: BlockRenderer[] = []
	for (const value of Object.values(block)) {
		if (typeof value === 'function') {
			renderers.push(value as BlockRenderer)
		}
	}
	return renderers
}
