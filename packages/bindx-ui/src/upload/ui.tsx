import { type ReactNode } from 'react'
import { Loader } from '#bindx-ui/ui/loader'
import { uic } from '../utils/uic.js'

export const UploaderDropzoneWrapperUI = uic('div', {
	baseClass: 'rounded-sm border border-gray-200 p-1 shadow-sm',
	displayName: 'UploaderDropzoneWrapperUI',
})

export const UploaderDropzoneAreaUI = uic('div', {
	baseClass: `
		flex flex-col gap-1 justify-center items-center py-6 border-dashed border-2 border-gray-300 rounded-md relative
		transition-colors
		hover:border-gray-400 hover:bg-gray-50 hover:cursor-pointer
		data-[dropzone-accept]:border-green-500 data-[dropzone-accept]:bg-green-50
		data-[dropzone-reject]:border-red-500 data-[dropzone-reject]:bg-red-50
	`,
	variants: {
		size: {
			square: 'h-40 w-40',
			wide: 'w-full',
		},
	},
	defaultVariants: {
		size: 'wide',
	},
	displayName: 'UploaderDropzoneAreaUI',
})

export const UploaderInactiveDropzoneUI = ({ children }: { children?: ReactNode }): ReactNode => (
	<div className="h-40 w-40 flex flex-col pointer-events-none relative">
		<Loader position="absolute" />
		{children}
	</div>
)

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
