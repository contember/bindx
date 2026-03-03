# 015: `as` type casts in createBindx

**Severity:** Code Quality
**Category:** Type Safety
**Reported by:** gamma

## Location

`packages/bindx-react/src/hooks/createBindx.tsx`

## Description

The `useEntity` and `useEntityList` hooks use `as` casts on their return values:

```typescript
return useEntityImpl(...) as EntityAccessorResult<...>
```

This violates the project's own no-casting guideline from CLAUDE.md and indicates a gap in the type model — the return type of `useEntityImpl` doesn't match what the typed wrapper expects.

## Impact

- Type errors between `useEntityImpl` and `createBindx` wrappers are silenced
- If `useEntityImpl` changes its return type, the cast will mask the breakage

## Fix

Fix the underlying type model so `useEntityImpl` returns a properly typed result without casting. This likely requires adjusting the generic type parameters to flow correctly through the implementation.
