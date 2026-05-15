import { forwardRef } from 'react'
import { uic } from '../utils/uic.js'
import { Button } from '#bindx-ui/ui/button'
import { PopoverContent } from '#bindx-ui/ui/popover'
import { PlusIcon } from 'lucide-react'

export const SelectPopoverContent = uic(PopoverContent, {
	baseClass: 'group w-[max(16rem,var(--radix-popover-trigger-width))]',
	defaultProps: {
		onWheel: (e: React.WheelEvent) => e.stopPropagation(),
	},
})

export const SelectCreateNewTrigger = forwardRef<HTMLButtonElement, object>((props, ref) => (
	<Button variant="outline" size="icon" ref={ref} {...props}>
		<PlusIcon className="w-3 h-3" />
	</Button>
))
SelectCreateNewTrigger.displayName = 'SelectCreateNewTrigger'
