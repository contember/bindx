import { FilterIcon, FilterXIcon } from 'lucide-react'
import { forwardRef } from 'react'
import { dict } from '../../dict.js'
import { Button } from '#bindx-ui/ui/button'

export const DataGridFilterActionButtonUI = forwardRef<HTMLButtonElement, object>((props, ref) => {
	return (
		<Button
			variant="outline"
			size="sm"
			className="space-x-1 data-[active]:text-blue-600 data-[active]:bg-gray-50 data-[active]:shadow-inner"
			ref={ref}
			{...props}
		>
			<FilterIcon className="w-3 h-3" />
			<span>{dict.datagrid.filter}</span>
		</Button>
	)
})
DataGridFilterActionButtonUI.displayName = 'DataGridFilterActionButtonUI'

export const DataGridExcludeActionButtonUI = forwardRef<HTMLButtonElement, object>((props, ref) => {
	return (
		<Button
			variant="outline"
			size="sm"
			className="space-x-1 data-[active]:text-blue-600 data-[active]:bg-gray-50 data-[active]:shadow-inner"
			ref={ref}
			{...props}
		>
			<FilterXIcon className="w-3 h-3" />
			<span>{dict.datagrid.exclude}</span>
		</Button>
	)
})
DataGridExcludeActionButtonUI.displayName = 'DataGridExcludeActionButtonUI'
