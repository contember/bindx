# 007: Dual source of truth for has-many state

**Severity:** Important
**Category:** Architecture
**Reported by:** delta

## Location

`packages/bindx/src/persistence/MutationCollector.ts`

## Description

Has-many relation state is tracked in two places simultaneously:

1. **`StoredHasManyState`** — tracks `plannedRemovals`, `plannedConnections`, `createdEntities` at the relation level
2. **`EntitySnapshot.data[fieldName]`** — contains the current items array

`MutationCollector.collectHasManyOperations()` reads both and reconciles them with complex deduplication logic. This creates a risk of the two representations going out of sync.

## Impact

- Complex reconciliation code that's hard to reason about
- Potential for inconsistencies between planned operations and actual items array
- Makes the mutation collection logic fragile and error-prone

## Fix

Make one representation authoritative:
- **Option A:** `StoredHasManyState` is the source of truth; derive the items array from it
- **Option B:** The items array is authoritative; compute planned operations by diffing against `serverData`
