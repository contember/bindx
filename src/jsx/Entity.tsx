import React, { useState, useEffect, useCallback, type ReactElement } from 'react'
import { useBackendAdapter, useIdentityMap } from '../hooks/BackendAdapterContext.js'
import { createCollectorProxy, createRuntimeAccessor } from './proxy.js'
import { collectSelection, convertToQuerySelection, debugSelection } from './analyzer.js'
import { SelectionMetaCollector, mergeSelections } from './SelectionMeta.js'
import type { EntityRef, JsxSelectionMeta } from './types.js'
import type { QuerySpec } from '../selection/index.js'

/**
 * State phases for Entity component
 */
type EntityState<T> =
	| { phase: 'collecting' }
	| { phase: 'fetching'; selection: JsxSelectionMeta }
	| { phase: 'ready'; selection: JsxSelectionMeta; data: T }
	| { phase: 'error'; error: Error }

/**
 * Props for Entity component
 */
export interface EntityProps<TSchema, K extends keyof TSchema> {
	/** Entity type name */
	name: K
	/** Entity ID to fetch */
	id: string
	/** Render function receiving typed entity accessor */
	children: (entity: EntityRef<TSchema[K]>) => React.ReactNode
	/** Loading fallback */
	loading?: React.ReactNode
	/** Error fallback */
	error?: (error: Error) => React.ReactNode
}

/**
 * Entity component - orchestrates the two-pass rendering approach.
 *
 * Phase 1 (Collection): Renders children with collector proxy to determine which fields are needed
 * Phase 2 (Fetching): Fetches data based on collected selection
 * Phase 3 (Runtime): Renders children with real data accessors
 *
 * @example
 * ```tsx
 * <Entity name="Author" id="author-1">
 *   {author => (
 *     <>
 *       <Field field={author.fields.name} />
 *       <HasMany field={author.fields.articles}>
 *         {article => <Field field={article.fields.title} />}
 *       </HasMany>
 *     </>
 *   )}
 * </Entity>
 * ```
 */
export function Entity<TSchema, K extends keyof TSchema>({
	name,
	id,
	children,
	loading,
	error: errorFallback,
}: EntityProps<TSchema, K>): ReactElement | null {
	const adapter = useBackendAdapter()
	const identityMap = useIdentityMap()

	const [state, setState] = useState<EntityState<TSchema[K]>>({ phase: 'collecting' })
	const [version, setVersion] = useState(0)

	// Force re-render when data changes
	const notifyChange = useCallback(() => {
		setVersion(v => v + 1)
	}, [])

	// Phase 1: Collection
	useEffect(() => {
		if (state.phase !== 'collecting') return

		// Create collector proxy
		const selection = new SelectionMetaCollector()
		const collector = createCollectorProxy<TSchema[K]>(selection)

		// Call children with collector to gather field access
		const jsx = children(collector)

		// Analyze the returned JSX for component-level selections
		const jsxSelection = collectSelection(jsx)
		mergeSelections(selection, jsxSelection)

		// Debug output (remove in production)
		if (process.env['NODE_ENV'] === 'development') {
			console.log('[Entity] Collected selection for', name, ':')
			console.log(debugSelection(selection))
		}

		// Move to fetching phase
		setState({ phase: 'fetching', selection })
	}, [state.phase, name, id, children])

	// Phase 2: Fetching
	useEffect(() => {
		if (state.phase !== 'fetching') return

		const fetchData = async () => {
			try {
				// Convert selection to query spec
				const querySelection = convertToQuerySelection(state.selection)
				const query = buildQuerySpec(querySelection)

				// Fetch data
				const data = await adapter.fetchOne(name as string, id, query)

				if (!data) {
					throw new Error(`Entity ${String(name)} with id ${id} not found`)
				}

				// Store in identity map
				identityMap.getOrCreate(name as string, id, data as Record<string, unknown>)

				// Move to ready phase
				setState({
					phase: 'ready',
					selection: state.selection,
					data: data as TSchema[K],
				})
			} catch (err) {
				setState({
					phase: 'error',
					error: err instanceof Error ? err : new Error(String(err)),
				})
			}
		}

		fetchData()
	}, [state.phase, name, id, adapter, identityMap])

	// Subscribe to identity map changes
	useEffect(() => {
		if (state.phase !== 'ready') return

		return identityMap.subscribe(name as string, id, notifyChange)
	}, [state.phase, name, id, identityMap, notifyChange])

	// Render based on phase
	if (state.phase === 'collecting' || state.phase === 'fetching') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (state.phase === 'error') {
		if (errorFallback) {
			return <>{errorFallback(state.error)}</>
		}
		return <DefaultError error={state.error} />
	}

	// Phase 3: Runtime render with real data
	const accessor = createRuntimeAccessor<TSchema[K]>(
		name as string,
		id,
		identityMap,
		notifyChange,
	)

	return <>{children(accessor)}</>
}

/**
 * Builds a QuerySpec from the converted selection
 */
function buildQuerySpec(selection: Record<string, unknown>): QuerySpec {
	const fields: QuerySpec['fields'] = []

	for (const [fieldName, value] of Object.entries(selection)) {
		if (value === true) {
			// Scalar field
			fields.push({
				name: fieldName,
				sourcePath: [fieldName],
			})
		} else if (typeof value === 'object' && value !== null) {
			// Relation
			const nested = value as Record<string, unknown>
			const params = nested['__params'] as Record<string, unknown> | undefined

			const nestedSpec = buildQuerySpec(
				Object.fromEntries(
					Object.entries(nested).filter(([k]) => k !== '__params'),
				),
			)

			fields.push({
				name: fieldName,
				sourcePath: [fieldName],
				nested: nestedSpec,
				...(params && {
					filter: params['filter'],
					orderBy: params['orderBy'],
					limit: params['limit'] as number | undefined,
					offset: params['offset'] as number | undefined,
				}),
			})
		}
	}

	return { fields }
}

/**
 * Default loading component
 */
function DefaultLoading(): ReactElement {
	return <div className="bindx-loading">Loading...</div>
}

/**
 * Default error component
 */
function DefaultError({ error }: { error: Error }): ReactElement {
	return (
		<div className="bindx-error">
			<strong>Error:</strong> {error.message}
		</div>
	)
}
