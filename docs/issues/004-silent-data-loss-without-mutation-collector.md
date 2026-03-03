# 004: Silent data loss without MutationCollector

**Severity:** Critical
**Category:** Bug
**Reported by:** delta

## Location

`packages/bindx/src/persistence/BatchPersister.ts:394-404`

## Description

When `mutationCollector` is not configured, `buildMutations()` falls back to `collectCreateData`/`collectUpdateData` methods that only handle scalar fields. All relation changes (has-one connect/disconnect, has-many add/remove) are silently dropped without any warning.

```typescript
// Fallback paths only collect scalar data
data = this.mutationCollector?.collectCreateData(...)
    ?? this.collectCreateData(...)   // scalars only
data = this.mutationCollector?.collectUpdateData(...)
    ?? this.collectUpdateData(...)   // scalars only
```

## Impact

- Relation changes are persisted on the client but never sent to the server
- After a page reload, all relation modifications are lost
- No error or warning is shown — users believe their changes were saved
- This is a data integrity issue

## Fix

Options:
1. Make `mutationCollector` required in `BatchPersister` constructor
2. Throw an error when relation changes exist but no `mutationCollector` is available
3. Provide a default `MutationCollector` implementation that always handles relations
