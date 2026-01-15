# Entity Refs & Proxies - Simplification Plan

## Current Architecture Overview

### Two Parallel Systems

1. **Handle Classes** (`packages/bindx/src/handles/`)
   - `EntityHandle`, `HasOneHandle`, `HasManyListHandle`, `PlaceholderHandle`, `FieldHandle`
   - Stateful, cached, subscribed to store changes
   - Uses `createHandleProxy()` for direct field access

2. **JSX Proxies** (`packages/react-bindx/src/jsx/proxy.ts`)
   - `createCollectorProxy()`, `createRuntimeAccessor()`, `createPlaceholderAccessor()`
   - Stateless, ephemeral (created on each render)
   - Own proxy implementation (`wrapEntityRefWithFieldAccessProxy()`)

---

## Problems

### 1. Massive $ Alias Duplication (~400+ lines of boilerplate)

Every handle class has explicit getter/setter pairs for each property with $ prefix:

**EntityHandle.ts (lines 504-541):**
```typescript
get $id(): string { return this.id }
get $data(): TSelected | null { return this.data }
get $isDirty(): boolean { return this.isDirty }
get $persistedId(): string | null { return this.persistedId }
get $isNew(): boolean { return this.isNew }
get $fields(): SelectedEntityFields<T, TSelected> { return this.fields }
get $errors(): readonly FieldError[] { return this.errors }
get $hasError(): boolean { return this.hasError }
$addError(error: ErrorInput): void { this.addError(error) }
$clearErrors(): void { this.clearErrors() }
$clearAllErrors(): void { this.clearAllErrors() }
$on<E>(...) { return this.on(...) }
$intercept<E>(...) { return this.intercept(...) }
$onPersisted(...) { return this.onPersisted(...) }
$interceptPersisting(...) { return this.interceptPersisting(...) }
```

Same pattern repeated in:
- `HasOneHandle` - 30+ aliases (lines 968-1003)
- `HasManyListHandle` - 20+ aliases (lines 1383-1420)
- `PlaceholderHandle` - 30+ aliases (lines 1700-1731)
- `FieldHandle` - 15+ aliases

**Impact:** ~400 lines of pure boilerplate that adds no value.

---

### 2. Two Different Proxy Implementations

**proxyFactory.ts (lines 67-113):**
```typescript
export function createHandleProxy<T extends object>(handle: T, config: HandleProxyConfig<T>): T {
  return new Proxy(handle, {
    get(target, prop, _receiver) {
      if (typeof prop !== 'string') return Reflect.get(target, prop, target)
      if (prop.startsWith('$')) {
        const realProp = prop.slice(1)
        const value = Reflect.get(target, realProp, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
      if (config.knownProperties.has(prop)) {
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return config.getFields(target)[prop]
    },
  })
}
```

**proxy.ts (lines 41-58):**
```typescript
function wrapEntityRefWithFieldAccessProxy<T>(ref: EntityRef<T>): EntityAccessor<T> {
  return new Proxy(ref, {
    get(target, prop) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)
      if (ENTITY_ACCESSOR_PROPERTIES.has(prop)) return Reflect.get(target, prop)
      return target.$fields[prop as keyof EntityFields<T>]
    },
  }) as EntityAccessor<T>
}
```

**Issue:** Both do essentially the same thing - wrap an object with a Proxy that:
- Passes through known properties
- Delegates `obj.fieldName` to `obj.$fields.fieldName`
- Supports `$prop` → `prop` mapping (only in createHandleProxy)

---

### 3. Overcomplicated Collector/Runtime Refs

`createCollectorFieldRef()` (lines 128-269) and `createRuntimeFieldRef()` (lines 347-735) create a single object implementing ALL ref interfaces:

```typescript
type CollectorRef = FieldRef<unknown> & HasManyRef<unknown> & HasOneRef<unknown>
```

This results in objects with 150+ properties/methods:
- FieldRef properties (value, serverValue, isDirty, setValue, inputProps, errors, hasError, addError, clearErrors, onChange, onChanging)
- HasManyRef properties (length, items, map, add, remove, move, connect, disconnect, reset, onItemConnected, etc.)
- HasOneRef properties ($id, $fields, $entity, $state, $connect, $disconnect, $delete, $onConnect, etc.)
- All with both prefixed and non-prefixed versions

**Why:** During collection phase, we don't know the field type without schema access. The collector creates a "universal" ref that works for any field type.

