# 016: `as any` casts in ContemberAdapter

**Severity:** Code Quality
**Category:** Type Safety

## Location

`packages/bindx/src/adapter/ContemberAdapter.ts:67, 75, 76, 91, 114, 236, 243`

## Description

Multiple `as any` casts when interacting with Contember's client library:

```typescript
return this.queryBuilder.get(query.entityType, { by: query.by as any }, selection)
filter: query.filter as any,
orderBy: query.orderBy as any,
data: changes as any,
```

## Impact

- Hides type incompatibilities between Bindx's internal types and Contember client's types
- If the Contember client library updates its types, these casts will silently hide breakage
- Makes it impossible to catch type errors at compile time for the adapter layer

## Fix

Create properly typed wrapper types or fix the underlying type mismatch between Bindx types and the Contember client SDK.
