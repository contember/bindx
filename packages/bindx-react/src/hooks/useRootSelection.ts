import { useEffect, useMemo, type ReactNode } from 'react'
import { buildQueryFromSelection } from '@contember/bindx'
import type { EntityAccessor } from '../jsx/types.js'
import { useSchemaRegistry } from './BackendAdapterContext.js'
import { useSelectionCollection, type SelectionCollectionResult } from './useSelectionCollection.js'
import { isValidCompiledSelection, resolveCompiledRootSelection, type CompiledSelection } from '../jsx/compiledSelection.js'
import { isCompiledSelectionsEnabled, isStaticSelectionValidationEnabled, validateCompiledRootSelection } from '../jsx/componentFactory.js'

/**
 * Params for {@link useRootSelection}.
 */
export interface UseRootSelectionParams {
	readonly entityType: string
	readonly depsKey: string
	readonly children: (entity: EntityAccessor<unknown>) => ReactNode
	/** Compiler-injected root selection. Absent ⇒ the runtime children walk runs. */
	readonly compiledSelection?: CompiledSelection
}

/**
 * Root selection for <Entity>. With a compiled selection the root SelectionMeta is
 * built statically and `children` is NEVER invoked with a collector; without it the
 * runtime children-collector walk runs as before. Validate mode additionally runs
 * the walk (contained) and diffs it against the compiled root for under-fetches.
 */
export function useRootSelection(params: UseRootSelectionParams): SelectionCollectionResult {
	const { entityType, depsKey, children, compiledSelection } = params
	const schemaRegistry = useSchemaRegistry()
	const validateMode = isStaticSelectionValidationEnabled()
	const compiledEnabled = isCompiledSelectionsEnabled()

	// Compiled root selection — present ⇒ skip the children(collector) walk (unless validating).
	// Killswitch off or a malformed/throwing literal yields null ⇒ the runtime walk runs. Decided
	// INSIDE the memo so the hook sequence below stays identical across the compiled/uncompiled path.
	const compiledResult = useMemo((): SelectionCollectionResult | null => {
		if (!compiledSelection || !compiledEnabled) {
			return null
		}
		if (!isValidCompiledSelection(compiledSelection)) {
			console.warn(
				`[bindx] compiled selection for <Entity ${entityType}> is malformed (version/shape check failed) — `
				+ 'falling back to the runtime children walk.',
			)
			return null
		}
		try {
			const selection = resolveCompiledRootSelection({
				compiled: compiledSelection,
				entityType,
				schemaRegistry,
				validateMode,
			})
			return { selection, queryKey: JSON.stringify(buildQueryFromSelection(selection)) }
		} catch (error) {
			console.warn(
				`[bindx] compiled selection for <Entity ${entityType}> failed to resolve — `
				+ 'falling back to the runtime children walk.',
				error,
			)
			return null
		}
	}, [compiledSelection, compiledEnabled, entityType, schemaRegistry, validateMode])

	// Runtime walk. Its collect no-ops when compiled & not validating, so children is
	// never called with a collector. In validate mode the walk runs to feed the diff;
	// a crash there is contained so it cannot break the compiled path.
	const runtimeResult = useSelectionCollection({
		entityType,
		depsKey,
		collect: collector => {
			if (compiledResult && !validateMode) {
				return null
			}
			try {
				return children(collector as EntityAccessor<unknown>)
			} catch (error) {
				if (!compiledResult) {
					throw error
				}
				console.error(
					`[bindx] validate-mode children walk of <Entity ${entityType}> crashed — `
					+ 'under-fetch diff skipped; the compiled selection still stands.',
					error,
				)
				return null
			}
		},
	})

	// Validate mode: warn on fields the runtime walk requests but the compiled root omits.
	useEffect(() => {
		if (compiledResult && validateMode) {
			validateCompiledRootSelection(compiledResult.selection, runtimeResult.selection, entityType)
		}
	}, [compiledResult, runtimeResult, validateMode, entityType])

	return compiledResult ?? runtimeResult
}
