# 038: Undo restores partial state and can desync across persist rekey

**Severity:** Medium
**Category:** Correctness
**Status:** Open

## Location

- `packages/bindx/src/store/SnapshotStore.ts:817-858` — `exportPartialSnapshot` / `importPartialSnapshot`
- `packages/bindx/src/core/actionClassification.ts` — `getAffectedKeys` (keys computed from original ids)
- `packages/bindx/src/persistence/BatchPersister.ts` — `mapTempIdToPersistedId` (rekeys store keys)
- `packages/bindx/src/undo/UndoManager.ts`

## Description

`importPartialSnapshot` restores entity snapshots, relation states, hasMany states, and metas — but **not** `ErrorStore`, `TouchedStore`, `loadStates`, `lastPropagatedData`, or `rekeyedEntities`. So an undo restores entity data while leaving field errors/touched flags from the undone edit in place, and a stale `lastPropagatedData` can suppress a later legitimate re-propagation.

Worse, `affectedKeys` are computed from the action's **original** ids. A temp id captured before `mapTempIdToPersistedId` won't match the rekeyed store keys after persist, and `block()`/`unblock()` does not invalidate existing history entries. There is no undo test covering rekey.

Notification-wise, `importPartialSnapshot` calls `notifyGlobal()` plus per-key **direct** notifications that skip parent-child propagation — so an ancestor of a restored nested relation may not re-render.

## Impact

Undo of a nested-relation edit can leave ghost errors, stale parents, and (across persist) keys that no longer resolve.

## Fix

1. Include errors/touched/loadState in the partial snapshot, or explicitly clear them for affected keys on import.
2. Route undo restores through the propagating notification path used by normal mutations.
3. Invalidate (or rekey) history entries referencing temp ids when `mapTempIdToPersistedId` runs; add an undo-across-persist test.
