import { uic } from '../utils/uic.js'
import { dict } from '../dict.js'

export const SelectInputWrapperUI = uic('div', {
	baseClass: 'w-full max-w-md relative',
})

export const SelectInputUI = uic('button', {
	baseClass: [
		'flex gap-2 justify-between items-center',
		'w-full min-h-10',
		'px-2 py-1',
		'bg-background',
		'rounded-md border border-input ring-offset-background',
		'text-sm text-left',
		'cursor-pointer',
		'hover:border-gray-400',
		'placeholder:text-muted-foreground',
		'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
	],
})

export const SelectInputActionsUI = uic('span', {
	baseClass: 'flex gap-1 items-center',
})

export const SelectDefaultPlaceholderUI = (): React.ReactElement => <span className={'text-gray-400'}>{dict.select.placeholder}</span>
