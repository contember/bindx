/**
 * Simple CSS-based tooltip using Tailwind group-hover.
 */
import { forwardRef, type ReactNode } from 'react'
import { cn } from '../utils/cn.js'

export interface TooltipProps {
	children: ReactNode
	content: ReactNode
	className?: string
	side?: 'top' | 'bottom'
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(({
	children,
	content,
	className,
	side = 'bottom',
}, ref) => {
	const positionClass = side === 'top'
		? 'bottom-full mb-1.5'
		: 'top-full mt-1.5'

	return (
		<div ref={ref} className={cn('group/tooltip relative inline-block', className)}>
			{children}
			<div
				className={cn(
					'invisible opacity-0 group-hover/tooltip:visible group-hover/tooltip:opacity-100',
					'transition-all duration-150 absolute z-50 left-1/2 -translate-x-1/2',
					'rounded-md border border-gray-200 bg-white/90 backdrop-blur-sm shadow-md px-2 py-1.5',
					'whitespace-nowrap',
					positionClass,
				)}
			>
				{content}
			</div>
		</div>
	)
})
Tooltip.displayName = 'Tooltip'
