import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../utils/cn.js'

const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		className={cn(
			'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
			className,
		)}
		{...props}
		ref={ref}
	/>
))
SheetOverlay.displayName = 'SheetOverlay'

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
	return (
		<div className={cn('flex items-center justify-between gap-4 px-6 py-4 border-b shrink-0', className)} {...props} />
	)
}

function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
	return <div className={cn('flex-1 overflow-y-auto px-6 py-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
	return <div className={cn('flex justify-end gap-2 px-6 py-4 border-t shrink-0', className)} {...props} />
}

const SheetTitle = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn('text-lg font-semibold text-foreground', className)}
		{...props}
	/>
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-sm text-muted-foreground', className)}
		{...props}
	/>
))
SheetDescription.displayName = 'SheetDescription'

export {
	SheetPortal,
	SheetOverlay,
	SheetHeader,
	SheetBody,
	SheetFooter,
	SheetTitle,
	SheetDescription,
}
