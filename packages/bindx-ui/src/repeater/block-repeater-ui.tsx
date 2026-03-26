import { uic } from '../utils/uic.js'

export const BlockRepeaterItemUI = uic('div', {
	baseClass: 'rounded-lg border border-gray-200 bg-white relative group/repeater-item shadow-sm',
})

export const BlockRepeaterItemContentUI = uic('div', {
	baseClass: 'p-4',
})

export const BlockRepeaterItemActionsUI = uic('div', {
	baseClass: 'absolute top-2 right-2 flex gap-1 opacity-0 group-hover/repeater-item:opacity-100 transition-opacity',
})
