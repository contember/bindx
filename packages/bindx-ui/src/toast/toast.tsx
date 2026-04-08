import { useState, type ReactNode } from 'react'
import { useNotifications, useDismissNotification } from '@contember/bindx-react'
import type { Notification, NotificationType } from '@contember/bindx'
import { cn } from '../utils/cn.js'

const typeStyles: Record<NotificationType, { border: string; icon: string; bg: string }> = {
	success: {
		border: 'border-l-green-500',
		icon: '✓',
		bg: 'bg-green-50 dark:bg-green-950/20',
	},
	error: {
		border: 'border-l-red-500',
		icon: '✕',
		bg: 'bg-red-50 dark:bg-red-950/20',
	},
	warning: {
		border: 'border-l-orange-500',
		icon: '⚠',
		bg: 'bg-orange-50 dark:bg-orange-950/20',
	},
	info: {
		border: 'border-l-blue-500',
		icon: 'ℹ',
		bg: 'bg-blue-50 dark:bg-blue-950/20',
	},
}

export interface ToastItemProps {
	readonly notification: Notification
	readonly onDismiss: (id: string) => void
}

export function ToastItem({ notification, onDismiss }: ToastItemProps): ReactNode {
	const [showDetails, setShowDetails] = useState(false)
	const style = typeStyles[notification.type]

	return (
		<div
			className={cn(
				'pointer-events-auto w-80 rounded-md border border-l-4 shadow-lg',
				'bg-background text-foreground',
				'animate-in slide-in-from-right-full fade-in duration-300',
				style.border,
				style.bg,
			)}
			role="alert"
		>
			<div className="flex items-start gap-3 p-4">
				<span className="mt-0.5 shrink-0 text-sm font-medium" aria-hidden>
					{style.icon}
				</span>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium">{notification.message}</p>

					{notification.details && notification.details.length > 0 && (
						<>
							<button
								type="button"
								onClick={() => setShowDetails(prev => !prev)}
								className="mt-1 text-xs text-muted-foreground hover:text-foreground underline"
							>
								{showDetails ? 'Hide details' : 'Show details'}
							</button>
							{showDetails && (
								<ul className="mt-2 space-y-1 text-xs text-muted-foreground">
									{notification.details.map((detail, i) => (
										<li key={i}>
											{detail.entityType && (
												<span className="font-medium">{detail.entityType}</span>
											)}
											{detail.fieldName && (
												<span className="font-medium">.{detail.fieldName}</span>
											)}
											{(detail.entityType || detail.fieldName) && ': '}
											{detail.message}
										</li>
									))}
								</ul>
							)}
						</>
					)}

					{notification.technicalDetail && (
						<p className="mt-1 text-xs text-muted-foreground font-mono truncate">
							{notification.technicalDetail}
						</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => onDismiss(notification.id)}
					className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
					aria-label="Dismiss"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					</svg>
				</button>
			</div>
		</div>
	)
}

export interface ToastContainerProps {
	readonly className?: string
}

/**
 * Renders all active notifications as toasts.
 * Place this component once in your app tree (inside a BindxProvider).
 *
 * @example
 * ```tsx
 * <BindxProvider ...>
 *   <App />
 *   <ToastContainer />
 * </BindxProvider>
 * ```
 */
export function ToastContainer({ className }: ToastContainerProps): ReactNode {
	const notifications = useNotifications()
	const dismiss = useDismissNotification()

	if (notifications.length === 0) return null

	return (
		<div
			className={cn(
				'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none',
				className,
			)}
			aria-live="polite"
			aria-label="Notifications"
		>
			{notifications.map(notification => (
				<ToastItem
					key={notification.id}
					notification={notification}
					onDismiss={dismiss}
				/>
			))}
		</div>
	)
}
