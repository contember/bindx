import { CheckIcon } from 'lucide-react'
import { uic } from '../utils/uic.js'
import { Button } from '#bindx-ui/ui/button'

export const SelectListItemUI = uic(Button, {
	baseClass: 'w-full text-left justify-start gap-1 data-[highlighted]:bg-gray-200 data-[selected]:bg-gray-100 group relative min-h-8 h-auto',
	defaultProps: {
		variant: 'ghost',
		size: 'sm',
	},
	afterChildren: <CheckIcon className="h-3 w-3 opacity-0 group-data-[selected]:opacity-100 ml-auto" />,
})

// Re-export all split UI components for backward compatibility
export {
	SelectInputWrapperUI,
	SelectInputUI,
	SelectInputActionsUI,
	SelectDefaultPlaceholderUI,
} from '#bindx-ui/select/input-ui'

export {
	MultiSelectItemWrapperUI,
	MultiSelectItemUI,
	MultiSelectItemContentUI,
	MultiSelectItemRemoveButtonUI,
} from '#bindx-ui/select/multi-select-ui'

export {
	SelectPopoverContent,
	SelectCreateNewTrigger,
} from '#bindx-ui/select/popover-ui'
