import type { BackendAdapter, Query, QueryResult, QueryOptions } from '@contember/bindx'

/**
 * Pending query with its resolution callbacks
 */
interface PendingQuery {
	readonly query: Query
	readonly resolve: (result: QueryResult) => void
	readonly reject: (error: Error) => void
	readonly signal?: AbortSignal
}

/**
 * Batches queries from multiple components into single adapter calls.
 *
 * Uses queueMicrotask to collect all queries during a React render cycle
 * and execute them together in a single batch.
 */
export class QueryBatcher {
	private pendingQueries: PendingQuery[] = []
	private flushScheduled = false

	constructor(private readonly adapter: BackendAdapter) {}

	/**
	 * Queue a query for batched execution.
	 * Returns a promise that resolves when the query completes.
	 */
	enqueue(query: Query, options?: QueryOptions): Promise<QueryResult> {
		return new Promise((resolve, reject) => {
			// If provided signal is already aborted, reject immediately
			if (options?.signal?.aborted) {
				reject(new DOMException('Aborted', 'AbortError'))
				return
			}

			const pending: PendingQuery = { query, resolve, reject, signal: options?.signal }

			// Handle abort for this specific query
			if (options?.signal) {
				const abortHandler = (): void => {
					const index = this.pendingQueries.indexOf(pending)
					if (index >= 0) {
						this.pendingQueries.splice(index, 1)
						reject(new DOMException('Aborted', 'AbortError'))
					}
				}
				options.signal.addEventListener('abort', abortHandler, { once: true })
			}

			this.pendingQueries.push(pending)
			this.scheduleFlush()
		})
	}

	/**
	 * Schedule flush using microtask to batch within render cycle
	 */
	private scheduleFlush(): void {
		if (this.flushScheduled) return
		this.flushScheduled = true

		queueMicrotask(() => {
			this.flush()
		})
	}

	/**
	 * Execute all pending queries in a batch
	 */
	private async flush(): Promise<void> {
		this.flushScheduled = false

		if (this.pendingQueries.length === 0) return

		// Take all pending queries
		const batch = this.pendingQueries.splice(0)

		// Find queries that aren't aborted
		const activeBatch = batch.filter(p => !p.signal?.aborted)

		if (activeBatch.length === 0) return

		try {
			const queries = activeBatch.map(p => p.query)
			const results = await this.adapter.query(queries)

			// Resolve each query with its result
			for (let i = 0; i < activeBatch.length; i++) {
				const pending = activeBatch[i]
				const result = results[i]
				if (pending && result) {
					pending.resolve(result)
				}
			}
		} catch (error) {
			// Reject all queries in batch
			for (const pending of activeBatch) {
				pending.reject(error instanceof Error ? error : new Error(String(error)))
			}
		}
	}

	/**
	 * Cancel all pending queries
	 */
	cancelAll(): void {
		const error = new DOMException('Cancelled', 'AbortError')
		for (const pending of this.pendingQueries) {
			pending.reject(error)
		}
		this.pendingQueries = []
	}
}
