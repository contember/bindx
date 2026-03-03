# 021: Debug flag via globalThis string key

**Severity:** Minor
**Category:** Code Quality
**Reported by:** delta

## Description

Debug mode is toggled via a magic global string key with type casting:

```typescript
(globalThis as Record<string, unknown>)['__BINDX_DEBUG__']
```

## Impact

- Fragile — no autocomplete, no type safety, no discoverability
- Uses `as` cast which violates project guidelines
- No documentation on how to enable debug mode

## Fix

Use an injectable logger or a configuration option on the `BindxProvider`:

```typescript
<BindxProvider debug={true}>
```
