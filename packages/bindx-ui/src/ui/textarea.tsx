import { forwardRef, useRef, useEffect, type ComponentProps } from 'react'
import { uic } from '../utils/uic.js'

export const Textarea = uic('textarea', {
	baseClass: `
		w-full bg-background rounded-md border border-input px-3 py-2 text-sm shadow-xs
		placeholder:text-muted-foreground
		focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring
		disabled:cursor-not-allowed disabled:opacity-50
		read-only:bg-gray-100
		data-[invalid]:border-destructive data-[invalid]:ring-destructive
	`,
	displayName: 'Textarea',
})

function useAutoHeightTextArea(
	ref: React.RefObject<HTMLTextAreaElement | null>,
	value: string,
	minRows: number,
	maxRows: number,
): void {
	useEffect(() => {
		const textarea = ref.current
		if (!textarea) return

		// Reset height to auto to get the correct scrollHeight
		textarea.style.height = 'auto'

		// Calculate line height
		const computedStyle = window.getComputedStyle(textarea)
		const lineHeight = parseInt(computedStyle.lineHeight, 10) || 20
		const paddingTop = parseInt(computedStyle.paddingTop, 10)
		const paddingBottom = parseInt(computedStyle.paddingBottom, 10)
		const borderTop = parseInt(computedStyle.borderTopWidth, 10)
		const borderBottom = parseInt(computedStyle.borderBottomWidth, 10)

		const minHeight = minRows * lineHeight + paddingTop + paddingBottom + borderTop + borderBottom
		const maxHeight = maxRows * lineHeight + paddingTop + paddingBottom + borderTop + borderBottom

		// Set the height based on content, clamped between min and max
		const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
		textarea.style.height = `${newHeight}px`
	}, [ref, value, minRows, maxRows])
}

function useComposeRef<T>(
	...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
	return (element: T | null) => {
		for (const ref of refs) {
			if (typeof ref === 'function') {
				ref(element)
			} else if (ref && typeof ref === 'object') {
				(ref as React.MutableRefObject<T | null>).current = element
			}
		}
	}
}

export const TextareaAutosize = forwardRef<HTMLTextAreaElement, ComponentProps<typeof Textarea> & {
	minRows?: number
	maxRows?: number
}>(({ minRows, maxRows, ...props }, ref) => {
	const innerRef = useRef<HTMLTextAreaElement | null>(null)
	const valueStr = (props['value'] as string | number | undefined)?.toString() ?? ''
	useAutoHeightTextArea(innerRef, valueStr, minRows ?? 3, maxRows ?? 100)

	return <Textarea ref={useComposeRef(innerRef, ref)} {...props} />
})

TextareaAutosize.displayName = 'TextareaAutosize'
