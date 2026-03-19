import { usePersist } from '@contember/bindx-react'
import { type ComponentProps, type ReactNode, useCallback } from 'react'
import { Button } from '../ui/button.js'
import { LoaderIcon } from '../ui/loader.js'
import { cn } from '../utils/cn.js'
import { dict } from '../dict.js'

export interface PersistButtonProps extends ComponentProps<typeof Button> {
	readonly label?: ReactNode
	readonly onSuccess?: () => void
	readonly onError?: () => void
}

export function PersistButton({ label, className, onSuccess, onError, ...buttonProps }: PersistButtonProps): ReactNode {
	const { persistAll, isPersisting, isDirty } = usePersist()

	const handleClick = useCallback(async (): Promise<void> => {
		const result = await persistAll()
		if (result.success) {
			onSuccess?.()
		} else {
			onError?.()
		}
	}, [persistAll, onSuccess, onError])

	return (
		<Button
			className={cn('relative', className)}
			disabled={isPersisting || !isDirty}
			onClick={handleClick}
			{...buttonProps}
		>
			{isPersisting && <LoaderIcon size="sm" className="absolute" />}
			<span className={isPersisting ? 'invisible' : undefined}>
				{label ?? dict.persist.save}
			</span>
		</Button>
	)
}
