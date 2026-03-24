/**
 * Path element in mutation errors — either a field name or an array index.
 */
export type MutationErrorPathElement =
	| { readonly field: string }
	| { readonly index: number; readonly alias: string | null }

/**
 * A single mutation error from the Contember API.
 */
export interface MutationError {
	readonly paths: readonly (readonly MutationErrorPathElement[])[]
	readonly message: string
	readonly type: string
}

/**
 * A single validation error.
 */
export interface ValidationError {
	readonly path: readonly MutationErrorPathElement[]
	readonly message: { readonly text: string }
}

/**
 * Validation result from a mutation.
 */
export interface ValidationResult {
	readonly valid: boolean
	readonly errors: readonly ValidationError[]
}

/**
 * Result of a single mutation operation.
 * Discriminated on `ok`.
 */
export type MutationResult<TNode = unknown> =
	| {
		readonly ok: true
		readonly errorMessage: null
		readonly errors: readonly []
		readonly validation: ValidationResult & { readonly valid: true }
		readonly node: TNode | null
	}
	| {
		readonly ok: false
		readonly errorMessage: string
		readonly errors: readonly MutationError[]
		readonly validation: ValidationResult
		readonly node: null
	}

/**
 * Result of a transaction operation.
 */
export interface TransactionResult<TData = unknown> {
	readonly ok: boolean
	readonly errorMessage: string | null
	readonly errors: readonly MutationError[]
	readonly validation: ValidationResult
	readonly data: TData
}
