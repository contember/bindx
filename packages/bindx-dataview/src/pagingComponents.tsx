/**
 * Composable paging UI components using Radix Slot pattern.
 *
 * Usage:
 * ```tsx
 * <DataViewChangePageTrigger page="previous">
 *   <button>Previous</button>
 * </DataViewChangePageTrigger>
 *
 * <DataViewChangePageTrigger page="next">
 *   <button>Next</button>
 * </DataViewChangePageTrigger>
 *
 * <DataViewSetItemsPerPageTrigger value={25}>
 *   <button>25 per page</button>
 * </DataViewSetItemsPerPageTrigger>
 *
 * <DataViewPagingStateView>
 *   {({ pageIndex, totalPages }) => <span>Page {pageIndex + 1} of {totalPages}</span>}
 * </DataViewPagingStateView>
 * ```
 */

import React, { forwardRef, type ReactElement, type ReactNode, useCallback } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { useDataViewContext } from './DataViewContext.js'
import { dataAttribute } from './dataAttribute.js'

// ============================================================================
// DataViewChangePageTrigger
// ============================================================================

export interface DataViewChangePageTriggerProps {
	/** Target page: named shortcut or zero-based page index */
	page: 'first' | 'last' | 'next' | 'previous' | number
	/** Button element */
	children: ReactElement
}

export const DataViewChangePageTrigger = forwardRef<HTMLButtonElement, DataViewChangePageTriggerProps>(
	({ page, ...props }, ref) => {
		const { paging } = useDataViewContext()

		const isDisabled = resolveIsDisabled(page, paging.hasPrevious, paging.hasNext, paging.state.pageIndex, paging.info.totalPages)
		const isActive = typeof page === 'number' && page === paging.state.pageIndex

		const handleClick = useCallback((): void => {
			if (page === 'first') paging.first()
			else if (page === 'last') paging.last()
			else if (page === 'next') paging.next()
			else if (page === 'previous') paging.previous()
			else paging.goTo(page)
		}, [paging, page])

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleClick)}
				disabled={isDisabled}
				data-active={dataAttribute(isActive)}
				data-current={String(paging.state.pageIndex)}
				{...otherProps}
			/>
		)
	},
)
DataViewChangePageTrigger.displayName = 'DataViewChangePageTrigger'

function resolveIsDisabled(
	page: DataViewChangePageTriggerProps['page'],
	hasPrevious: boolean,
	hasNext: boolean,
	currentPageIndex: number,
	totalPages: number | null,
): boolean {
	if (page === 'first' || page === 'previous') return !hasPrevious
	if (page === 'next') return !hasNext
	if (page === 'last') return totalPages === null || currentPageIndex >= totalPages - 1
	return page === currentPageIndex
}

// ============================================================================
// DataViewSetItemsPerPageTrigger
// ============================================================================

export interface DataViewSetItemsPerPageTriggerProps {
	/** Items per page to set. null = show all. */
	value: number | null
	/** Button element */
	children: ReactElement
}

export const DataViewSetItemsPerPageTrigger = forwardRef<HTMLButtonElement, DataViewSetItemsPerPageTriggerProps>(
	({ value, ...props }, ref) => {
		const { paging } = useDataViewContext()
		const currentItemsPerPage = paging.state.itemsPerPage === 0 ? null : paging.state.itemsPerPage
		const isActive = currentItemsPerPage === value

		const handleClick = useCallback((): void => {
			paging.setItemsPerPage(value)
		}, [paging, value])

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleClick)}
				data-active={dataAttribute(isActive)}
				{...otherProps}
			/>
		)
	},
)
DataViewSetItemsPerPageTrigger.displayName = 'DataViewSetItemsPerPageTrigger'

// ============================================================================
// DataViewPagingStateView (Contember name) / DataViewPagingInfo (alias)
// ============================================================================

export interface DataViewPagingInfoProps {
	children: (info: {
		pageIndex: number
		totalPages: number | null
		totalCount: number | null
		itemsPerPage: number
	}) => ReactNode
}

export function DataViewPagingStateView({
	children,
}: DataViewPagingInfoProps): ReactElement {
	const { paging } = useDataViewContext()

	return <>{children({
		pageIndex: paging.state.pageIndex,
		totalPages: paging.info.totalPages,
		totalCount: paging.info.totalCount,
		itemsPerPage: paging.state.itemsPerPage,
	})}</>
}

/** Alias for DataViewPagingStateView */
export const DataViewPagingInfo = DataViewPagingStateView

export type DataViewPagingStateViewProps = DataViewPagingInfoProps
