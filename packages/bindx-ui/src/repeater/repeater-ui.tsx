import { uic } from '../utils/uic.js'

export const RepeaterWrapperUI = uic('div', {
	baseClass: 'flex flex-col gap-2 relative bg-background mb-4',
})

export const RepeaterItemUI = uic('div', {
	baseClass: 'rounded-sm border border-gray-200 bg-gray-50 p-4 relative group/repeater-item',
})

export const RepeaterEmptyUI = uic('div', {
	baseClass: 'italic text-sm text-gray-600',
})

export const RepeaterItemActionsUI = uic('div', {
	baseClass: 'absolute top-1 right-2 flex gap-2',
})
