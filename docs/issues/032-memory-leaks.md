# 032: Memory leaks — parent-child graph, batcher listeners, timers, item handles

**Severity:** Medium-High
**Category:** Bug / Memory
**Status:** Open
**Supersedes:** round-1 #019 (abort listeners) — fixed in MockAdapter, same bug class survives in QueryBatcher

## Location

- `packages/bindx/src/store/SubscriptionManager.ts` + `SnapshotStore.ts:812` — `unregisterParentChild` facade exists but is **not wired to disposal**
- `packages/bindx/src/handles/HasManyListHandle.ts:180`, `HasOneHandle.ts:284`, `core/ActionDispatcher.ts:229,305,319` — `registerParentChild` called during render/dispatch
- `packages/bindx/src/store/SnapshotStore.ts:886-895` — `clear()` does not reset `SubscriptionManager` / `rekeyedEntities`
- `packages/bindx-react/src/batching/QueryBatcher.ts:40-49` — abort listener removed only on abort, not on resolve
- `packages/bindx/src/notifications/NotificationStore.ts:10,49` — module-global `nextId`, uncleared `setTimeout` timers
- `packages/bindx-react/src/hooks/useEntityList.ts:311` — per-item `EntityHandle.create()` never disposed

## Description

Several unbounded-growth / leak sites:

1. **`childToParents` grows unbounded.** `registerParentChild` runs on every `HasManyListHandle.items` render and from the dispatcher, but `unregisterParentChild` is only reachable via a facade method that nothing calls from `dispose()`/`removeEntity`. A long-lived grid paginating large lists accumulates the parent→child graph forever (and slows notification recursion).
2. **`clear()` is half a reset** — leaves subscription maps and the `rekeyedEntities` temp→persisted redirect populated.
3. **QueryBatcher** removes its abort listener only when abort fires; on normal resolve the listener stays attached (benign with per-fetch controllers, leaks with a reused long-lived signal). Same class as round-1 #019.
4. **NotificationStore** uses a process-global `nextId` (id collisions across providers/tests) and never clears auto-dismiss timers on teardown.
5. **`useEntityList`** never disposes the per-item handles it creates on rebuild (compounds #029).

## Fix

1. Drive `unregisterParentChild` from handle `dispose()` / `removeEntity`; consider `WeakRef`/subscription-scoped linkage.
2. Add `SubscriptionManager.clear()` and clear `rekeyedEntities` in `clear()`.
3. Remove the batcher abort listener on both resolve and reject.
4. Make `nextId` an instance field; clear timers via a `destroy()` wired to provider unmount.
5. Dispose item handles (resolved jointly with #029's per-id handle cache).
