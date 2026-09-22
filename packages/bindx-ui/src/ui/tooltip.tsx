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
import { tabbable, type FocusableElement } from 'tabbable'
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
	const interaction = useRef({ pointer: false, focus: false })
	const panelRef = useRef<HTMLDivElement>(null)
	const focusOrigin = useRef<FocusableElement | null>(null)
	const enterOnMount = useRef(false)
	const restoringFocus = useRef(false)

	const cancelClose = useCallback((): void => {
		if (closeTimer.current !== null) {
			clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}, [])

	const scheduleClose = useCallback((source: 'pointer' | 'focus'): void => {
		interaction.current[source] = false
		cancelClose()
		closeTimer.current = setTimeout(() => {
			closeTimer.current = null
			if (!interaction.current.pointer && !interaction.current.focus) setOpen(false)
		}, CLOSE_DELAY_MS)
	}, [cancelClose])

	const openFor = useCallback((source: 'pointer' | 'focus'): void => {
		cancelClose()
		interaction.current[source] = true
		setOpen(true)
	}, [cancelClose])

	const closePanel = (): void => {
		cancelClose()
		interaction.current = { pointer: false, focus: false }
		enterOnMount.current = false
		setOpen(false)
	}

	const returnToTrigger = (): void => {
		closePanel()
		restoringFocus.current = true
		focusOrigin.current?.focus({ preventScroll: true })
		restoringFocus.current = false
	}

	const focusPanel = (): void => {
		const panel = panelRef.current
		if (!panel) return
		const target = tabbable(panel)[0] ?? panel
		target.focus({ preventScroll: true })
	}

	useEffect(() => cancelClose, [cancelClose])

	return (
		<PopoverPrimitive.Root open={open} onOpenChange={nextOpen => {
			if (nextOpen) setOpen(true)
			else closePanel()
		}}>
			{/* Trigger rather than Anchor: Radix excludes the trigger's subtree from
			    its outside-dismissal, so focusing the label does not close the panel. */}
			<PopoverPrimitive.Trigger asChild>
				<div
					ref={ref}
					tabIndex={-1}
					data-bindx-tooltip=""
					className={cn('inline-block', className)}
					onPointerEnter={event => {
						if (!event.currentTarget.contains(document.activeElement)) {
							focusOrigin.current = tabbable(event.currentTarget)[0] ?? event.currentTarget
						}
						openFor('pointer')
					}}
					onPointerLeave={() => scheduleClose('pointer')}
					onFocus={event => {
						focusOrigin.current = event.target
						if (!restoringFocus.current) openFor('focus')
					}}
					onBlur={() => scheduleClose('focus')}
					onKeyDown={event => {
						if (event.key !== 'ArrowDown' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
						if (!(event.target instanceof HTMLElement)) return
						if (event.target.closest('a,button,input,select,textarea,[contenteditable="true"]')) return
						event.preventDefault()
						event.stopPropagation()
						focusOrigin.current = event.target
						if (panelRef.current) focusPanel()
						else {
							enterOnMount.current = true
							openFor('focus')
						}
					}}
				>
					{children}
				</div>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					ref={panelRef}
					data-bindx-tooltip-panel=""
					side={side}
					sideOffset={6}
					onOpenAutoFocus={event => {
						event.preventDefault()
						if (enterOnMount.current) {
							enterOnMount.current = false
							focusPanel()
						}
					}}
					onCloseAutoFocus={event => event.preventDefault()}
					onEscapeKeyDown={event => {
						event.preventDefault()
						if (panelRef.current?.contains(document.activeElement)) returnToTrigger()
						else closePanel()
					}}
					onKeyDownCapture={event => {
						if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
						const stops = tabbable(event.currentTarget)
						const edge = event.shiftKey ? stops[0] : stops[stops.length - 1]
						if (event.target !== edge && event.target !== event.currentTarget) return
						// Bypass Radix's loop; native Tab continues from the original cell.
						event.stopPropagation()
						returnToTrigger()
					}}
					onPointerEnter={() => openFor('pointer')}
					onPointerLeave={() => scheduleClose('pointer')}
					onFocus={() => openFor('focus')}
					onBlur={() => scheduleClose('focus')}
					onFocusOutside={event => {
						if (interaction.current.pointer) event.preventDefault()
					}}
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
