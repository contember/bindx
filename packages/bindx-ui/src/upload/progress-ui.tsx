import { uic } from '../utils/uic.js'

export const UploaderItemUI = uic('div', {
	baseClass: 'rounded-sm border border-gray-200 p-1 shadow-sm bg-gray-100 flex gap-2 relative',
	displayName: 'UploaderItemUI',
})

export const UploaderFileProgressWrapperUI = uic('div', {
	baseClass: 'flex flex-col gap-2 p-3 border rounded-md bg-white',
	displayName: 'UploaderFileProgressWrapperUI',
})

export const UploaderFileProgressInfoUI = uic('div', {
	baseClass: 'flex items-center justify-between gap-4',
	displayName: 'UploaderFileProgressInfoUI',
})

export const UploaderFileProgressFileNameUI = uic('span', {
	baseClass: 'text-sm font-medium truncate',
	displayName: 'UploaderFileProgressFileNameUI',
})

export const UploaderFileProgressActionsUI = uic('div', {
	baseClass: 'flex gap-2 shrink-0',
	displayName: 'UploaderFileProgressActionsUI',
})

export const UploaderFileProgressErrorUI = uic('div', {
	baseClass: 'text-sm text-destructive',
	displayName: 'UploaderFileProgressErrorUI',
})

export const UploaderFileProgressSuccessUI = uic('div', {
	baseClass: 'text-sm text-green-600',
	displayName: 'UploaderFileProgressSuccessUI',
})

export const UploaderRepeaterItemsWrapperUI = uic('div', {
	baseClass: 'flex flex-wrap gap-4',
	displayName: 'UploaderRepeaterItemsWrapperUI',
})

export const UploaderRepeaterItemUI = UploaderItemUI
