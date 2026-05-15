import { uic, type UicConfig } from '../utils/uic.js'

export { CheckboxInput } from '#bindx-ui/ui/checkbox-input'
export { RadioInput } from '#bindx-ui/ui/radio-input'

export const inputConfig: UicConfig<{
	inputSize: { default: string; sm: string; lg: string }
	variant: { default: string; ghost: string }
}> = {
	baseClass: [
		'flex w-full bg-background',
		'file:border-0 file:bg-transparent file:text-sm file:font-medium',
		'placeholder:text-muted-foreground',
		'focus-visible:outline-none',
		'disabled:cursor-not-allowed disabled:opacity-50',
		'read-only:bg-gray-100',
		'data-[invalid]:border-destructive data-[invalid]:ring-destructive',
	],
	variants: {
		inputSize: {
			default: 'h-10 rounded-md p-2 text-sm',
			sm: 'h-8 rounded-sm p-1 text-sm',
			lg: 'h-12 rounded-lg p-3 text-lg',
		},
		variant: {
			default: 'border border-input ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
			ghost: 'border-transparent border-b border-gray-200 focus-visible:ring-transparent rounded-none',
		},
	},
	defaultVariants: {
		variant: 'default',
		inputSize: 'default',
	},
}

export const Input = uic('input', {
	...inputConfig,
	displayName: 'Input',
})

export const InputLike = uic('div', {
	baseClass: [
		'flex items-center min-h-10 w-full rounded-md border border-input bg-background p-2 text-sm ring-offset-background',
		'file:border-0 file:bg-transparent file:text-sm file:font-medium',
		'placeholder:text-muted-foreground',
		'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
	],
	displayName: 'InputLike',
})

export const InputBare = uic('input', {
	baseClass: 'w-full h-full focus-visible:outline-hidden',
	displayName: 'InputBare',
})
