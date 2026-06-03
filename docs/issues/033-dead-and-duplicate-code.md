# 033: Dead / duplicate code (violates "no deprecated stuff" rule)

**Severity:** Medium
**Category:** Maintainability
**Status:** Open
**Supersedes:** round-1 #006 (dual persistence managers), #011 (static schema cache) — same recurring pattern, new instances

## Location

- `packages/bindx/src/core/EntityLoader.ts` — `createEntityLoader` only re-exported (`bindx-react/src/index.ts:165`), no real caller; diverges from the real load path (uses `setEntityData`, clobbering dirty edits; never sets load state)
- `packages/bindx-react/src/jsx/analyzer.ts:118-147` — `convertToQuerySelection`: **0 callers**, and keys off `fieldName` (ignores aliases), encoding a now-incorrect model
- `packages/bindx/src/core/ActionDispatcher.ts:85` (`dispatchAsync`) + `events/eventFactory.ts:414-476` (`createHasMany*Event`) — dead (see #027)
- `packages/bindx-react/src/jsx/componentBuilderCompat.ts`, `legacyTypes.ts` — half-dead / test-only re-exports
- `packages/bindx/src/selection/SelectionMetaCollector.ts` vs `SelectionScope.ts` — two selection collectors with bidirectional adapters (`SelectionScope` doc claims to *replace* the flat one)
- `packages/bindx-client/src/schema/SchemaRegistry.ts:30` (`fromContemberSchema`) + `ContemberSchema`/`SchemaLoader` — **verify**: appear to have no callers (live in `bindx-client`, outside this review's deep scope); `fromContemberSchema` also forgets to emit `enum` FieldDefs

## Description

CLAUDE.md explicitly forbids back-compat and deprecated code, yet several dead or duplicated mechanisms remain after the `createBindx → entityDef` refactor. `round-1 #011` made `SchemaLoader`'s cache instance-level — but the whole `SchemaLoader`/`ContemberSchema` path now appears unused, i.e. the fix was applied to dead code.

## Impact

Drift hazard (two collectors, two schema models, a stale `convertToQuerySelection` that encodes the wrong alias model), and contributor confusion about which path is live.

## Fix

Delete `convertToQuerySelection`, `dispatchAsync` (per #027), the dead event factories, `componentBuilderCompat.ts`, `legacyTypes.ts`. Either delete `EntityLoader` or make `useEntity` delegate to a fixed version (`refreshServerData` + load state). Pick **one** selection collector (the `SelectionScope` tree was built to fix the flat model's alias collisions — finishing that migration also addresses #036). Verify and remove the unused `ContemberSchema`/`SchemaLoader` introspection path in `bindx-client`, or make it the single source.
