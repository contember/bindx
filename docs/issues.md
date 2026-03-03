# Bindx Issues

Consolidated from four independent code review reports (alpha, beta, gamma, delta) and verified against the codebase.

## Critical (affect correctness)

| # | Issue | File | Reported by |
|---|-------|------|-------------|
| [001](issues/001-not-found-as-loading.md) | `not_found` state treated as loading | `useEntityImpl.ts` | gamma, delta |
| [002](issues/002-definer-missing-from-usememo-deps.md) | Memoization bug — `definer` missing from useMemo deps | `createBindx.tsx` | gamma |
| [003](issues/003-temp-id-prefix-mismatch.md) | Temp ID prefix mismatch in JSX proxy | `proxy.ts` / `SnapshotStore.ts` | gamma |
| [004](issues/004-silent-data-loss-without-mutation-collector.md) | Silent data loss without MutationCollector | `BatchPersister.ts` | delta |
| [005](issues/005-json-stringify-vs-deep-equal.md) | `JSON.stringify` vs `deepEqual` inconsistency | `BatchPersister.ts` | gamma, delta |

## Important (architectural problems)

| # | Issue | File | Reported by |
|---|-------|------|-------------|
| [006](issues/006-dual-persistence-managers.md) | Dual persistence managers | `PersistenceManager.ts` / `BatchPersister.ts` | gamma |
| [007](issues/007-dual-has-many-state.md) | Dual source of truth for has-many state | `MutationCollector.ts` | delta |
| [008](issues/008-interceptors-unusable-with-sync-dispatch.md) | Interceptors unusable with sync dispatch | `FieldHandle.ts` | delta |
| [009](issues/009-input-props-new-object-every-access.md) | `inputProps` creates new object on every access | `FieldHandle.ts` | gamma |
| [010](issues/010-constructor-proxy-antipattern.md) | Constructor anti-pattern with Proxy | `FieldHandle.ts` / `EntityHandle.ts` | delta |
| [011](issues/011-static-schema-cache.md) | Static schema cache in SchemaLoader | `SchemaLoader.ts` | delta |
| [012](issues/012-json-parse-roundtrip-hack.md) | `JSON.parse(byKey)` roundtrip hack | `useEntityCore.ts` | gamma |

## Code Quality

| # | Issue | File | Reported by |
|---|-------|------|-------------|
| [013](issues/013-large-files.md) | Large files exceeding 300-line guideline | multiple | all |
| [014](issues/014-any-types-in-component-builder.md) | `any` types in componentBuilder | `componentBuilder.ts` | alpha, gamma, delta |
| [015](issues/015-as-casts-in-create-bindx.md) | `as` type casts in createBindx | `createBindx.tsx` | gamma |
| [016](issues/016-as-any-in-contember-adapter.md) | `as any` casts in ContemberAdapter | `ContemberAdapter.ts` | — |
| [017](issues/017-hardcoded-temp-id-checks.md) | Hardcoded `__temp_` checks instead of `isTempId()` | multiple | — |
| [018](issues/018-incomplete-packages.md) | Incomplete packages with TODOs | form, uploader, generator | beta |

## Minor

| # | Issue | File | Reported by |
|---|-------|------|-------------|
| [019](issues/019-memory-leak-abort-listeners.md) | Memory leak — unremoved abort event listeners | `MockAdapter.ts` / uploader | — |
| [020](issues/020-conditional-selection-limitation.md) | Selection doesn't react to conditional field access | `useEntityCore.ts` | delta |
| [021](issues/021-debug-flag-globalthis.md) | Debug flag via globalThis string key | — | delta |
| [022](issues/022-inconsistent-error-systems.md) | Inconsistent error systems | — | delta |
| [023](issues/023-role-system-complexity.md) | Role system complexity | `roles/` | alpha, beta |
| [024](issues/024-console-warn-unknown-errors.md) | `console.warn` for unknown error types | `ContemberAdapter.ts` | — |
