import {
	SELECTION_META,
	type FluentFragment,
	type SelectionBuilder,
	type SelectionFieldMeta,
	type SelectionMeta,
	type HasManyOptions,
} from './types.js'
import { mergeSelections, SelectionMetaCollector } from './SelectionMetaCollector.js'
import { generateHasManyAlias } from '../utils/aliasGenerator.js'

/**
 * Creates a fluent selection builder for an entity type.
 * Uses Proxy to intercept method calls and build selection metadata.
 *
 * @example
 * ```ts
 * const builder = createSelectionBuilder<Article>()
 * const result = builder.id().title().author(a => a.name())
 * const meta = result[SELECTION_META]
 * ```
 */
export function createSelectionBuilder<TEntity, TSelected extends object = object, THasManyParams extends object = object>(
	initialMeta: SelectionMeta = { fields: new Map() },
): SelectionBuilder<TEntity, TSelected, THasManyParams> {
	const handler: ProxyHandler<object> = {
		get(_target, prop: string | symbol) {
			// Return metadata for introspection
			if (prop === SELECTION_META) {
				return initialMeta
			}

			// Type brand accessor
			if (prop === '__selected') {
				return undefined
			}

			// Skip internal symbols
			if (typeof prop === 'symbol') {
				return undefined
			}

			// Return a function that handles the field selection
			return createFieldMethod<TEntity, TSelected, THasManyParams>(prop, initialMeta)
		},
		has(_target, prop: string | symbol) {
			if (prop === SELECTION_META) {
				return true
			}
			return false
		},
	}

	return new Proxy({}, handler) as SelectionBuilder<TEntity, TSelected, THasManyParams>
}

/**
 * Creates a method for selecting a specific field.
 * The method signature depends on the field type (scalar, has-one, has-many).
 */
function createFieldMethod<TEntity, TSelected extends object, THasManyParams extends object>(
	fieldName: string,
	currentMeta: SelectionMeta,
) {
	return function selectField(...args: unknown[]): SelectionBuilder<TEntity, object, object> {
		// Parse arguments to determine what kind of selection this is
		const { options, selector, fragment, fragments } = parseFieldArgs(args)

		// Build field metadata
		const fieldMeta: SelectionFieldMeta = {
			fieldName,
			alias: fieldName, // Will be updated below
			path: [fieldName],
			isRelation: false,
			isArray: false,
			nested: undefined,
			hasManyParams: undefined,
		}

		// Handle relation with callback
		if (typeof selector === 'function') {
			const nestedBuilder = createSelectionBuilder<unknown>()
			const resultBuilder = selector(nestedBuilder) as SelectionBuilder<unknown, object, object>
			fieldMeta.nested = resultBuilder[SELECTION_META]
			fieldMeta.isRelation = true

			// Check if this looks like a has-many (options has filter/orderBy/limit)
			if (options && isHasManyOptions(options)) {
				fieldMeta.isArray = true
				fieldMeta.hasManyParams = {
					filter: (options as HasManyOptions).filter,
					orderBy: (options as HasManyOptions).orderBy,
					limit: (options as HasManyOptions).limit,
					offset: (options as HasManyOptions).offset,
					totalCount: (options as HasManyOptions).totalCount,
				}
			}
		}

		// Handle relation with single fragment
		if (fragment && isFluentFragment(fragment)) {
			fieldMeta.nested = fragment.__meta
			fieldMeta.isRelation = true

			// Check has-many params
			if (options && isHasManyOptions(options)) {
				fieldMeta.isArray = true
				fieldMeta.hasManyParams = {
					filter: (options as HasManyOptions).filter,
					orderBy: (options as HasManyOptions).orderBy,
					limit: (options as HasManyOptions).limit,
					offset: (options as HasManyOptions).offset,
					totalCount: (options as HasManyOptions).totalCount,
				}
			}
		}

		// Handle relation with multiple fragments (merged)
		if (fragments && fragments.length > 0) {
			// Merge all fragment selections into one
			const mergedSelection = new SelectionMetaCollector()
			for (const frag of fragments) {
				mergeSelections(mergedSelection, frag.__meta)
			}
			fieldMeta.nested = mergedSelection
			fieldMeta.isRelation = true

			// Check has-many params
			if (options && isHasManyOptions(options)) {
				fieldMeta.isArray = true
				fieldMeta.hasManyParams = {
					filter: (options as HasManyOptions).filter,
					orderBy: (options as HasManyOptions).orderBy,
					limit: (options as HasManyOptions).limit,
					offset: (options as HasManyOptions).offset,
					totalCount: (options as HasManyOptions).totalCount,
				}
			}
		}

		// Determine alias:
		// 1. Explicit alias from options takes priority
		// 2. For has-many with params, auto-generate alias
		// 3. Otherwise, use fieldName
		const explicitAlias = (options as { as?: string } | undefined)?.as
		if (explicitAlias) {
			fieldMeta.alias = explicitAlias
		} else if (fieldMeta.isArray && fieldMeta.hasManyParams) {
			// Auto-generate alias for has-many with params
			fieldMeta.alias = generateHasManyAlias(fieldName, fieldMeta.hasManyParams)
		}
		// else alias is already set to fieldName

		// If it's a relation call without options but first arg is callback/fragment
		// and there's no filter/orderBy, check if it's has-many by detecting array at runtime
		// This is handled by the type system - if the field type is Array<T>, it will use HasManyMethod

		// Create new metadata with this field added
		const newMeta: SelectionMeta = {
			fields: new Map(currentMeta.fields),
		}
		newMeta.fields.set(fieldMeta.alias, fieldMeta)

		// Return new builder with accumulated selection
		return createSelectionBuilder<TEntity, TSelected, THasManyParams>(newMeta)
	}
}

