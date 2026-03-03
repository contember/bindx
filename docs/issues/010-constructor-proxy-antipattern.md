# 010: Constructor anti-pattern with Proxy

**Severity:** Important
**Category:** Architecture
**Reported by:** delta

## Location

- `packages/bindx/src/handles/FieldHandle.ts:37-38`
- `packages/bindx/src/handles/EntityHandle.ts:99, 579, 1037, 1452`

## Description

Handle constructors return a Proxy instance instead of `this`, suppressing the `no-constructor-return` ESLint rule:

```typescript
constructor(...) {
    super(...)
    // eslint-disable-next-line no-constructor-return
    return createAliasProxy(this) as FieldHandle<T>
}
```

## Impact

- Violates JavaScript constructor semantics — `new FieldHandle(...)` returns a different object than the one being constructed
- `instanceof` checks may not work as expected
- Makes the code harder to understand and debug
- Fragile — depends on engine-specific constructor return behavior

## Fix

Use static factory methods:

```typescript
class FieldHandle {
    private constructor(...) { }

    static create(...): FieldHandle {
        return createAliasProxy(new FieldHandle(...))
    }
}
```
