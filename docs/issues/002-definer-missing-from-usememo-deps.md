# 002: Memoization bug — `definer` missing from useMemo deps

**Severity:** Critical
**Category:** Bug
**Reported by:** gamma

## Location

`packages/bindx-react/src/hooks/createBindx.tsx:316-320, 448-452`

## Description

In `useEntity` and `useEntityList`, the `selectionMeta` is memoized with `[entityType]` as the only dependency. The `definer` callback is excluded (with an explicit eslint-disable), so if `definer` changes between renders, the selection stays frozen on the first render's value.

```typescript
const selectionMeta = useMemo(
    () => resolveSelectionMeta(definer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType],  // missing definer
)
```

## Impact

- Changing the selection definer (e.g., conditionally fetching different fields) has no effect after the first render
- Stale data is displayed without any error or warning
- The eslint-disable comment hides the issue from lint checks

## Fix

Either:
1. Add `definer` to the dependency array
2. Ensure callers provide a stable `definer` reference via `useCallback` and document this requirement
3. Use a ref-based pattern to always read the latest `definer` without triggering re-memoization
