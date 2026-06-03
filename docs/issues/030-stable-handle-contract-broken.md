# 030: "Stable handle" contract broken — handles rebuilt on every change

**Severity:** Medium-High
**Category:** Performance / Design
**Status:** Open

## Location

- `packages/bindx-react/src/hooks/useEntity.ts:326-340` — `snapshot` in `rawHandle` `useMemo` deps + dispose effect
- `packages/bindx-react/src/jsx/components/Entity.tsx:291-301` — `version` in handle-creation deps
- `packages/bindx/src/handles/EntityHandle.ts:474-506` — `get fields()` builds a fresh `Proxy` per access
- `packages/bindx/src/handles/EntityHandle.ts:58` — docstring promising stable identity

## Description

`EntityHandle` is designed as a stable accessor that caches field/relation sub-handles. But consumers rebuild it on every data change: `useEntity` lists `snapshot` in the `rawHandle` deps and `EntityHandleRenderer` lists `version` — so every keystroke creates a new handle, disposes the old one, and discards `fieldHandleCache`/`relationHandleCache`. The handle caching design is thereby defeated under editing.

Separately, `get fields()` constructs a brand-new `Proxy({}, …)` on every access, and `proxyFactory` calls `getFields(target)` on every field read — so `entity.title` then `entity.author` allocates two throwaway proxies (N×M in a grid).

## Impact

Allocation/dispose churn on every edit; loss of accessor identity stability that downstream `useMemo`/`React.memo` rely on. The code contradicts its own stated design.

## Fix

1. Keep the handle stable: drop `snapshot`/`version` from the handle-creation deps (reactivity already flows through `useStoreSubscription`; the result `useMemo` still lists `snapshot`). Force memoized children to re-render via a `version` prop instead of a new handle.
2. Memoize the `fields` proxy on the handle instance (lazy-create once).
3. Add a `nestedCache` to `FieldHandle.nested()` so nested-field accessors are identity-stable too.
