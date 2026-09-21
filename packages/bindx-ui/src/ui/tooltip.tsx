/**
 * Hover/focus panel anchored to its trigger, rendered in a portal.
 *
 * The panel must leave the trigger's box: a datagrid cell is free to clip its
 * own content — a line clamp cannot be written without `overflow: hidden` — and
 * a clipping ancestor swallows an absolutely positioned descendant whatever its
 * z-index, because clipping is not paint order.
 *
 * It is a popover rather than a tooltip: the panel holds the cell's filter
 * actions, and a `role="tooltip"` must not contain interactive elements.
 */
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../utils/cn.js'

export interface TooltipProps {
	children: ReactNode
	content: ReactNode
	/** Applied to the trigger wrapper, not to the panel. */
	className?: string
	side?: 'top' | 'bottom'
}

/** The pointer crosses the gap between trigger and panel on its way over. */
const CLOSE_DELAY_MS = 150

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(({
	children,
	content,
	className,
	side = 'bottom',
}, ref) => {
	const [open, setOpen] = useState(false)
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Focus moves into the panel only when the keyboard opened it. A hover must
	// leave focus wherever the user put it.
	const openedByFocus = useRef(false)

	const cancelClose = useCallback((): void => {
		if (closeTimer.current !== null) {
			clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}, [])

	const scheduleClose = useCallback((): void => {
		cancelClose()
		closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
	}, [cancelClose])

	const openFor = useCallback((source: 'pointer' | 'focus'): void => {
		cancelClose()
		openedByFocus.current = source === 'focus'
		setOpen(true)
	}, [cancelClose])

	useEffect(() => cancelClose, [cancelClose])

	return (
		<PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
			{/* Trigger rather than Anchor: Radix excludes the trigger's subtree from
			    its outside-dismissal, so focusing the label does not close the panel. */}
			<PopoverPrimitive.Trigger asChild>
				<div
					ref={ref}
					data-bindx-tooltip=""
					className={cn('inline-block', className)}
					onPointerEnter={() => openFor('pointer')}
					onPointerLeave={scheduleClose}
					onFocus={() => openFor('focus')}
					onBlur={scheduleClose}
				>
					{children}
				</div>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					data-bindx-tooltip-panel=""
					side={side}
					sideOffset={6}
					onOpenAutoFocus={event => {
						if (!openedByFocus.current) event.preventDefault()
					}}
					onPointerEnter={cancelClose}
					onPointerLeave={scheduleClose}
					onFocus={cancelClose}
					onBlur={scheduleClose}
					className={cn(
						'z-50 rounded-md border border-gray-200 bg-white/90 backdrop-blur-sm shadow-md px-2 py-1.5',
						'whitespace-nowrap outline-hidden',
						'data-[state=open]:animate-in data-[state=open]:fade-in-0',
						'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
					)}
				>
					{content}
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	)
})
Tooltip.displayName = 'Tooltip'
