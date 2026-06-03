# 034: God objects, large files, and a too-weak dependency sort

**Severity:** Medium
**Category:** Maintainability / Design
**Status:** Open
**Supersedes:** round-1 #013 (large files) — earlier list split; new offenders grew since

## Location

- `packages/bindx/src/persistence/BatchPersister.ts` (1165 lines) — God object
- `packages/bindx/src/persistence/BatchPersister.ts:372` — `sortByDependencies` (3-bucket, not topological)
- `packages/bindx/src/persistence/BatchPersister.ts:480-547` — inline `collectCreateData`/`collectUpdateData` duplicating `MutationCollector`
- `packages/bindx-react/src/hooks/useEntity.ts` (409), `useEntityList.ts` (438) — incl. a verbatim-duplicated selection block
- `packages/bindx-react/src/jsx/components/Entity.tsx` (407)

## Description

`BatchPersister` mixes 4+ responsibilities: scope→dirty collection, dependency ordering, mutation building (with a **second** field-diff implementation duplicating `MutationCollector`), transaction execution, result application/commit/rollback, error mapping, temp-id→real-id reconciliation, and pessimistic capture/restore.

`sortByDependencies` only orders create < update < delete; cross-entity reference ordering relies implicitly on nesting creates under their parent. It cannot satisfy create-before-connect between two **sibling top-level** creates, and has no cycle detection — despite the docstring claiming dependency ordering.

`useEntity`/`useEntityList`/`Entity.tsx` all exceed the 300-line guideline; the two hooks share a verbatim-duplicated 11-line selection-resolution block.

## Impact

Hard to test/reason about; the duplicate field-diff path recreates the round-1 #006 "two code paths for one operation" smell one layer down; latent create-ordering bug.

## Fix

1. Extract `NestedResultReconciler`, `PersistResultApplier`, `PessimisticStateManager` from `BatchPersister`; delete the inline collectors so `MutationCollector` is the single mutation-building authority.
2. Replace the 3-bucket sort with a real topological sort over collected `connect`/`create` ids, with cycle detection.
3. Extract `useResolvedSelection` (kills the duplicate block), `useEntityFetch`, and a shared `createBindxServices` factory (also dedupes the two providers); split `EntityCreateMode` + default fallbacks out of `Entity.tsx`.
