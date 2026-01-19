import { Slot } from '@radix-ui/react-slot'
import { forwardRef, type ComponentPropsWithoutRef, type ForwardedRef } from 'react'

/**
 * SlotInput props extend standard input props with slot children requirement
 */
export interface SlotInputProps extends ComponentPropsWithoutRef<'input'> {
	children: React.ReactElement
}

/**
 * A typed Slot component specifically for input elements.
 * This is a wrapper around Radix Slot that provides proper TypeScript types
 * for input-specific props like `checked`, `value`, `type`, etc.
 */
export const SlotInput = forwardRef(function SlotInput(
	props: SlotInputProps,
	ref: ForwardedRef<HTMLInputElement>,
) {
	// Cast to any to work around Radix Slot's limited type inference
	// The Slot component will properly merge these props with the child
	return <Slot {...(props as React.ComponentPropsWithoutRef<typeof Slot>)} ref={ref as React.Ref<HTMLElement>} />
})
