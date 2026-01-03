import React, { useState, useEffect, useMemo, type ReactElement } from 'react'
import { useEntityData, type EntityDataState } from '../../hooks/useEntityData.js'
import { createCollectorProxy, createRuntimeAccessor } from '../proxy.js'
import { collectSelection, debugSelection } from '../analyzer.js'
import { SelectionMetaCollector, mergeSelections, toSelectionMeta } from '../SelectionMeta.js'
import type { EntityRef, JsxSelectionMeta } from '../types.js'
import type { SelectionMeta } from '../../selection/types.js'

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
	/** Not found fallback */
	notFound?: React.ReactNode
}

/**
 * State phases for Entity component
 */
type EntityPhase =
	| { phase: 'collecting' }
	| { phase: 'loading'; selection: JsxSelectionMeta }
	| { phase: 'ready'; selection: JsxSelectionMeta }
	| { phase: 'error'; error: Error }
	| { phase: 'not_found' }

/**
 * Entity component - orchestrates the two-pass rendering approach.
 *
 * Phase 1 (Collection): Renders children with collector proxy to determine which fields are needed
 * Phase 2 (Loading): Fetches data based on collected selection
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
	notFound,
}: EntityProps<TSchema, K>): ReactElement | null {
	const [phase, setPhase] = useState<EntityPhase>({ phase: 'collecting' })

	// Phase 1: Collection - runs synchronously on first render
	const { jsxSelection, standardSelection } = useMemo(() => {
		// Create collector proxy
		const selection = new SelectionMetaCollector()
		const collector = createCollectorProxy<TSchema[K]>(selection)

		// Call children with collector to gather field access
		const jsx = children(collector)

		// Analyze the returned JSX for component-level selections
		const jsxSel = collectSelection(jsx)
		mergeSelections(selection, jsxSel)

		// Debug output in development
		if (process.env['NODE_ENV'] === 'development') {
			console.log('[Entity] Collected selection for', name, ':')
			console.log(debugSelection(selection))
		}

		// Convert to standard SelectionMeta for the data loading hook
		return {
			jsxSelection: selection,
			standardSelection: toSelectionMeta(selection),
		}
	}, [name, id]) // Re-collect if entity changes

	// Use shared hook for data loading
	const { state, notifyChange, identityMap } = useEntityData(
		{ entityType: name as string, id },
		standardSelection,
	)

	// Update phase based on data state
	useEffect(() => {
		switch (state.status) {
			case 'loading':
				setPhase({ phase: 'loading', selection: jsxSelection })
				break
			case 'success':
				setPhase({ phase: 'ready', selection: jsxSelection })
				break
			case 'error':
				setPhase({ phase: 'error', error: state.error })
				break
			case 'not_found':
				setPhase({ phase: 'not_found' })
				break
		}
	}, [state.status, jsxSelection])

	// Render based on phase
	if (phase.phase === 'collecting' || phase.phase === 'loading') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (phase.phase === 'error') {
		if (errorFallback) {
			return <>{errorFallback(phase.error)}</>
		}
		return <DefaultError error={phase.error} />
	}

	if (phase.phase === 'not_found') {
		return <>{notFound ?? <DefaultNotFound entityType={name as string} id={id} />}</>
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

/**
 * Default not found component
 */
function DefaultNotFound({ entityType, id }: { entityType: string; id: string }): ReactElement {
	return (
		<div className="bindx-not-found">
			{entityType} with id &quot;{id}&quot; not found
		</div>
	)
}
