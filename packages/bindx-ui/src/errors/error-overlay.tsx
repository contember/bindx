import type { ReactNode } from 'react'
import type { FieldError } from '@contember/bindx'
import { Overlay } from '../ui/overlay.js'
import { Button } from '../ui/button.js'
import { dict } from '../dict.js'

export interface ErrorOverlayProps {
	readonly error: FieldError
	readonly onRetry?: () => void
	readonly onDismiss?: () => void
}

/**
 * Full-screen error overlay for critical load errors.
 * Use this when `useEntity()` or `useEntityList()` returns an error result.
 *
 * @example
 * ```tsx
 * const result = useEntity('Article', { id })
 * if (result.$status === 'error') {
 *   return <ErrorOverlay error={result.$error} onRetry={() => window.location.reload()} />
 * }
 * ```
 */
export function ErrorOverlay({ error, onRetry, onDismiss }: ErrorOverlayProps): ReactNode {
	return (
		<Overlay>
			<div className="max-w-md w-full mx-4 bg-background rounded-lg border shadow-lg p-6 text-center">
				<div className="text-4xl mb-4" aria-hidden>⚠</div>
				<h2 className="text-lg font-semibold text-foreground mb-2">
					{dict.toast.loadError}
				</h2>
				<p className="text-sm text-muted-foreground mb-4">
					{error.message}
				</p>
				{error.code && (
					<p className="text-xs text-muted-foreground font-mono mb-4">
						{error.code}
					</p>
				)}
				<div className="flex gap-2 justify-center">
					{onRetry && (
						<Button variant="default" onClick={onRetry}>
							Retry
						</Button>
					)}
					{onDismiss && (
						<Button variant="outline" onClick={onDismiss}>
							{dict.toast.dismiss}
						</Button>
					)}
				</div>
			</div>
		</Overlay>
	)
}
