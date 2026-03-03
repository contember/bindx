# 014: `any` types in componentBuilder

**Severity:** Code Quality
**Category:** Type Safety
**Reported by:** alpha, gamma, delta

## Location

`packages/bindx-react/src/jsx/componentBuilder.ts:88, 92, 96, 98, 111, 113, 115, 142, 154, 165`

## Description

The `ComponentBuilderImpl` class has multiple `@typescript-eslint/no-explicit-any` suppressions. Methods like `render()`, `entity()`, `interfaces()`, `props()` use `any` in their signatures or implementations.

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
private readonly conditionFn: ((props: any) => Condition) | null = null
```

## Impact

- Type safety is lost in the component definition API, which is a public API surface
- Type errors in component builders won't be caught at compile time
- Consumers may pass incorrect types without warnings

## Fix

Replace `any` with proper types using conditional types, overloads, or generic constraints. Even if complex, this is a public API worth investing in.
