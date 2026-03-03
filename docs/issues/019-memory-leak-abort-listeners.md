# 019: Memory leak — unremoved abort event listeners

**Severity:** Minor
**Category:** Bug

## Locations

- `packages/bindx/src/adapter/MockAdapter.ts:56-59`
- `packages/bindx-uploader/src/internal/hooks/useUploaderDoUpload.ts:28`

## Description

Abort signal listeners are added without `{ once: true }` and never explicitly removed:

```typescript
// MockAdapter.ts
signal.addEventListener('abort', () => {
    clearTimeout(timeoutId)
    reject(new DOMException('Aborted', 'AbortError'))
})

// useUploaderDoUpload.ts
abortController.signal.addEventListener('abort', () => {
    URL.revokeObjectURL(previewUrl)
})
```

## Impact

- If the same `AbortSignal` is reused, listeners accumulate
- Minor memory leak in long-running sessions with many requests

## Fix

Add `{ once: true }` to all abort signal listeners:

```typescript
signal.addEventListener('abort', () => { ... }, { once: true })
```
