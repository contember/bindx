# Status

## Critical

- [x] 001 - `not_found` state treated as loading
- [x] 002 - Memoization bug — `definer` missing from useMemo deps
- [ ] 003 - Temp ID prefix mismatch in JSX proxy
- [ ] 004 - Silent data loss without MutationCollector
- [ ] 005 - `JSON.stringify` vs `deepEqual` inconsistency

## Important

- [ ] 006 - Dual persistence managers
- [ ] 007 - Dual source of truth for has-many state
- [ ] 008 - Interceptors unusable with sync dispatch
- [ ] 009 - `inputProps` creates new object on every access
- [ ] 010 - Constructor anti-pattern with Proxy
- [ ] 011 - Static schema cache in SchemaLoader
- [ ] 012 - `JSON.parse(byKey)` roundtrip hack

## Code Quality

- [ ] 013 - Large files exceeding 300-line guideline
- [ ] 014 - `any` types in componentBuilder
- [ ] 015 - `as` type casts in createBindx
- [ ] 016 - `as any` casts in ContemberAdapter
- [ ] 017 - Hardcoded `__temp_` checks instead of `isTempId()`
- [ ] 018 - Incomplete packages with TODOs

## Minor

- [ ] 019 - Memory leak — unremoved abort event listeners
- [ ] 020 - Conditional selection limitation
- [ ] 021 - Debug flag via globalThis string key
- [ ] 022 - Inconsistent error systems
- [ ] 023 - Role system complexity
- [ ] 024 - `console.warn` for unknown error types