/**
 * Type guard for HasManyOptions
 */
function isHasManyOptions(value: unknown): value is HasManyOptions {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	return 'filter' in value || 'orderBy' in value || 'limit' in value || 'offset' in value
}

/**
 * Type guard for FluentFragment
 */
function isFluentFragment(value: unknown): value is FluentFragment<unknown, unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		'__isFragment' in value &&
		(value as FluentFragment<unknown, unknown>).__isFragment === true
	)
}

/**
 * Parses the variable arguments to a field method.
 *
 * Possible call patterns:
 * - e.title()                           -> scalar, no args
 * - e.title({ as: 'x' })                -> scalar with alias
 * - e.author(a => a.name())             -> has-one with callback
 * - e.author(AuthorFragment)            -> has-one with fragment
 * - e.author(Frag1, Frag2, ...)         -> has-one with multiple fragments (merged)
 * - e.author({ as: 'x' }, a => a.name())-> has-one with alias + callback
 * - e.author({ as: 'x' }, AuthorFrag)   -> has-one with alias + fragment
 * - e.author({ as: 'x' }, Frag1, Frag2) -> has-one with alias + multiple fragments
 * - e.tags(t => t.name())               -> has-many with callback
 * - e.tags(TagFragment)                 -> has-many with fragment
 * - e.tags(Frag1, Frag2, ...)           -> has-many with multiple fragments (merged)
 * - e.tags({ filter: {} }, t => t.name()) -> has-many with options + callback
 * - e.tags({ filter: {} }, TagFragment)   -> has-many with options + fragment
 * - e.tags({ filter: {} }, Frag1, Frag2)  -> has-many with options + multiple fragments
 */
function parseFieldArgs(args: unknown[]): {
	options?: Record<string, unknown>
	selector?: (builder: SelectionBuilder<unknown>) => SelectionBuilder<unknown, object, object>
	fragment?: FluentFragment<unknown, unknown>
	fragments?: FluentFragment<unknown, unknown>[]
} {
	if (args.length === 0) {
		// Just field name, no args: e.title()
		return {}
	}

	if (args.length === 1) {
		const arg = args[0]
		if (typeof arg === 'function') {
			// Selector callback: e.author(a => a.name())
			return { selector: arg as (builder: SelectionBuilder<unknown>) => SelectionBuilder<unknown, object, object> }
		}
		if (typeof arg === 'object' && arg !== null) {
			if (isFluentFragment(arg)) {
				// Fragment: e.author(AuthorFragment)
				return { fragment: arg }
			}
			// Options without selector: e.title({ as: 'caption' })
			return { options: arg as Record<string, unknown> }
		}
	}

	// Check for multiple fragments: e.author(Frag1, Frag2, ...)
	if (args.length >= 2 && args.every(isFluentFragment)) {
		return { fragments: args as FluentFragment<unknown, unknown>[] }
	}

	if (args.length >= 2) {
		const [first, ...rest] = args

		// Check if first is options object
		if (typeof first === 'object' && first !== null && !isFluentFragment(first)) {
			const second = rest[0]

			if (typeof second === 'function') {
				// Options + selector: e.tags({ filter: {...} }, t => t.name())
				return {
					options: first as Record<string, unknown>,
					selector: second as (builder: SelectionBuilder<unknown>) => SelectionBuilder<unknown, object, object>,
				}
			}

			// Check for options + multiple fragments
			if (rest.every(isFluentFragment)) {
				if (rest.length === 1) {
					// Options + single fragment: e.tags({ filter: {...} }, TagFragment)
					return {
						options: first as Record<string, unknown>,
						fragment: rest[0] as FluentFragment<unknown, unknown>,
					}
				}
				// Options + multiple fragments: e.tags({ filter: {} }, Frag1, Frag2)
				return {
					options: first as Record<string, unknown>,
					fragments: rest as FluentFragment<unknown, unknown>[],
				}
			}
		}
	}

	return {}
}

/**
 * Extracts SelectionMeta from a builder
 */
export function getSelectionMeta(builder: SelectionBuilder<unknown, object, object>): SelectionMeta {
	return builder[SELECTION_META]
}
