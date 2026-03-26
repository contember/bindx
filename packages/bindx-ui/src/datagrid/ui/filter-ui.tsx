import { CheckSquareIcon, FilterXIcon, PlusIcon, SquareIcon, XIcon } from 'lucide-react'
import { forwardRef, type ReactEventHandler, type ReactNode, useCallback } from 'react'
import { Button } from '#bindx-ui/ui/button'
import { cn } from '../../utils/cn.js'
import { uic } from '../../utils/uic.js'

export const DataGridActiveFilterUI = forwardRef<HTMLButtonElement, {
	children: ReactNode
	className?: string
}>(({ children, className, ...props }, ref) => {
	return (
		<Button
			variant="outline"
			size="sm"
			className={cn('space-x-1 data-[current="none"]:hidden data-[current="exclude"]:line-through h-6', className)}
			ref={ref}
			{...props}
		>
			<span>{children}</span>
			<XIcon className="w-2 h-2" />
		</Button>
	)
})
DataGridActiveFilterUI.displayName = 'DataGridActiveFilterUI'

export const DataGridSingleFilterUI = forwardRef<HTMLDivElement, { children: ReactNode }>((props, ref) => {
	return (
		<div className="flex flex-wrap gap-2 rounded-sm bg-gray-50 items-center text-sm px-2 py-1.5 border border-gray-200" ref={ref} {...props} />
	)
})
DataGridSingleFilterUI.displayName = 'DataGridSingleFilterUI'

export const DataGridFilterSelectTriggerUI = forwardRef<HTMLButtonElement, { children: ReactNode }>(({
	children,
	...props
}, ref) => {
	return (
		<button className="hover:underline inline-flex items-center gap-2 group px-1" ref={ref} {...props}>
			{children && <span className="text-xs font-medium">{children}</span>}
			<span className="bg-gray-100 rounded-full border border-gray-200 group-data-[state=open]:bg-background group-data-[state=open]:shadow-inner h-5 w-5 inline-flex items-center justify-center">
				<PlusIcon className="w-3 h-3" />
			</span>
		</button>
	)
})
DataGridFilterSelectTriggerUI.displayName = 'DataGridFilterSelectTriggerUI'

export interface DataGridFilterSelectItemProps {
	onInclude: () => void
	onExclude: () => void
	isIncluded: boolean
	isExcluded: boolean
	children: ReactNode
}

export const DataGridFilterSelectItemUI = forwardRef<HTMLButtonElement, DataGridFilterSelectItemProps>(({
	children,
	onExclude,
	isExcluded,
	onInclude,
	isIncluded,
	...props
}, ref) => {
	const include = useCallback<ReactEventHandler>(e => {
		onInclude()
		e.preventDefault()
	}, [onInclude])
	const exclude = useCallback<ReactEventHandler>(e => {
		onExclude()
		e.preventDefault()
		e.stopPropagation()
	}, [onExclude])

	return (
		<div className="relative flex gap-1 justify-between items-center">
			<Button
				ref={ref}
				onClick={include}
				size="sm"
				className="pl-1 w-full text-left justify-start gap-1 data-[highlighted]:bg-gray-200"
				variant="ghost"
				{...props}
			>
				{isIncluded ? <CheckSquareIcon className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
				<span className={cn('font-normal', isIncluded && 'text-blue-700')}>
					{children}
				</span>
			</Button>
			<button
				onClick={exclude}
				className={cn(
					'p-1 border border-gray-200 rounded-sm hover:bg-red-200',
					isExcluded ? 'bg-red-300 shadow-inner' : '',
				)}
			>
				<FilterXIcon className="h-3 w-3" />
			</button>
		</div>
	)
})
DataGridFilterSelectItemUI.displayName = 'DataGridFilterSelectItemUI'

export const DataGridToolbarWrapperUI = uic('div', {
	baseClass: 'flex flex-col md:flex-row gap-2 md:items-end mb-4 items-stretch',
	variants: {
		sticky: {
			true: 'sticky -top-4 z-50 bg-background border-b border-gray-200 py-4',
		},
	},
})
