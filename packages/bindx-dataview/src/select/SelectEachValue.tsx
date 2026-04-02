/**
 * SelectEachValue — iterates over currently selected entities.
 *
 * Renders its children once for each selected entity,
 * providing the entity accessor and index.
 *
 * Usage:
 * ```tsx
 * <SelectEachValue>
 *   {(entity) => <span>{entity.name.value}</span>}
 * </SelectEachValue>
 * ```
 */

import React, { type ReactNode } from 'react'
import type { EntityRef } from '@contember/bindx'
import { useSelectCurrentEntities } from './selectContext.js'

export interface SelectEachValueProps {
	children: (entity: EntityRef<object>, index: number) => ReactNode
}

export function SelectEachValue({ children }: SelectEachValueProps): ReactNode {
	const entities = useSelectCurrentEntities()
	return (
		<>
			{entities.map((entity, index) => (
				<React.Fragment key={entity.id}>
					{children(entity, index)}
				</React.Fragment>
			))}
		</>
	)
}
