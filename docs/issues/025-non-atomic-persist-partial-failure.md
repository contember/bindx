# 025: Non-atomic persist — partial failure leaves committed entities dirty

**Severity:** Critical
**Category:** Bug / Data integrity
**Status:** Open

## Location

- `packages/bindx/src/adapter/types.ts:202` — `persistTransaction?` is an **optional** method
- `packages/bindx/src/persistence/BatchPersister.ts:557` — `executeTransaction` only uses `adapter.persistTransaction` when present
- `packages/bindx/src/persistence/BatchPersister.ts:574` — sequential fallback (self-described as "not truly transactional")
- `packages/bindx/src/persistence/BatchPersister.ts:732-776` — failure branch
- `packages/bindx/src/adapter/ContemberAdapter.ts`, `MockAdapter.ts` — **neither implements `persistTransaction`**

## Description

`persistTransaction` is declared optional and is implemented by **no** adapter, so every persist takes the sequential fallback. When mutation A succeeds and a later mutation B fails, the whole `transactionResult.ok` is `false` and the failure branch runs. For the **succeeded** entity A it pushes `success: true` and increments `successCount`, but it **never calls `commitEntity` / `commitAllRelations` / `mapTempIdToPersistedId`**.

Verified: no `persistTransaction` implementation exists anywhere in `packages/`.

## Impact

- Entity A is written to the server, but locally it stays flagged dirty and (if a create) keeps its temp id forever.
- The local store silently diverges from the server while the API reports partial success.
- This is the same class of silent data inconsistency the round-1 review tried to eliminate, reintroduced in the only path that runs in production.

## Fix

1. In the failure branch, commit + remap ids for every `mutationResult.ok` entity (mirror the success-branch logic).
2. Ship a real `persistTransaction` in `ContemberAdapter` (Contember supports multi-mutation `mutation { a: … b: … }` transactions) so the atomic path is actually exercised, and decouple nested-result extraction from the adapter fallback (see #034) so temp-id mapping keeps working under a real transaction adapter.
