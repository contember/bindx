import type { MutationResult } from './types.js'

/**
 * Error thrown when a mutation fails.
 *
 * For single mutations, `result` contains the failed mutation result.
 * For batched mutations (array/named), `results` contains ALL results (including successful ones)
 * so the caller can react to partial success.
 */
export class MutationFailedError extends Error {
	constructor(
		message: string,
		/** The failed mutation result (for single mutations) */
		public readonly result: MutationResult,
		/** All mutation results (for batched mutations — includes successful ones) */
		public readonly results?: unknown,
	) {
		super(message)
		this.name = 'MutationFailedError'
	}
}
