# 008: Interceptors unusable with sync dispatch

**Severity:** Important
**Category:** Architecture
**Reported by:** delta

## Location

`packages/bindx/src/handles/FieldHandle.ts:106-108`

## Description

`FieldHandle.setValue()`, `HasOneHandle.connect()`, and other handle methods use synchronous `dispatch()`, which skips all before-events. The interceptor system (`onChanging`, `$interceptConnect`, etc.) only works via `dispatchAsync()`. Users cannot use interceptors through the standard handle API.

```typescript
setValue(value: T | null): void {
    this.assertNotDisposed()
    this.store.clearNonStickyFieldErrors(...)
    this.dispatcher.dispatch(        // Synchronous — skips before-events
        setField(...)
    )
}
```

## Impact

- Interceptors (e.g., validation before field change, confirmation before relation disconnect) don't fire
- The event system exists but is practically unusable for the most common use case
- Users must bypass the handle API entirely to use interceptors

## Fix

Options:
1. Make handle methods use `dispatchAsync()` by default and handle the async nature (breaking change)
2. Fire before-events on sync dispatch too
3. Provide an option to enable interceptors per-handle
