import {
	createModelProxy,
	getArrayMapResult,
	getProxyPath,
	isArrayMapResult,
	isModelProxy,
} from '../proxy/index.js'
import type { UnwrapProxy } from '../proxy/index.js'
import type {
	FieldMeta,
	Fragment,
	FragmentComposition,
	FragmentDefiner,
	FragmentMeta,
} from './types.js'

/**
 * Defines a reusable fragment that specifies which fields to fetch from an entity.
 *
 * @example
 * ```ts
 * const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
 *   id: author.id,
 *   name: author.name,
 *   email: author.email,
 * }))
 *
 * // Use in useEntity
 * const article = useEntity('Article', { id }, e => ({
 *   title: e.title,
 *   author: AuthorFragment.compose(e.author),
 * }))
 * ```
 */
export function defineFragment<TModel, TResult extends object>(
	definer: FragmentDefiner<TModel, TResult>,
): Fragment<TModel, TResult> {
	// Create a proxy to track field access
	const proxy = createModelProxy<TModel>()

	// Execute definer to build result shape and track accessed fields
	const result = definer(proxy)

	// Extract metadata from the result
	const meta = extractFragmentMeta(result)

	type Unwrapped = UnwrapProxy<TResult>

	return {
		__meta: meta,
		__resultType: undefined as unknown as Unwrapped,
		__modelType: undefined as unknown as TModel,

		compose(targetProxy: typeof proxy): FragmentComposition<Unwrapped> {
			// When composing, we apply the definer to the target proxy
			// This allows the parent to track what fields are accessed
			const composedResult = definer(targetProxy)
			const composedMeta = extractFragmentMeta(composedResult)

			return {
				__fragmentMeta: composedMeta,
				__compositionResult: undefined as unknown as Unwrapped,
				__isComposition: true,
			}
		},
	}
}

/**
 * Extracts FragmentMeta from a fragment result object.
 * Recursively processes nested objects and arrays.
 */
export function extractFragmentMeta(obj: object): FragmentMeta {
	const fields = new Map<string, FieldMeta>()

	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) {
			continue
		}

		// Check if it's a fragment composition
		if (isFragmentComposition(value)) {
			// Merge the composed fragment's metadata
			fields.set(key, {
				path: [], // Path will be determined by where it's composed
				nested: value.__fragmentMeta,
			})
			continue
		}

		// Check if it's an array map result
		if (isArrayMapResult(value)) {
			const path = getProxyPath(value)
			const arrayResult = getArrayMapResult(value)

			let arrayItemMeta: FragmentMeta | undefined
			if (isFragmentComposition(arrayResult)) {
				// If the map callback returns a fragment composition, use its metadata directly
				arrayItemMeta = arrayResult.__fragmentMeta
			} else if (arrayResult && typeof arrayResult === 'object') {
				arrayItemMeta = extractFragmentMeta(arrayResult)
			}

			fields.set(key, {
				path,
				isArray: true,
				arrayItemMeta,
			})
			continue
		}

		// Check if it's a direct proxy reference (scalar field)
		if (isModelProxy(value)) {
			const path = getProxyPath(value)
			fields.set(key, { path })
			continue
		}

		// Check if it's a nested object literal (not a proxy)
		if (typeof value === 'object') {
			const nested = extractFragmentMeta(value)
			// For nested objects, we need to figure out the base path
			// by looking at the first field's path
			const firstField = nested.fields.values().next().value as FieldMeta | undefined
			const basePath = firstField?.path.slice(0, -1) ?? []

			fields.set(key, {
				path: basePath,
				nested,
			})
			continue
		}
	}

	return { fields }
}

/**
 * Type guard for FragmentComposition
 */
export function isFragmentComposition(value: unknown): value is FragmentComposition<unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		'__isComposition' in value &&
		value.__isComposition === true
	)
}

/**
 * Merges multiple FragmentMeta objects into one.
 * Used when composing fragments together.
 */
export function mergeFragmentMeta(...metas: FragmentMeta[]): FragmentMeta {
	const merged = new Map<string, FieldMeta>()

	for (const meta of metas) {
		for (const [key, fieldMeta] of meta.fields) {
			const existing = merged.get(key)
			if (existing && existing.nested && fieldMeta.nested) {
				// Merge nested metadata
				merged.set(key, {
					...existing,
					nested: mergeFragmentMeta(existing.nested, fieldMeta.nested),
				})
			} else {
				merged.set(key, fieldMeta)
			}
		}
	}

	return { fields: merged }
}
