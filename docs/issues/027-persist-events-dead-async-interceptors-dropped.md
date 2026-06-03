# 027: Persist-lifecycle events never fire; async interceptors silently dropped

**Severity:** High
**Category:** Bug / Architecture
**Status:** Open
**Supersedes:** round-1 #008 (interceptors unusable with sync dispatch) — sync field path was fixed, but adjacent holes remain

## Location

- `packages/bindx/src/events/types.ts:141-179, 299-305` — `entity:persisting/persisted/persistFailed/deleting/deleted` declared
- `packages/bindx/src/handles/EntityHandle.ts:613-622` — `onPersisted()` / `interceptPersisting()` public API
- `packages/bindx-react/src/hooks/useEntityBeforePersist.ts` — public hook
- `packages/bindx/src/persistence/BatchPersister.ts` — **never emits any of these events**
- `packages/bindx/src/events/EventEmitter.ts:385-391` — async interceptor skip-with-warning
- `packages/bindx/src/core/ActionDispatcher.ts:85,127-160` — `dispatchAsync`, `updateActionFromEvent`
- `packages/bindx/src/persistence/types.ts:220-225` — dead `onEntityPersisting/onEntityPersisted` callbacks

## Description

Three related defects in the event/interceptor pipeline:

1. **Dead persist events.** The entire `entity:persisting/persisted/persistFailed/deleting/deleted` family is declared in the type map and exposed via three public APIs, but `BatchPersister` never emits them (it only dispatches the `setPersisting` *state* action). Verified: these strings appear only as subscription targets and type defs — never emitted. A validation guard wired via `useEntityBeforePersist` is a silent no-op.
2. **Async interceptors silently dropped.** `dispatchAsync` is the only path that awaits interceptors and has **zero production callers** (all ~40 dispatch sites are sync). The sync path detects a returned Promise and skips the interceptor with a `console.warn`. The public `Interceptor` type advertises `Promise<InterceptorResult>`, so an async interceptor type-checks then is discarded at runtime.
3. **Partial `modify` support.** `updateActionFromEvent` reads back only `field:changing`, `relation:connecting`, `hasMany:connecting`. For `relation:disconnecting/deleting` and `hasMany:disconnecting` a `'modify'` result is accepted and then silently ignored.

## Impact

APIs shaped like validation/lifecycle guards (`interceptPersisting`, `onPersisted`, async interceptors, `modify` on disconnect) silently do nothing — a data-integrity trap worse than a missing feature.

## Fix

1. Either emit persist/delete events from `BatchPersister` (run `entity:persisting` interceptors **before** `buildMutations`, emit `persisted`/`persistFailed` from result processing) **or** delete the dead type-map entries, the `EntityHandle` APIs, `useEntityBeforePersist`, and the unused `PersistOptions` callbacks.
2. Commit to one dispatch model. If sync-only: narrow `Interceptor` to non-Promise results so async interceptors are a **compile error**, and remove `dispatchAsync`. If async: make handle mutations async and route through `runInterceptors`.
3. Split the `Interceptor` type so `modify` is only available on the three redirectable events.
