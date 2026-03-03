# Status

## Critical

- [x] 001 - `not_found` state treated as loading
- [x] 002 - Memoization bug — `definer` missing from useMemo deps
- [x] 003 - Temp ID prefix mismatch in JSX proxy
- [x] 004 - Silent data loss without MutationCollector
- [x] 005 - `JSON.stringify` vs `deepEqual` inconsistency

## Important

- [x] 006 - Dual persistence managers
- [x] 007 - Dual source of truth for has-many state
- [x] 008 - Interceptors unusable with sync dispatch
- [x] 009 - `inputProps` creates new object on every access
- [x] 010 - Constructor anti-pattern with Proxy
- [x] 011 - Static schema cache in SchemaLoader
- [x] 012 - `JSON.parse(byKey)` roundtrip hack

## Code Quality

- [ ] 013 - Large files exceeding 300-line guideline (SnapshotStore.ts split done, EntityHandle.ts HasManyListHandle/HasOneHandle/PlaceholderHandle split done, proxy.ts split done)
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
