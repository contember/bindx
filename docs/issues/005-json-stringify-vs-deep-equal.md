# 005: `JSON.stringify` vs `deepEqual` inconsistency

**Severity:** Critical
**Category:** Bug
**Reported by:** gamma, delta

## Location

- `packages/bindx/src/persistence/BatchPersister.ts:458` (uses `JSON.stringify`)
- `packages/bindx/src/handles/FieldHandle.ts` (uses `deepEqual`)
- `packages/bindx/src/persistence/MutationCollector.ts` (uses `deepEqual`)

## Description

`BatchPersister.collectUpdateData()` uses `JSON.stringify` for value comparison while `FieldHandle.isDirty` and `MutationCollector` use `deepEqual`.

```typescript
// BatchPersister — incorrect
if (JSON.stringify(value) !== JSON.stringify(serverData[key])) {
    changes[key] = value
}
```

## Impact

`JSON.stringify` differs from `deepEqual` in several ways:
- **Order-sensitive**: `{a:1, b:2}` and `{b:2, a:1}` stringify differently but are semantically equal
- **Ignores `undefined`**: `{a: undefined}` stringifies to `{}`, losing the key
- **Cannot handle circular references**: throws at runtime
- **`Date` objects**: stringified as ISO strings, not compared as dates

This means `BatchPersister` and `FieldHandle` can disagree on whether a field is dirty, leading to either missed updates or unnecessary mutations.

## Fix

Replace `JSON.stringify` comparison with `deepEqual` in `BatchPersister`. The `deepEqual` utility already exists in `utils/deepEqual.ts`.
