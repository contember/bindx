# 037: Render-phase store mutations risk tearing under concurrent React

**Severity:** Medium
**Category:** Correctness / Concurrency
**Status:** Open

## Location

- `packages/bindx/src/handles/HasManyListHandle.ts:139-198` — `items` getter writes to the store
- `packages/bindx-react/src/jsx/components/Entity.tsx` (create-mode) — `useSyncExternalStore` + snapshot cache
- `packages/bindx-react/src/jsx/componentFactory.ts:336-341` — collection runs `conditionFn`/`renderFn` outside React

## Description

The `HasManyListHandle.items` getter calls `getOrCreateHasMany`, `refreshServerData`, `registerParentChild`, and `markEmbeddedDataPropagated` — all **store writes** — while React is computing render output (guarded by `skipNotify`). Writing to the external store inside render is exactly what `useSyncExternalStore` is meant to protect against: under concurrent rendering, a torn/abandoned render can leave `lastPropagatedData`/`hasMany` state advanced for a render that never commits.

Relatedly, the JSX collection phase invokes component render/condition functions directly (outside React), so any hook call inside a `createComponent` body throws or corrupts the dispatcher, and value-dependent branches silently take the proxy stub path.

## Impact

Latent correctness bugs as concurrent features (transitions, `useDeferredValue`, Suspense) become default.

## Fix

Move lazy relation materialization out of the render-time getter into the load/effect path (when server data lands), so reads stay pure. Document (and ideally dev-guard) the "collection render must be pure and hook-free" contract.
