# 017: Hardcoded `__temp_` checks instead of `isTempId()`

**Severity:** Code Quality
**Category:** Consistency

## Locations

- `packages/bindx/src/core/PersistenceManager.ts:361`
- `packages/bindx/src/persistence/BatchPersister.ts:480`
- `packages/bindx/src/persistence/MutationCollector.ts` (10+ occurrences at lines 359, 362, 403, 458, 481, 495, 531, 588, 602, 605)
- `packages/bindx-react/src/hooks/useEntityListImpl.ts:200`

## Description

The `isTempId()` utility function exists in `SnapshotStore.ts` but many places duplicate the check with hardcoded `startsWith('__temp_')`:

```typescript
// Utility exists:
export function isTempId(id: string): boolean {
    return id.startsWith('__temp_')
}

// But many places use hardcoded check:
if (value.startsWith('__temp_')) { ... }
```

## Impact

- Single source of truth violated
- If the temp ID prefix ever changes, 15+ locations need updating
- Related to issue #003 — the prefix mismatch is harder to catch when the check is scattered

## Fix

Replace all hardcoded `startsWith('__temp_')` checks with `isTempId()`. Export `isTempId` from the package's public API.