**Impact:**
- Large objects with many no-op stubs
- Complex code that's hard to understand
- Type safety issues (FieldRef shouldn't have `items` property)

---

### 4. Two Placeholder Implementations

**PlaceholderHandle class** (`EntityHandle.ts:1433-1732`) - 300 lines:
- Full class with all EntityRef methods
- Reads/writes to `relation.placeholderData` in store
- Used by `HasOneHandle` when relation is disconnected

**createPlaceholderAccessor() function** (`proxy.ts:808-873`) - 65 lines:
- Simple function creating placeholder EntityAccessor
- Read-only (all setters are no-ops)
- Used by JSX runtime proxy for disconnected hasOne

**Issue:** Two different implementations for similar purpose, different capabilities.

---

### 5. Interface Definitions Include Both Versions

`types.ts` defines each property twice in interfaces:

```typescript
export interface FieldRef<T> {
  readonly value: T | null
  readonly $value: T | null  // duplicate

  readonly serverValue: T | null
  readonly $serverValue: T | null  // duplicate

  readonly isDirty: boolean
  readonly $isDirty: boolean  // duplicate

  setValue(value: T | null): void
  $setValue(value: T | null): void  // duplicate

  // ... 20+ more duplicated properties
}
```

Same pattern in `HasManyRef` and `HasOneRef`.

**Impact:**
- Interface definitions are twice as long as needed
- Every implementation must provide both versions
- Type definitions are harder to read

---

### 6. Inconsistent Proxy Usage

| Handle | Uses Proxy | Direct Field Access |
|--------|-----------|---------------------|
| EntityHandle | ✅ | `entity.title` → `entity.$fields.title` |
| HasOneHandle | ✅ | `hasOne.name` → `hasOne.$entity.$fields.name` |
| HasManyListHandle | ❌ | Must use `$items` explicitly |
| PlaceholderHandle | ❌ | Must use `$fields` explicitly |

**Issue:** Inconsistent API - some handles support direct field access, others don't.

---

## Proposed Solutions

### Solution 1: $ Aliasing Utility

Create a utility that handles $ aliasing at runtime instead of manual getter/setter pairs:

```typescript
// Option A: Proxy-based (no runtime overhead for unused aliases)
function withAliases<T extends object>(target: T): T {
  return new Proxy(target, {
    get(target, prop) {
      if (typeof prop === 'string' && prop.startsWith('$')) {
        const realProp = prop.slice(1)
        const value = Reflect.get(target, realProp)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return Reflect.get(target, prop)
    }
  })
}

// Option B: Decorator-based (compile-time)
@withAliases
class EntityHandle { ... }
```

**Savings:** ~400 lines of code removed.

---

### Solution 2: Unify Proxy Implementations

Single shared proxy function:

```typescript
// packages/bindx/src/handles/proxyFactory.ts
export function createFieldAccessProxy<T extends object>(
  target: T,
  options: {
    knownProperties: Set<string | symbol>
    getFields: (target: T) => object
    supportDollarAliases?: boolean
  }
): T
```

Used by both Handle classes and JSX proxies.

---

### Solution 3: Simplify Ref Interfaces

Remove $ prefixed duplicates from interface definitions. Handle aliasing at runtime.

**Before:**
```typescript
interface FieldRef<T> {
  readonly value: T | null
  readonly $value: T | null
  setValue(value: T | null): void
  $setValue(value: T | null): void
}
```

**After:**
```typescript
interface FieldRef<T> {
  readonly value: T | null
  setValue(value: T | null): void
}
// $ aliases handled by proxy at runtime
```

**Note:** This is a breaking change for TypeScript users who explicitly use $ prefixed properties.

---

### Solution 4: Consolidate Placeholder

Single placeholder implementation in bindx:

```typescript
// packages/bindx/src/handles/PlaceholderHandle.ts
export class PlaceholderHandle<T> implements EntityRef<T> {
  // Single implementation
}
```

JSX proxy uses this class instead of creating its own placeholder.

---

### Solution 5: Typed Collector Refs (Optional)

If schema is available during collection, create typed refs:

```typescript
function createCollectorRef(scope: SelectionScope, fieldName: string, schema: SchemaRegistry): FieldRef | HasOneRef | HasManyRef {
  const fieldType = schema.getFieldType(scope.entityType, fieldName)

  switch (fieldType) {
    case 'scalar': return createCollectorScalarRef(scope, fieldName)
    case 'hasOne': return createCollectorHasOneRef(scope, fieldName)
    case 'hasMany': return createCollectorHasManyRef(scope, fieldName)
  }
}
```

**Trade-off:** Requires schema access during collection phase. May not be worth the complexity.

---

## Recommended Priority

1. **High:** Solution 1 ($ aliasing utility) - immediate code reduction, low risk
2. **High:** Solution 3 (simplify interfaces) - cleaner API, needs migration guide
3. **Medium:** Solution 2 (unify proxies) - reduces duplication
4. **Medium:** Solution 4 (consolidate placeholder) - single source of truth
5. **Low:** Solution 5 (typed collectors) - complex, marginal benefit

---

## File Impact Summary

| File | Current Lines | Est. After Refactor |
|------|--------------|---------------------|
| EntityHandle.ts | 1732 | ~1200 |
| FieldHandle.ts | 249 | ~180 |
| types.ts | 749 | ~450 |
| proxy.ts | 874 | ~600 |
| proxyFactory.ts | 113 | ~80 |
| **Total** | **3717** | **~2510** |

**Estimated reduction:** ~1200 lines (32%)
