/**
 * Selection components — column visibility + layout switching using Radix Slot.
 *
 * Usage:
 * ```tsx
 * <DataViewVisibilityTrigger name="description">
 *   <button>Toggle Description</button>
 * </DataViewVisibilityTrigger>
 *
 * <DataViewElement name="description">
 *   <DescriptionColumn />
 * </DataViewElement>
 *
 * <DataViewLayout name="table">
 *   <TableView />
 * </DataViewLayout>
 *
 * <DataViewLayoutTrigger name="table">
 *   <button>Table View</button>
 * </DataViewLayoutTrigger>
 * ```
 */

import React, { forwardRef, type ReactElement, useCallback } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { useDataViewContext } from './DataViewContext.js'
import { dataAttribute } from './dataAttribute.js'

// ============================================================================
// Column Visibility
// ============================================================================

export interface DataViewVisibilityTriggerProps {
	/** Element name to toggle */
	name: string
	/** Value to set. Can be boolean or function. Default: toggle */
	value?: boolean | ((current: boolean) => boolean)
	/** Fallback visibility when not explicitly set. Default: true */
	fallbackValue?: boolean
	/** Button element */
	children: ReactElement
}

export const DataViewVisibilityTrigger = forwardRef<HTMLButtonElement, DataViewVisibilityTriggerProps>(
	({ name, value, fallbackValue = true, ...props }, ref) => {
		const { selection } = useDataViewContext()
		const isVisible = selection.isVisible(name, fallbackValue)

		const handleClick = useCallback((): void => {
			if (value === undefined) {
				selection.setVisibility(name, !isVisible)
			} else if (typeof value === 'function') {
				selection.setVisibility(name, value(isVisible))
			} else {
				selection.setVisibility(name, value)
			}
		}, [selection, name, value, isVisible])

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleClick)}
				data-active={dataAttribute(isVisible)}
				data-current={String(isVisible)}
				{...otherProps}
			/>
		)
	},
)
DataViewVisibilityTrigger.displayName = 'DataViewVisibilityTrigger'

// ============================================================================
// Conditional Element (visibility-aware)
// ============================================================================

export interface DataViewElementProps {
	/** Element name (used for visibility toggle) */
	name: string
	/** Label for the element (for UI display) */
	label?: React.ReactNode
	/** Default visibility when not explicitly set. Default: true */
	fallback?: boolean
	children: React.ReactNode
}

export function DataViewElement({
	name,
	fallback = true,
	children,
}: DataViewElementProps): ReactElement | null {
	const { selection } = useDataViewContext()
	const isVisible = selection.isVisible(name, fallback)

	if (!isVisible) return null
	return <>{children}</>
}

/** @deprecated Use DataViewElement instead */
export const DataViewIsVisible = DataViewElement

// ============================================================================
// Layout Switching
// ============================================================================

export interface DataViewLayoutProps {
	/** Layout name */
	name: string
	/** Label for the layout */
	label?: React.ReactNode
	children: React.ReactNode
}

export function DataViewLayout({
	name,
	children,
}: DataViewLayoutProps): ReactElement | null {
	const { selection } = useDataViewContext()
	const currentLayout = selection.currentLayout
	const layouts = selection.state.layouts
	const isActive = currentLayout === name || (currentLayout === undefined && layouts[0]?.name === name)

	if (!isActive) return null
	return <>{children}</>
}

export interface DataViewLayoutTriggerProps {
	/** Layout name to switch to */
	name: string
	/** Button element */
	children: ReactElement
}

export const DataViewLayoutTrigger = forwardRef<HTMLButtonElement, DataViewLayoutTriggerProps>(
	({ name, ...props }, ref) => {
		const { selection } = useDataViewContext()
		const currentLayout = selection.currentLayout
		const layouts = selection.state.layouts
		const isActive = currentLayout === name || (currentLayout === undefined && layouts[0]?.name === name)

		const handleClick = useCallback((): void => {
			selection.setLayout(name)
		}, [selection, name])

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleClick)}
				data-active={dataAttribute(isActive)}
				data-current={currentLayout ?? layouts[0]?.name ?? 'none'}
				{...otherProps}
			/>
		)
	},
)
DataViewLayoutTrigger.displayName = 'DataViewLayoutTrigger'
