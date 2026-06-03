# 028: MockAdapter diverges from ContemberAdapter — tests pass against wrong semantics

**Severity:** High
**Category:** Bug / Testing
**Status:** Open

## Location

- `packages/bindx/src/adapter/MockQueryEngine.ts:173-219` — `matchesCondition` (no `default`)
- `packages/bindx/src/adapter/MockQueryEngine.ts:34,45` — `orderBy`
- `packages/bindx/src/dataview/filterHandlers.ts` — emits `startsWithCI`, `endsWithCI`, `includes`, `notIn`
- `packages/bindx/src/adapter/MockAdapter.ts:190-304` — `applyChanges` (hand-rolled mutation semantics)

## Description

`matchesCondition` implements `eq/notEq/in/notIn/lt/lte/gt/gte/isNull/contains/startsWith/endsWith/containsCI` but is **missing** `startsWithCI`, `endsWithCI`, and `includes` — which the DataView filter handlers emit — and the `switch` has **no `default`**. An unhandled operator falls through the loop and the function returns `true`, i.e. the filter matches **everything**.

So a DataGrid text filter in case-insensitive startsWith/endsWith mode, and `enumList` (`includes`) filters, are silent no-ops against the mock while working against Contember. 60+ DataGrid tests run on `MockAdapter`, so these paths are effectively untested. `orderBy` similarly ignores `_random`/`_randomSeeded` and the `nullsFirst/nullsLast` ordering modes.

`MockAdapter.applyChanges` is a second, ~150-line hand-rolled reimplementation of Contember mutation semantics (~20 `as` casts) that can drift from `MutationCollector`/`ContemberSchemaMutationAdapter`.

## Impact

The mock is the foundation everything is verified against; divergence means green tests for behavior the real backend doesn't share. Filter regressions are invisible.

## Fix

1. Add the missing operators to `MockQueryEngine`, and a `default` branch that **throws** on unknown operators (divergence must fail loudly, not match-all).
2. Honor null-ordering modes; implement or explicitly reject `_random`.
3. Consider a shared operation-applier so `applyChanges` and the persistence-side mutation builder cannot diverge.
