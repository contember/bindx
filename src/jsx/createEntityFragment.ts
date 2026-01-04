import type { ReactNode, ComponentType } from 'react'
import { memo } from 'react'
import type { EntityRef, SelectionProvider } from './types.js'
import { BINDX_COMPONENT, FIELD_REF_META } from './types.js'
import type { FluentFragment, SelectionMeta, SelectionFieldMeta } from '../selection/types.js'
import { createCollectorProxy } from './proxy.js'
import { collectSelection } from './analyzer.js'
import { SelectionMetaCollector, mergeSelections } from './SelectionMeta.js'

/**
 * Marker symbol for identifying EntityFragmentComponent
 */
export const ENTITY_FRAGMENT_COMPONENT = Symbol('ENTITY_FRAGMENT_COMPONENT')

/**
 * Marker symbol for entity fragment prop metadata
 */
export const ENTITY_FRAGMENT_PROPS = Symbol('ENTITY_FRAGMENT_PROPS')

/**
 * Extract keys from props type where value is EntityRef<any>
 */
export type EntityPropKeys<P> = {
	[K in keyof P]: P[K] extends EntityRef<infer _T> ? K : never
}[keyof P]

/**
 * Extract the entity type from an EntityRef prop
 */
export type EntityFromProp<P, K extends keyof P> = P[K] extends EntityRef<infer T> ? T : never

/**
 * Fragment properties - $propName for each entity prop
 * The result type is the full entity type since the fragment selects from that entity.
 */
export type EntityFragmentProperties<P> = {
	[K in EntityPropKeys<P> as `$${K & string}`]: FluentFragment<EntityFromProp<P, K>, EntityFromProp<P, K>>
}

/**
 * Internal metadata for entity prop selections
 */
interface EntityPropMeta {
	selection: SelectionMeta
	fragment: FluentFragment<unknown, object>
}

/**
 * An entity fragment component created by createEntityFragment.
 * Can be used both as a React component in JSX and provides fragment properties
 * for use with useEntity hook.
 */
export type EntityFragmentComponent<P> = ComponentType<P> &
	SelectionProvider & {
		/** Marker for type identification */
		readonly [ENTITY_FRAGMENT_COMPONENT]: true

		/** Map of prop name to fragment metadata */
		readonly [ENTITY_FRAGMENT_PROPS]: Map<string, EntityPropMeta>
	}

/**
 * Full type including fragment properties ($propName)
 */
export type EntityFragmentComponentWithProps<P> = EntityFragmentComponent<P> & EntityFragmentProperties<P>

/**
 * Creates a reusable entity fragment component.
 *
 * The component can be used in two ways:
 * 1. As a JSX component under `<Entity>`: `<AuthorInfo author={author} />`
 * 2. As a fragment in `useEntity`: `e.author(AuthorInfo.$author)`
 *
 * Entity props (those typed as `EntityRef<T>`) are automatically detected
 * and their selections are collected from the render function.
 *
 * @example
 * ```tsx
 * interface AuthorInfoProps {
 *   author: EntityRef<Author>
 *   showEmail?: boolean
 * }
 *
 * const AuthorInfo = createEntityFragment<AuthorInfoProps>(
 *   ({ author, showEmail }) => (
 *     <div>
 *       <Field field={author.fields.name} />
 *       {showEmail && <Field field={author.fields.email} />}
 *       <HasMany field={author.fields.articles}>
 *         {article => <Field field={article.fields.title} />}
 *       </HasMany>
 *     </div>
 *   )
 * )
 *
 * // Usage in JSX
 * <Entity name="Author" id={id}>
 *   {author => <AuthorInfo author={author} showEmail />}
 * </Entity>
 *
 * // Usage with useEntity
 * const article = useEntity('Article', { id }, e =>
 *   e.title().author(AuthorInfo.$author)
 * )
 * ```
 */
