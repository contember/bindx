# 006: Dual persistence managers

**Severity:** Important
**Category:** Architecture
**Reported by:** gamma

## Location

- `packages/bindx/src/core/PersistenceManager.ts` (~525 lines)
- `packages/bindx/src/persistence/BatchPersister.ts` (~860 lines)

## Description

Two classes handle persistence with overlapping responsibilities. `BatchPersister` is the more capable implementation — it handles transactional persistence, pessimistic mode, and single-entity scope. `PersistenceManager` appears to be the original implementation that was superseded but never removed.

## Impact

- Two code paths for the same operation
- Fixes applied to one may not be applied to the other (e.g., the `deepEqual` vs `JSON.stringify` issue exists in `BatchPersister` but `PersistenceManager` uses `deepEqual`)
- Confusing for contributors — unclear which to use
- Maintenance burden

## Fix

Remove `PersistenceManager` and route all persistence through `BatchPersister`.
