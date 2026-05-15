import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../utils/cn.js'
import { SheetPortal, SheetOverlay } from '#bindx-ui/ui/sheet-layout'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

const SheetContent = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<SheetPortal>
		<SheetOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				'fixed z-50 flex flex-col bg-background shadow-lg',
				'inset-y-0 right-0 h-full w-3/4 max-w-md border-l',
				'data-[state=open]:animate-in data-[state=closed]:animate-out',
				'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
				'duration-200',
				className,
			)}
			{...props}
		>
			{children}
		</DialogPrimitive.Content>
	</SheetPortal>
))
SheetContent.displayName = 'SheetContent'

export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetContent,
}

// Re-export layout components for convenience
export {
	SheetPortal,
	SheetOverlay,
	SheetHeader,
	SheetBody,
	SheetFooter,
	SheetTitle,
	SheetDescription,
} from '#bindx-ui/ui/sheet-layout'