export function createEntityFragment<P extends object>(
	render: (props: P) => ReactNode,
): EntityFragmentComponentWithProps<P> {
	// Map to store selections for each entity prop
	const entityPropsMap = new Map<string, EntityPropMeta>()

	// Create a props proxy that returns collector proxies for entity props
	const collectEntityProps = (): void => {
		// We'll use a single shared collector for JSX analysis
		// Each entity prop gets its own selection based on which fields are accessed

		// Map prop names to their collectors
		const propCollectors = new Map<string, SelectionMetaCollector>()

		const propsProxy = new Proxy({} as P, {
			get(_target, propName: string | symbol): unknown {
				if (typeof propName === 'symbol') {
					return undefined
				}

				// Create a collector for this prop
				const selection = new SelectionMetaCollector()
				propCollectors.set(propName, selection)

				// Return a collector proxy for this entity prop
				return createCollectorProxy<unknown>(selection)
			},
		})

		// Execute render to capture field accesses
		const jsx = render(propsProxy)

		// Analyze the JSX tree for component-level selections
		// This will properly collect nested HasMany/HasOne fields
		const jsxSelection = collectSelection(jsx)

		// For each entity prop that was accessed, merge the JSX selection
		// The JSX selection contains the complete tree including nested relations
		for (const [propName, collector] of propCollectors) {
			// Only create fragments for props that had field accesses
			// This ensures only entity props (accessed as entity.fields.x) get fragments
			if (collector.fields.size > 0) {
				// Merge jsxSelection into collector
				// This brings in nested HasMany/HasOne data
				mergeSelections(collector, jsxSelection)

				// Create fragment for this prop
				const fragment: FluentFragment<unknown, object> = {
					__meta: collector,
					__resultType: {} as object,
					__modelType: undefined as unknown,
					__isFragment: true,
				}
				entityPropsMap.set(propName, { selection: collector, fragment })
			}
		}
	}

	// Collect selections once at component creation time
	collectEntityProps()

	// Create the React component
	function EntityFragmentImpl(props: P): ReactNode {
		return render(props)
	}

	// Memoize for performance
	const MemoizedComponent = memo(EntityFragmentImpl) as unknown as EntityFragmentComponent<P>

	// Add selection provider interface
	MemoizedComponent.getSelection = (
		props: Record<string, unknown>,
		_collectNested: (children: ReactNode) => SelectionMeta,
	): SelectionFieldMeta[] | null => {
		const fields: SelectionFieldMeta[] = []

		// For each entity prop, add its root fields to the selection
		for (const [propName, meta] of entityPropsMap) {
			const propValue = props[propName]

			// Check if this prop is an entity ref (has FIELD_REF_META)
			if (propValue && typeof propValue === 'object' && FIELD_REF_META in propValue) {
				const refMeta = (propValue as { [FIELD_REF_META]: { path: string[]; fieldName: string } })[FIELD_REF_META]

				// The prop is being used for a specific field path
				// Merge our selection into that path
				for (const [_key, field] of meta.selection.fields) {
					if (field.path.length === 1) {
						// Create a field meta with the correct context
						fields.push({
							...field,
							path: [...refMeta.path, ...field.path],
						})
					}
				}
			}
		}

		return fields.length > 0 ? fields : null
	}

	// Add markers
	;(MemoizedComponent as unknown as Record<symbol, unknown>)[BINDX_COMPONENT] = true
	;(MemoizedComponent as unknown as Record<symbol, unknown>)[ENTITY_FRAGMENT_COMPONENT] = true
	;(MemoizedComponent as unknown as Record<symbol, unknown>)[ENTITY_FRAGMENT_PROPS] = entityPropsMap

	// Create the result with $propName properties
	const result = MemoizedComponent as unknown as Record<string, unknown>

	for (const [propName, meta] of entityPropsMap) {
		result[`$${propName}`] = meta.fragment
	}

	return result as EntityFragmentComponentWithProps<P>
}

/**
 * Type guard to check if a value is an EntityFragmentComponent
 */
export function isEntityFragmentComponent(value: unknown): value is EntityFragmentComponent<Record<string, unknown>> {
	if (value === null || value === undefined) {
		return false
	}
	if (typeof value !== 'object' && typeof value !== 'function') {
		return false
	}
	// memo() returns an object with $$typeof, not a function
	// Check for the marker symbol instead
	return (
		ENTITY_FRAGMENT_COMPONENT in value &&
		(value as Record<symbol, unknown>)[ENTITY_FRAGMENT_COMPONENT] === true
	)
}

/**
 * Merges multiple fragment selections into one.
 * Useful when multiple components need the same entity with different fields.
 *
 * @example
 * ```tsx
 * const article = useEntity('Article', { id }, e =>
 *   e.author(mergeFragments(AuthorInfo.$author, AuthorCard.$author))
 * )
 * ```
 */
export function mergeFragments<T, R1 extends object>(
	fragment1: FluentFragment<T, R1>,
): FluentFragment<T, R1>
export function mergeFragments<T, R1 extends object, R2 extends object>(
	fragment1: FluentFragment<T, R1>,
	fragment2: FluentFragment<T, R2>,
): FluentFragment<T, R1 & R2>
export function mergeFragments<T, R1 extends object, R2 extends object, R3 extends object>(
	fragment1: FluentFragment<T, R1>,
	fragment2: FluentFragment<T, R2>,
	fragment3: FluentFragment<T, R3>,
): FluentFragment<T, R1 & R2 & R3>
export function mergeFragments<T>(
	...fragments: FluentFragment<T, object>[]
): FluentFragment<T, object> {
	if (fragments.length === 0) {
		throw new Error('mergeFragments requires at least one fragment')
	}

	if (fragments.length === 1) {
		return fragments[0]!
	}

	// Create a new merged selection
	const mergedSelection = new SelectionMetaCollector()

	for (const fragment of fragments) {
		mergeSelections(mergedSelection, fragment.__meta)
	}

	return {
		__meta: mergedSelection,
		__resultType: {} as object,
		__modelType: undefined as unknown as T,
		__isFragment: true,
	}
}
