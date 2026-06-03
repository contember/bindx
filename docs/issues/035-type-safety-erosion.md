# 035: Type-safety erosion — `as`/`any` reintroduced despite the no-cast rule

**Severity:** Medium
**Category:** Type Safety
**Status:** Open
**Supersedes:** round-1 #014/#015/#016 — those instances fixed; the pattern recurred elsewhere

## Location

- `packages/bindx/src/persistence/BatchPersister.ts` — ~30 `as` casts; deeply-chained, guard-less walkers (`extractNestedResultsFromNode`, `isCreateDataMatchingNode`, `processNestedData`), e.g. `(opObj['update'] as Record<string,unknown>)['by'] as …`
- `packages/bindx/src/handles/types.ts:174,227,308` — `__schema?: TSchema & any` on public interfaces (collapses to `any`)
- `packages/bindx-react/src/jsx/conditions.ts` — 12× `(field as unknown as FieldAccessor<T>).value`
- `packages/bindx/src/adapter/ContemberAdapter.ts:142,179,207` — structural error sniffing `e instanceof Error && 'result' in e`
- `packages/bindx/src/selection/queryTypes.ts:44,79,130` — `Array<any>` in type-machinery

## Description

CLAUDE.md forbids `any` and `as`. After the round-1 fixes, casts re-accumulated: the mutation-result walkers in `BatchPersister` chain `as Record<string,unknown>` with no runtime guards (a malformed adapter response propagates `undefined` silently instead of failing fast), `TSchema & any` defeats the phantom `__schema` field on public handle interfaces, the `conditions` DSL double-casts Ref→Accessor 12 times, and `ContemberAdapter` detects errors by structural probing rather than a typed error class.

## Impact

Brittle boundaries; type errors and malformed responses are masked rather than caught; contradicts fail-fast and the project's own conventions.

## Fix

1. Introduce a typed `MutationOp` discriminated union + predicates (`isConnectOp`/`isCreateOp`/`isUpdateOp`) so the walkers narrow instead of cast.
2. Replace `TSchema & any` with `TSchema` (fix the root variance issue).
3. Centralize the Ref→Accessor read in `conditions.ts` into one typed helper (`readValue(field)`).
4. Use the existing `MutationFailedError` with `instanceof` in `ContemberAdapter`.
5. `Array<unknown>` instead of `Array<any>` in conditional-type probes.
