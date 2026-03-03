# 012: `JSON.parse(byKey)` roundtrip hack

**Severity:** Important
**Category:** Architecture
**Reported by:** gamma

## Location

`packages/bindx-react/src/hooks/useEntityCore.ts:83, 152`

## Description

The code serializes `by` to a JSON string for stable identity in React hooks, then parses it back later in an async callback to avoid stale closure issues:

```typescript
const byKey = useMemo(() => JSON.stringify(by), [by])   // line 83
// ...later, inside an async fetch:
const currentBy = JSON.parse(byKey) as Record<string, unknown>   // line 152
```

## Impact

- Inefficient — serialization + deserialization on every change
- Breaks with non-serializable values (functions, symbols, circular refs)
- The `as Record<string, unknown>` cast hides potential type issues
- Indicates a deeper architectural problem with how `by` is threaded through the async flow

## Fix

Use `useRef` to hold the current `by` value:

```typescript
const byRef = useRef(by)
byRef.current = by
// ...later:
const currentBy = byRef.current
```
