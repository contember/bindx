import { useCallback, useRef, useSyncExternalStore } from 'react'
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
	const seen = new Map<string, Set<string>>()

	for (const ref of refs) {
		if (!hasFieldRefMeta(ref)) continue
		const meta = ref[FIELD_REF_META]
		if (!meta) continue
		let ids = seen.get(meta.entityType)
		if (!ids) {
			ids = new Set()
			seen.set(meta.entityType, ids)
		}
		if (ids.has(meta.entityId)) continue
		ids.add(meta.entityId)
		targets.push({ entityType: meta.entityType, entityId: meta.entityId })
	}

	targets.sort((left, right) => {
		if (left.entityType < right.entityType) return -1
		if (left.entityType > right.entityType) return 1
		if (left.entityId < right.entityId) return -1
		if (left.entityId > right.entityId) return 1
		return 0
	})
	return targets
}

type FieldAccessorFor<TRef> = TRef extends FieldRef<infer TValue>
	? FieldAccessor<TValue>
	: TRef extends null
		? null
		: never

type FieldRefFor<TRef> = TRef extends FieldRef<infer TValue>
	? FieldRef<TValue>
	: TRef extends null
		? null
		: never

type FieldAccessorTuple<TRefs extends readonly unknown[]> = {
	readonly [TIndex in keyof TRefs]: FieldAccessorFor<TRefs[TIndex]>
}

type FieldRefTuple<TRefs extends readonly unknown[]> = {
	readonly [TIndex in keyof TRefs]: FieldRefFor<TRefs[TIndex]>
}

/** Internal subscription path for metadata-bearing refs of any kind. */
export function useRefSubscription(refs: readonly unknown[]): readonly unknown[] {
	const store = useSnapshotStore()
	const targets = collectTargets(refs)
	const subscriptionKey = JSON.stringify(targets)
	const stableTargetsRef = useRef({ subscriptionKey, targets })
	if (stableTargetsRef.current.subscriptionKey !== subscriptionKey) {
		stableTargetsRef.current = { subscriptionKey, targets }
	}
	const stableTargets = stableTargetsRef.current.targets
	const hasTargets = stableTargets.length > 0

	const subscribe = useCallback(
		(callback: () => void): (() => void) => {
			const unsubscribes = stableTargets.map(target =>
				store.subscribeToEntity(target.entityType, target.entityId, callback),
			)
			return () => {
				for (const unsubscribe of unsubscribes) unsubscribe()
			}
		},
		[store, stableTargets],
	)

	const getSnapshot = useCallback(
		(): number => (hasTargets ? store.getVersion() : 0),
		[store, hasTargets],
	)

	useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
	return refs
}

/**
 * Subscribes to every entity behind `refs` with a single hook, so the hook count stays
 * constant no matter how many refs are passed. Use it wherever the number of refs is
 * driven by data or by children (`<Switch>` cases, condition DSL fields) — calling
 * {@link useField} in a loop breaks the rules of hooks the moment the count changes.
 *
 * @example
 * ```tsx
 * const accessors = useFields([article.title, article.publishedAt])
 * ```
 */
export function useFields<const TRefs extends readonly unknown[]>(
	refs: TRefs & FieldRefTuple<TRefs>,
): FieldAccessorTuple<TRefs>
export function useFields(refs: ReadonlyArray<unknown>): unknown {
	return useRefSubscription(refs)
}
