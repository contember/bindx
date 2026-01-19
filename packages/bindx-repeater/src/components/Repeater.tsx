import React, { useMemo, type ReactElement, type ReactNode } from 'react'
import type {
	EntityAccessor,
	HasManyRef,
	AnyBrand,
	SelectionFieldMeta,
	SelectionMeta,
} from '@contember/bindx'
import { SelectionScope, FIELD_REF_META } from '@contember/bindx'
import { createCollectorProxy, mergeSelections, BINDX_COMPONENT, type SelectionProvider } from '@contember/bindx-react'
import type {
	RepeaterProps,
	RepeaterItems,
	RepeaterItemInfo,
	RepeaterMethods,
	RepeaterAddItemIndex,
	RepeaterPreprocessCallback,
} from '../types.js'
import { useSortedItems } from '../hooks/useSortedItems.js'
import { sortEntities } from '../utils/sortEntities.js'
import { repairEntitiesOrder } from '../utils/repairEntitiesOrder.js'
import { arrayMove } from '../utils/arrayMove.js'

/**
 * Main repeater component for rendering has-many relations with full type safety.
 *
 * Uses a callback-style API where types flow from the `field` prop through
 * the `items.map()` callback, ensuring compile-time type safety.
 *
 * @example
 * ```tsx
 * <Repeater field={author.articles} sortableBy="order">
 *   {(items, { addItem, isEmpty }) => (
 *     <>
 *       {isEmpty && <p>No articles</p>}
 *
 *       {items.map((article, { index, isFirst, isLast, remove, moveUp, moveDown }) => (
 *         <div key={article.id}>
 *           {article.title.value}
 *           <button onClick={remove}>Remove</button>
 *           <button onClick={moveUp} disabled={isFirst}>↑</button>
 *           <button onClick={moveDown} disabled={isLast}>↓</button>
 *         </div>
 *       ))}
 *
 *       <button onClick={() => addItem()}>Add</button>
 *     </>
 *   )}
 * </Repeater>
 * ```
 */
export function Repeater<
	TEntity extends object = object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
>({
	field,
	sortableBy,
	children,
}: RepeaterProps<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>): ReactElement {
	const sortedItems = useSortedItems(field, sortableBy)

	// Create stable items collection object
	const items = useMemo((): RepeaterItems<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema> => {
		const createItemInfo = (
			entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>,
			index: number,
		): RepeaterItemInfo => {
			const isFirst = index === 0
			const isLast = index === sortedItems.length - 1

			const remove = (): void => {
				if (sortableBy) {
					const items = sortEntities(field.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
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
				const items = sortEntities(field.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
				const currentIndex = items.findIndex(item => item.id === entity.id)
				if (currentIndex === -1 || currentIndex === 0) return
				const newItems = arrayMove(items, currentIndex, currentIndex - 1)
				repairEntitiesOrder(newItems, sortableBy)
			}

			const moveDown = (): void => {
				if (!sortableBy || isLast) return
				const items = sortEntities(field.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
				const currentIndex = items.findIndex(item => item.id === entity.id)
				if (currentIndex === -1 || currentIndex === items.length - 1) return
				const newItems = arrayMove(items, currentIndex, currentIndex + 1)
				repairEntitiesOrder(newItems, sortableBy)
			}

			return { index, isFirst, isLast, remove, moveUp, moveDown }
		}

		return {
			map: <R,>(
				fn: (
					entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>,
					info: RepeaterItemInfo,
				) => R,
			): R[] => {
				return sortedItems.map((entity, index) => {
					const info = createItemInfo(entity, index)
					return fn(entity, info)
				})
			},
			length: sortedItems.length,
		}
	}, [sortedItems, field, sortableBy])

	// Create methods object
	const methods = useMemo((): RepeaterMethods<TEntity> => {
		const addItem = (
			index: RepeaterAddItemIndex = 'last',
			preprocess?: RepeaterPreprocessCallback<TEntity>,
		): void => {
			if (!sortableBy) {
				if (index === 'last' || index === undefined) {
					const entityId = field.add()
					if (preprocess) {
						const items = field.items
						const newEntity = items.find(item => item.id === entityId)
						if (newEntity) {
							preprocess(newEntity as unknown as EntityAccessor<TEntity>)
						}
					}
					return
				}
				throw new Error('Cannot add item at specific index without sortableBy field')
			}

			const sortedItems = sortEntities(field.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]

			const resolvedIndex = (() => {
				switch (index) {
					case 'first':
						return 0
					case 'last':
					case undefined:
						return sortedItems.length
					default:
						return index
				}
			})()

			const entityId = field.add()
			const items = field.items
			const newEntity = items.find(item => item.id === entityId)

			if (newEntity) {
				const newSortedItems = [...sortedItems]
				newSortedItems.splice(resolvedIndex, 0, newEntity as EntityAccessor<TEntity, TSelected>)
				repairEntitiesOrder(newSortedItems, sortableBy)

				if (preprocess) {
					preprocess(newEntity as unknown as EntityAccessor<TEntity>)
				}
			}
		}

		return {
			addItem,
			isEmpty: field.length === 0,
		}
	}, [field, sortableBy])

	// Call children with items and methods
	return <>{children(items, methods)}</>
}

// Static method for selection extraction
const repeaterWithSelection = Repeater as typeof Repeater & SelectionProvider & { [BINDX_COMPONENT]: true }

repeaterWithSelection.getSelection = (
	props: RepeaterProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]

	// Create scope and collector proxy
	const scope = new SelectionScope()
	const collectorEntity = createCollectorProxy<unknown>(scope)

	// Create mock items object for collection phase
	const mockItems: RepeaterItems<unknown> = {
		map: (fn) => {
			// Invoke callback with collector proxy to track field access
			fn(collectorEntity, {
				index: 0,
				isFirst: true,
				isLast: true,
				remove: () => {},
				moveUp: () => {},
				moveDown: () => {},
			})
			return []
		},
		length: 0,
	}

	// Create mock methods
	const mockMethods: RepeaterMethods<unknown> = {
		addItem: () => {},
		isEmpty: true,
	}

	// Invoke children callback - this tracks all field access
	const syntheticChildren = props.children(mockItems, mockMethods)

	// Also analyze JSX structure
	const jsxSelection = collectNested(syntheticChildren)

	// Merge both tracking methods
	const nestedSelection = scope.toSelectionMeta()
	mergeSelections(nestedSelection, jsxSelection)

	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: true,
		isRelation: true,
		nested: nestedSelection,
	}
}

repeaterWithSelection[BINDX_COMPONENT] = true

export { repeaterWithSelection as RepeaterWithMeta }
