# 031: EntityHandle subscription omits relation changes → stale `$isDirty`

**Severity:** Medium-High
**Category:** Bug / Correctness
**Status:** Open

## Location

- `packages/bindx/src/handles/BaseHandle.ts:73-75` — `EntityRelatedHandle.subscribe` only calls `subscribeToEntity`
- `packages/bindx/src/handles/EntityHandle.ts:201-234` — `isDirty` / `getDirtyRelations` read relation state
- `packages/bindx/src/handles/HasOneHandle.ts:122-136` — correctly subscribes to entity **and** relation (not overridden by `EntityHandle`)
- `packages/bindx/src/store/SnapshotStore.ts:101-107` — `notifyRelationSubscribers`

## Description

`EntityRelatedHandle.subscribe` subscribes only to the entity snapshot. `HasOneHandle` overrides this to subscribe to both entity and relation, but `EntityHandle` does not. A component observing `entity.$isDirty` (which walks has-one dirtiness and planned has-many removals) via `useEntity`/`EntityHandleRenderer` registers only an entity subscriber.

A pure relation mutation (e.g. `hasMany.remove(id)` → `notifyRelationSubscribers` only) therefore does not necessarily bump the parent entity's snapshot version, so `$isDirty` can stay stale until an unrelated entity-level notification fires.

## Impact

Save buttons / dirty indicators bound to `$isDirty` can show the wrong state after relation edits.

## Fix

Have `EntityHandle` override `subscribe` to also subscribe to its relations (or have the React consumer subscribe to relation notifications for the root entity). Add a regression test asserting `$isDirty` flips reactively after a has-many `remove`.
