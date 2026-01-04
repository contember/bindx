/**
 * Disposable pattern for cleanup management.
 * Ensures proper cleanup of subscriptions and resources.
 */

/**
 * Interface for objects that can be disposed.
 */
export interface Disposable {
	dispose(): void
}

/**
 * A group of disposables that can be disposed together.
 * Provides safe cleanup even if individual dispose() calls throw.
 */
export class DisposableGroup implements Disposable {
	private disposables: Disposable[] = []
	private disposed = false

	/**
	 * Adds a disposable to the group.
	 * If the group is already disposed, the disposable is disposed immediately.
	 */
	add(disposable: Disposable): void {
		if (this.disposed) {
			// Already disposed, dispose immediately
			try {
				disposable.dispose()
			} catch (error) {
				console.error('Error disposing:', error)
			}
			return
		}
		this.disposables.push(disposable)
	}

	/**
	 * Adds a callback as a disposable.
	 */
	addCallback(callback: () => void): void {
		this.add({ dispose: callback })
	}

	/**
	 * Adds an unsubscribe function as a disposable.
	 */
	addUnsubscribe(unsubscribe: () => void): void {
		this.addCallback(unsubscribe)
	}

	/**
	 * Disposes all items in the group.
	 * Each item is disposed even if previous ones throw.
	 */
	dispose(): void {
		if (this.disposed) return
		this.disposed = true

		const errors: Error[] = []

		for (const disposable of this.disposables) {
			try {
				disposable.dispose()
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)))
			}
		}

		this.disposables = []

		if (errors.length > 0) {
			console.error('Errors during disposal:', errors)
		}
	}

	/**
	 * Checks if the group has been disposed.
	 */
	isDisposed(): boolean {
		return this.disposed
	}

	/**
	 * Gets the number of disposables in the group.
	 */
	get size(): number {
		return this.disposables.length
	}
}

/**
 * Creates a disposable from a callback function.
 */
export function createDisposable(callback: () => void): Disposable {
	let disposed = false
	return {
		dispose() {
			if (disposed) return
			disposed = true
			callback()
		},
	}
}

/**
 * Combines multiple disposables into one.
 */
export function combineDisposables(...disposables: Disposable[]): Disposable {
	const group = new DisposableGroup()
	for (const d of disposables) {
		group.add(d)
	}
	return group
}

/**
 * Type guard to check if something is disposable.
 */
export function isDisposable(value: unknown): value is Disposable {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Disposable).dispose === 'function'
	)
}
