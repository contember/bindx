import { uic } from '../utils/uic.js'
import { XIcon } from 'lucide-react'

export const MultiSelectItemWrapperUI = uic('div', {
	baseClass: 'flex flex-wrap gap-1 items-center justify-start',
})

export const MultiSelectItemUI = uic('span', {
	baseClass: 'flex items-stretch border border-gray-200 rounded-sm hover:shadow-sm transition-all',
})

export const MultiSelectItemContentUI = uic('span', {
	baseClass: 'rounded-l px-2 py-1 bg-background',
})

export const MultiSelectItemRemoveButtonUI = uic('span', {
	baseClass: 'bg-gray-100 border-l border-gray-200 py-1 px-2 rounded-r text-black inline-flex items-center justify-center hover:bg-gray-300',
	afterChildren: <XIcon className={'w-3 h-3'} />,
	defaultProps: {
		tabIndex: 0,
		role: 'button',
		onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
			if (e.key === 'Enter' || e.key === ' ') {
				;(e.currentTarget as HTMLElement).click()
				e.preventDefault()
			}
		},
	},
})
