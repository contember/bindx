import { Loader2Icon } from 'lucide-react'
import { uic } from '../utils/uic.js'
import { Overlay, type OverlayProps } from '#bindx-ui/ui/overlay'

export interface LoaderProps extends Omit<OverlayProps, 'children'> {
	size?: 'sm' | 'md' | 'lg'
}

export const LoaderIcon = uic(Loader2Icon, {
	baseClass: 'animate-spin text-gray-500',
	variants: {
		size: {
			sm: 'h-6 w-6',
			md: 'h-12 w-12',
			lg: 'h-24 w-24',
		},
	},
	defaultVariants: {
		size: 'lg',
	},
})

export const Loader = ({ size, ...props }: LoaderProps): React.ReactNode => {
	return (
		<Overlay {...props}>
			<LoaderIcon size={size} />
		</Overlay>
	)
}
