/**
 * Composable sorting UI components using Radix Slot pattern.
 *
 * Usage:
 * ```tsx
 * <DataViewSortingTrigger field={it.title}>
 *   <button>Sort by Title</button>
 * </DataViewSortingTrigger>
 *
 * <DataViewSortingSwitch field={it.title}
 *   asc={<span>↑</span>}
 *   desc={<span>↓</span>}
 *   none={<span>↕</span>}
 * />
 * ```
 */

import React, { forwardRef, type ReactElement, useCallback } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { useDataViewContext } from './DataViewContext.js'
import { dataAttribute } from './dataAttribute.js'
import type { SortingDirectionAction, OrderDirection, FieldRefBase } from '@contember/bindx'

// ============================================================================
// DataViewSortingTrigger
// ============================================================================

export interface DataViewSortingTriggerProps<T> {
	/** Field to sort by */
	field: FieldRefBase<T>
	/** Sorting action. Default: 'next' (cycles asc → desc → none) */
	action?: SortingDirectionAction
	/** Button element to render */
	children: ReactElement
}

const actionToState: Record<Exclude<SortingDirectionAction, OrderDirection>, OrderDirection | null> = {
	next: null,
	toggleAsc: 'asc',
	toggleDesc: 'desc',
	clear: null,
}

export const DataViewSortingTrigger = forwardRef<HTMLButtonElement, DataViewSortingTriggerProps<unknown>>(
	({ action = 'next', field, ...props }, ref) => {
		const { sorting } = useDataViewContext()
		const orderDirection = sorting.directionOf(field)

		const changeOrder = useCallback(
			(e: React.MouseEvent): void => {
				sorting.setOrderBy(field, action, e.ctrlKey || e.metaKey)
			},
			[field, action, sorting],
		)

		const active = !!action
			&& action !== 'next'
			&& action !== 'clear'
			&& orderDirection === (action === 'toggleAsc' ? 'asc' : action === 'toggleDesc' ? 'desc' : action)

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, changeOrder)}
				data-active={dataAttribute(active)}
				data-current={orderDirection ?? 'none'}
				{...otherProps}
			/>
		)
	},
) as <T>(props: DataViewSortingTriggerProps<T> & React.RefAttributes<HTMLButtonElement>) => ReactElement | null
;(DataViewSortingTrigger as React.FC).displayName = 'DataViewSortingTrigger'

// ============================================================================
// DataViewSortingSwitch
// ============================================================================

export interface DataViewSortingSwitchProps<T> {
	/** Field to check sorting direction for */
	field: FieldRefBase<T>
	/** Render when sorted ascending */
	asc?: React.ReactNode
	/** Render when sorted descending */
	desc?: React.ReactNode
	/** Render when not sorted */
	none?: React.ReactNode
}

export function DataViewSortingSwitch<T>({
	field,
	asc,
	desc,
	none,
}: DataViewSortingSwitchProps<T>): ReactElement {
	const { sorting } = useDataViewContext()
	const direction = sorting.directionOf(field)

	if (direction === 'asc') return <>{asc ?? null}</>
	if (direction === 'desc') return <>{desc ?? null}</>
	return <>{none ?? null}</>
}
