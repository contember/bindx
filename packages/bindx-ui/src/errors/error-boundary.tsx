import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Overlay } from '../ui/overlay.js'
import { Button } from '../ui/button.js'

export interface BindxErrorBoundaryProps {
	readonly children: ReactNode
	readonly fallback?: ReactNode
}

interface BindxErrorBoundaryState {
	readonly error: Error | null
}

/**
 * React Error Boundary that catches render errors and displays
 * a full-screen fallback. Wrap your bindx-powered UI with this
 * component to prevent white screens on unexpected errors.
 *
 * @example
 * ```tsx
 * <BindxErrorBoundary>
 *   <App />
 *   <ToastContainer />
 * </BindxErrorBoundary>
 * ```
 */
export class BindxErrorBoundary extends Component<BindxErrorBoundaryProps, BindxErrorBoundaryState> {
	override state: BindxErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): BindxErrorBoundaryState {
		return { error }
	}

	override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error('[Bindx ErrorBoundary]', error, errorInfo)
	}

	private handleRetry = (): void => {
		this.setState({ error: null })
	}

	override render(): ReactNode {
		if (this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback
			}
			return (
				<Overlay showImmediately>
					<div className="max-w-md w-full mx-4 bg-background rounded-lg border shadow-lg p-6 text-center">
						<div className="text-4xl mb-4" aria-hidden>⚠</div>
						<h2 className="text-lg font-semibold text-foreground mb-2">
							Something went wrong
						</h2>
						<p className="text-sm text-muted-foreground mb-4">
							{this.state.error.message}
						</p>
						<Button variant="default" onClick={this.handleRetry}>
							Try again
						</Button>
					</div>
				</Overlay>
			)
		}
		return this.props.children
	}
}
