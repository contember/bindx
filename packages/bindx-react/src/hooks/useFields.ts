import { useCallback, useSyncExternalStore } from 'react'
import {
	FIELD_REF_META,
	type FieldAccessor,
	type FieldRef,
	type FieldRefMeta,
} from '@contember/bindx'
import { useSnapshotStore } from './BackendAdapterContext.js'

/** Entity to watch, derived from a ref's field metadata. */
interface SubscriptionTarget {
	readonly entityType: string
	readonly entityId: string
}

function hasFieldRefMeta(value: unknown): value is { readonly [FIELD_REF_META]: FieldRefMeta } {
	return typeof value === 'object' && value !== null && FIELD_REF_META in value
}

/** Deduplicates the entities behind `refs`; entries without field metadata are ignored. */
function collectTargets(refs: ReadonlyArray<unknown>): SubscriptionTarget[] {
	const targets: SubscriptionTarget[] = []
	const seen = new Set<string>()

	for (const ref of refs) {
		if (!hasFieldRefMeta(ref)) continue
		const meta = ref[FIELD_REF_META]
		if (!meta) continue
		const key = `${meta.entityType}:${meta.entityId}`
		if (seen.has(key)) continue
		seen.add(key)
		targets.push({ entityType: meta.entityType, entityId: meta.entityId })
	}

	return targets
}

/**
 * Subscribes to every entity behind `refs` with a single hook, so the hook count stays
 * constant no matter how many refs are passed. Use it wherever the number of refs is
 * driven by data or by children (`<Switch>` cases, condition DSL fields) — calling
 * {@link useField} in a loop breaks the rules of hooks the moment the count changes.
 *
 * Nulls and values without field metadata are ignored, which makes it safe to pass
 * loosely typed collections such as the fields of a `Condition`.
 *
 * @example
 * ```tsx
 * // Values + subscription for a variable number of fields
 * const accessors = useFields([article.title, article.publishedAt])
 *
 * // Subscription only (condition DSL refs are not necessarily FieldRefs)
 * useFields(collectConditionFields(condition))
 * ```
 */
export function useFields<T>(refs: ReadonlyArray<FieldRef<T> | null>): ReadonlyArray<FieldAccessor<T> | null>
export function useFields(refs: ReadonlyArray<unknown>): void
export function useFields(refs: ReadonlyArray<unknown>): unknown {
	const store = useSnapshotStore()
	const targets = collectTargets(refs)
	const subscriptionKey = JSON.stringify(targets)
	const hasTargets = targets.length > 0

	// `subscriptionKey` fully determines `targets`, so keeping the capture from the render that
	// last changed the key is equivalent — and it avoids resubscribing on every render.
	const subscribe = useCallback(
		(callback: () => void): (() => void) => {
			const unsubscribes = targets.map(target =>
				store.subscribeToEntity(target.entityType, target.entityId, callback),
			)
			return () => {
				for (const unsubscribe of unsubscribes) unsubscribe()
			}
		},
		[store, subscriptionKey],
	)

	const getSnapshot = useCallback(
		(): number => (hasTargets ? store.getVersion() : 0),
		[store, hasTargets],
	)

	useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

	// Ref proxies already expose accessor properties at runtime — the overloads widen the type.
	return refs
}
