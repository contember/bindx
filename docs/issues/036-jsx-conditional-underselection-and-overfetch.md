# 036: JSX conditional under-selection (silent) + HasMany duplicate over-fetch

**Severity:** Medium-High
**Category:** Bug / Correctness / Performance
**Status:** Open
**Supersedes:** round-1 #020 (conditional selection) — "document it" resolution is insufficient for the JSX paradigm

## Location

- `packages/bindx-react/src/hooks/useSelectionCollection.ts:119` — selection memoized on `[entityType, depsKey, schemaRegistry]`
- `packages/bindx-react/src/jsx/collectorProxy.ts:157-164` — `mapFn` calls `markAsArray` but never `setHasManyParams`
- `packages/bindx-react/src/jsx/components/HasMany.tsx:62-113` + `SelectionScope.toSelectionMeta` — parametrized path
- `packages/bindx-react/src/jsx/componentFactory.ts:344-350`, `useSelectionCollection.ts:82-87` — `try { collectSelection() } catch {}`

## Description

1. **Silent conditional under-selection.** Selection is collected once. `{isAdmin && <Field field={c.internalNotes}/>}` with `isAdmin=false` at collection time yields a selection without `internalNotes`; at runtime the field reads back `undefined` with **no error**. `<If>`/`cond` mitigate the cases they cover, but raw `&&`/ternary (which JSX encourages) fail silently — the defining failure mode of the JSX-as-selection paradigm. (Round-1 #020 chose "just document it", which is too weak here.)
2. **HasMany duplicate over-fetch.** The collector `mapFn` records an **unparametrized** `usages` via `markAsArray`, while the `<HasMany orderBy/limit>` JSX path records a parametrized `usages_<hash>`. Different map keys → both survive `mergeSelections` → the query emits two `usages` fields, one with **no limit/orderBy** (potentially fetching the entire relation). UI reads the aliased one; the unparametrized fetch is wasted/expensive.
3. **Swallowed collection errors.** Both collection sites wrap `collectSelection` in `catch {}`, so a real bug in a nested component's collection manifests later as mysterious under-selection.

## Impact

Silent data absence and silent over-fetch in completely ordinary JSX patterns; debugging is hard because nothing errors.

## Fix

1. In dev mode, **throw/warn** from runtime `<Field>`/handle field resolution when the accessed field is absent from the collected `SelectionMeta` (wire the existing `UnfetchedFieldError` to `<Field>`). Turns silent `undefined` into an actionable error and makes `<If>`/`cond` discoverable.
2. Propagate HasMany params through the collector `mapFn` (or dedupe in `mergeSelections` when two entries share `fieldName`+`isArray` and one carries params).
3. Stop swallowing collection exceptions — at minimum `console.warn` in dev; better, only swallow a dedicated sentinel error class.
