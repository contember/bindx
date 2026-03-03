# 024: `console.warn` for unknown error types

**Severity:** Minor
**Category:** Error Handling

## Location

`packages/bindx/src/adapter/ContemberAdapter.ts:184`

## Description

When the Contember API returns an error type that the adapter doesn't recognize (e.g., from a newer Contember version), it logs a `console.warn` but otherwise silently continues:

```typescript
console.warn(`[ContemberAdapter] Unknown execution error type: ${type}. This may be a new error type...`)
```

## Impact

- Unknown errors are silently swallowed in production
- Users don't see any indication that something went wrong
- The warning is easily missed in production logs

## Fix

Either:
1. Throw an error with the unknown type information
2. Return a structured error result with a generic "unknown server error" category
3. At minimum, surface it through the error handling system so the UI can show something
