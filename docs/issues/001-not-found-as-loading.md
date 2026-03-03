# 001: `not_found` state treated as loading

**Severity:** Critical
**Category:** Bug
**Reported by:** gamma, delta

## Location

`packages/bindx-react/src/hooks/useEntityImpl.ts:203-205`

## Description

When an entity doesn't exist, the hook returns a loading state instead of a distinct `not_found` result. Users see an infinite spinner instead of a "not found" message.

```typescript
if (coreResult.status === 'not_found') {
    return createLoadingAccessor(derivedId) // Treat not_found as loading for now
}
```

The comment "for now" confirms this was intended as a temporary workaround.

## Impact

- Users cannot distinguish between "still loading" and "entity doesn't exist"
- Components display an infinite spinner for deleted or non-existent entities
- No way to show a 404-style UI

## Fix

Add a `not_found` state to the `EntityAccessorResult` discriminated union and propagate it through the hook return value. Consumers can then handle it explicitly:

```typescript
const entity = useEntity('Post', { id })
if (entity.state === 'not_found') return <NotFound />
```
