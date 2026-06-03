# 029: Global version counter defeats fine-grained reactivity

**Severity:** High
**Category:** Performance / Architecture
**Status:** Open

## Location

- `packages/bindx/src/store/SubscriptionManager.ts:104-106` — `getVersion()` returns the single `globalVersion`
- `packages/bindx/src/store/SubscriptionManager.ts:113,162,200,257` — `globalVersion++` on every mutation
- `packages/bindx-react/src/hooks/useEntityList.ts:233,290` — global `subscribe` + `getSnapshot` keyed on `getVersion()`
- `packages/bindx-react/src/hooks/useAccessor.ts:57-61` — entity-scoped subscribe, but `getSnapshot` keyed on global version
- No `getEntityVersion(type, id)` accessor exists on the store

## Description

The store maintains entity-level subscriptions, but the only version counter it exposes is `globalVersion`, which is bumped on **every** mutation anywhere. `useEntityList` subscribes globally and caches `getSnapshot` on `getVersion()`; `useAccessor` subscribes narrowly but still snapshots the global version.

Consequence: editing one field of one unrelated entity invalidates the list's snapshot cache → `items.map(...)` re-runs, allocating fresh `EntityHandle.create()` proxies for every row → new `items` array identity → the whole list and every child consuming `items` re-renders. O(n) proxy allocation + full subtree reconciliation on unrelated edits — and grids/lists are the framework's primary surface.

## Impact

Dominant render cost in any non-trivial admin grid; entity-level subscription granularity never pays off because the snapshot value is global.

## Fix

1. Add `store.getEntityVersion(entityType, id)` (and a relation variant).
2. Key `useEntityList`'s snapshot cache on the versions of its **member** entities, and memoize item handles by id (a `Map<id, EntityAccessor>`) so the array and handle identities survive when membership is unchanged.
3. Key `useAccessor` on the entity's own version. Per-row reactivity already flows through each row's own `useAccessor`, so the list itself only needs to react to membership/order changes.

This unblocks #030 (stable handles).
