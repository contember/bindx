/**
 * Select — headless single-select component for has-one relations.
 *
 * Manages selection state for a has-one relation field and provides
 * context for descendant components (SelectDataView, SelectOption, etc.).
 *
 * Usage:
 * ```tsx
 * <Select relation={article.category} options={schema.Category}>
 *   <SelectDataView queryField={['name']}>
 *     ...options rendering...
 *   </SelectDataView>
 * </Select>
 * ```
 */

import { type ReactNode, useCallback, useMemo } from 'react'
import type { EntityRef, EntityDef, HasOneRef } from '@contember/bindx'
import { useHasOne } from '@contember/bindx-react'
import { isPlaceholderId } from '@contember/bindx'
import {
	SelectCurrentEntitiesContext,
	SelectHandleSelectContext,
	SelectIsSelectedContext,
	SelectOptionsContext,
	type SelectAction,
	type SelectEvents,
	type SelectHandler,
} from './selectContext.js'

export interface SelectProps extends SelectEvents {
	/** Has-one relation ref from parent entity */
	relation: HasOneRef<object>
	/** Entity definition for the options list */
	options: EntityDef
	children: ReactNode
}

export function Select({
	relation,
	options,
	children,
	onSelect,
	onUnselect,
}: SelectProps): ReactNode {
	const accessor = useHasOne(relation)
	const entity = accessor.$entity
	const entityId = entity.id
	const isConnected = !isPlaceholderId(entityId)
	const currentId = isConnected ? entityId : null

	const entitiesArr = useMemo(
		(): readonly EntityRef<object>[] =>
			isConnected ? [entity as EntityRef<object>] : [],
		[isConnected, entity],
	)

	const handleSelect = useCallback<SelectHandler>(
		(selected: EntityRef<object>, action: SelectAction = 'toggle') => {
			if (action === 'toggle') {
				action = selected.id === currentId ? 'unselect' : 'select'
			}
			if (action === 'unselect') {
				relation.$disconnect()
				onUnselect?.(selected)
			} else if (action === 'select') {
				relation.$connect(selected.id)
				onSelect?.(selected)
			}
		},
		[relation, currentId, onSelect, onUnselect],
	)

	const isSelected = useCallback(
		(entity: EntityRef<object>): boolean => entity.id === currentId,
		[currentId],
	)

	return (
		<SelectCurrentEntitiesContext.Provider value={entitiesArr}>
			<SelectIsSelectedContext.Provider value={isSelected}>
				<SelectHandleSelectContext.Provider value={handleSelect}>
					<SelectOptionsContext.Provider value={options}>
						{children}
					</SelectOptionsContext.Provider>
				</SelectHandleSelectContext.Provider>
			</SelectIsSelectedContext.Provider>
		</SelectCurrentEntitiesContext.Provider>
	)
}
