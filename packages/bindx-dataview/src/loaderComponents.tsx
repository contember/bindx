/**
 * Loader state, reload trigger, and conditional rendering components using Radix Slot.
 *
 * Usage:
 * ```tsx
 * <DataViewReloadTrigger>
 *   <button>Refresh</button>
 * </DataViewReloadTrigger>
 *
 * <DataViewLoaderState loaded={<Table />} refreshing={<Table />} initial={<Loading />} failed={<Error />} />
 *
 * <DataViewEmpty>No results found</DataViewEmpty>
 * <DataViewNonEmpty><Table /></DataViewNonEmpty>
 *
 * <DataViewKeyboardEventHandler>
 *   <div tabIndex={0}>...</div>
 * </DataViewKeyboardEventHandler>
 * ```
 */

import React, { forwardRef, type ReactElement, useCallback } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { useDataViewContext } from './DataViewContext.js'
import type { DataViewLoaderState as DataViewLoaderStateType } from './DataViewContext.js'

// ============================================================================
// Reload Trigger
// ============================================================================

export interface DataViewReloadTriggerProps {
	children: ReactElement
}

export const DataViewReloadTrigger = forwardRef<HTMLButtonElement, DataViewReloadTriggerProps>(
	(props, ref) => {
		const { reload, loaderState } = useDataViewContext()
		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactElement }

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, reload)}
				data-state={loaderState}
				{...otherProps}
			/>
		)
	},
)
DataViewReloadTrigger.displayName = 'DataViewReloadTrigger'

// ============================================================================
// Loader State Switch (Contember: DataViewLoaderState)
// ============================================================================

// ---- DataViewLoaderState (Contember-matching API) ----
// Boolean-prop conditional wrapper: renders children when state matches any true flag

export interface DataViewLoaderStateProps {
	children: React.ReactNode
	/** Render children when data is loaded */
	loaded?: boolean
	/** Render children when refreshing (after initial load) */
	refreshing?: boolean
	/** Render children during initial load */
	initial?: boolean
	/** Render children on failure */
	failed?: boolean
}

export function DataViewLoaderState({
	children,
	...props
}: DataViewLoaderStateProps): ReactElement | null {
	const { loaderState } = useDataViewContext()
	return (props as Record<string, boolean | undefined>)[loaderState] ? <>{children}</> : null
}

// ---- DataViewLoaderStateSwitch (bindx convenience API) ----
// Switch pattern: separate ReactNode per state

export interface DataViewLoaderStateSwitchProps {
	/** Render when data is loaded */
	loaded?: React.ReactNode
	/** Render when refreshing (after initial load) */
	refreshing?: React.ReactNode
	/** Render during initial load */
	initial?: React.ReactNode
	/** Render on failure */
	failed?: React.ReactNode
}

export function DataViewLoaderStateSwitch({
	loaded,
	refreshing,
	initial,
	failed,
}: DataViewLoaderStateSwitchProps): ReactElement {
	const { loaderState } = useDataViewContext()

	switch (loaderState) {
		case 'loaded':
			return <>{loaded ?? null}</>
		case 'refreshing':
			return <>{refreshing ?? loaded ?? null}</>
		case 'initial':
			return <>{initial ?? null}</>
		case 'failed':
			return <>{failed ?? null}</>
	}
}

// ============================================================================
// Hooks
// ============================================================================

export function useDataViewLoaderState(): DataViewLoaderStateType {
	return useDataViewContext().loaderState
}

export function useDataViewReload(): () => void {
	return useDataViewContext().reload
}

export function useDataViewHighlightIndex(): number | null {
	return useDataViewContext().highlightIndex
}

// ============================================================================
// Empty / Non-Empty
// ============================================================================

export interface DataViewEmptyProps {
	children: React.ReactNode
}

export function DataViewEmpty({ children }: DataViewEmptyProps): ReactElement {
	const { loaderState, itemCount } = useDataViewContext()
	if (loaderState !== 'loaded' || itemCount > 0) return <>{null}</>
	return <>{children}</>
}

export interface DataViewNonEmptyProps {
	children: React.ReactNode
}

export function DataViewNonEmpty({ children }: DataViewNonEmptyProps): ReactElement {
	const { loaderState, itemCount } = useDataViewContext()
	if (loaderState !== 'loaded' || itemCount === 0) return <>{null}</>
	return <>{children}</>
}

// ============================================================================
// Each Row
// ============================================================================

export interface DataViewEachRowProps {
	children: (item: { id: string; data: Record<string, unknown> }, index: number) => React.ReactNode
}

export function DataViewEachRow({ children }: DataViewEachRowProps): ReactElement {
	const { items } = useDataViewContext()
	return <>{items.map((item, index) => children(item, index))}</>
}

// ============================================================================
// Highlight Row — Slot-based
// ============================================================================

export interface DataViewHighlightRowProps {
	index: number
	children: ReactElement
}

export const DataViewHighlightRow = forwardRef<HTMLElement, DataViewHighlightRowProps>(
	({ index, ...props }, ref) => {
		const { highlightIndex, setHighlightIndex } = useDataViewContext()
		const isHighlighted = highlightIndex === index

		const handleClick = useCallback((): void => {
			setHighlightIndex(index)
		}, [setHighlightIndex, index])

		const { onClick, ...otherProps } = props as React.HTMLAttributes<HTMLElement> & { children: ReactElement }

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleClick)}
				data-highlighted={isHighlighted ? '' : undefined}
				{...otherProps}
			/>
		)
	},
)
DataViewHighlightRow.displayName = 'DataViewHighlightRow'

// ============================================================================
// Keyboard Event Handler — Slot-based
// ============================================================================

export interface DataViewKeyboardEventHandlerProps {
	children: ReactElement
	onSelectHighlighted?: (item: { id: string; data: Record<string, unknown> }) => void
}

export const DataViewKeyboardEventHandler = forwardRef<HTMLElement, DataViewKeyboardEventHandlerProps>(
	({ onSelectHighlighted, ...props }, ref) => {
		const { items, highlightIndex, setHighlightIndex } = useDataViewContext()

		const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
			if (items.length === 0) return

			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setHighlightIndex(Math.min((highlightIndex ?? -1) + 1, items.length - 1))
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				setHighlightIndex(Math.max((highlightIndex ?? 1) - 1, 0))
			} else if (e.key === 'Escape') {
				setHighlightIndex(null)
			} else if (e.key === 'Enter' && highlightIndex !== null && onSelectHighlighted) {
				const item = items[highlightIndex]
				if (item) onSelectHighlighted(item)
			}
		}, [items, highlightIndex, setHighlightIndex, onSelectHighlighted])

		const { onKeyDown, ...otherProps } = props as React.HTMLAttributes<HTMLElement> & { children: ReactElement }

		return (
			<Slot
				ref={ref}
				onKeyDown={composeEventHandlers(onKeyDown, handleKeyDown)}
				{...otherProps}
			/>
		)
	},
)
DataViewKeyboardEventHandler.displayName = 'DataViewKeyboardEventHandler'
