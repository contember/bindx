import type { EntitySnapshot } from './snapshots.js'
import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'
import { HasOneStore, type StoredRelationState } from './HasOneStore.js'
import {
	HasManyStore,
	computeDefaultOrderedIds,
	type HasManyAdditionKind,
	type HasManyRemovalType,
	type StoredHasManyState,
} from './HasManyStore.js'

// Re-exported so existing imports from './RelationStore.js' keep resolving.
export type { StoredRelationState } from './HasOneStore.js'
export type { HasManyAdditionKind, HasManyRemovalType, StoredHasManyState } from './HasManyStore.js'
export { computeDefaultOrderedIds } from './HasManyStore.js'

/**
 * Manages has-one and has-many relation state.
 *
 * Relation keys use the format "parentType:parentId:fieldName".
 * Notification is handled by callers via callback returns.
 *
 * Thin facade composing a {@link HasOneStore} and a {@link HasManyStore}: each
 * sub-store owns its own state map and write helper, and the facade merges the
 * cross-cutting queries (mutation version sum; live-child/parent-key unions;
 * dirty union) and fans out the cross-cutting mutations (rekey, removeOwned,
 * clear) to both.
 */
export class RelationStore implements Rekeyable {
	private readonly hasOne = new HasOneStore()
	private readonly hasMany = new HasManyStore()

	/**
	 * Increases whenever EITHER sub-store mutates. Used by {@link ReachabilityAnalyzer}
	 * to memoize its walk; only monotonic-increase-on-mutation matters, so the sum
	 * of the two per-store counters is sufficient.
	 */
	getMutationVersion(): number {
		return this.hasOne.getMutationVersion() + this.hasMany.getMutationVersion()
	}

	// ==================== Has-One Relations ====================

	getOrCreateRelation(
		key: string,
		initial: Omit<StoredRelationState, 'version'>,
	): StoredRelationState {
		return this.hasOne.getOrCreateRelation(key, initial)
	}

	getRelation(key: string): StoredRelationState | undefined {
		return this.hasOne.getRelation(key)
	}

	setRelation(
		key: string,
		updates: Partial<Omit<StoredRelationState, 'version'>>,
		entitySnapshot: EntitySnapshot | undefined,
		fieldName: string,
	): void {
		this.hasOne.setRelation(key, updates, entitySnapshot, fieldName)
	}

	commitRelation(key: string): void {
		this.hasOne.commitRelation(key)
	}

	resetRelation(key: string): void {
		this.hasOne.resetRelation(key)
	}

	// ==================== Has-Many Relations ====================

	getOrCreateHasMany(key: string, serverIds?: string[]): StoredHasManyState {
		return this.hasMany.getOrCreateHasMany(key, serverIds)
	}

	getHasMany(key: string): StoredHasManyState | undefined {
		return this.hasMany.getHasMany(key)
	}

	setHasManyServerIds(key: string, serverIds: string[]): void {
		this.hasMany.setHasManyServerIds(key, serverIds)
	}

	planHasManyRemoval(key: string, itemId: string, type: HasManyRemovalType): void {
		this.hasMany.planHasManyRemoval(key, itemId, type)
	}

	planHasManyConnection(key: string, itemId: string): void {
		this.hasMany.planHasManyConnection(key, itemId)
	}

	commitHasMany(key: string, newServerIds: string[]): void {
		this.hasMany.commitHasMany(key, newServerIds)
	}

	resetHasMany(key: string): void {
		this.hasMany.resetHasMany(key)
	}

	addToHasMany(key: string, itemId: string): void {
		this.hasMany.addToHasMany(key, itemId)
	}

	connectExistingToHasMany(key: string, itemId: string): void {
		this.hasMany.connectExistingToHasMany(key, itemId)
	}

	removeFromHasMany(key: string, itemId: string, removalType: HasManyRemovalType): boolean {
		return this.hasMany.removeFromHasMany(key, itemId, removalType)
	}

	moveInHasMany(key: string, fromIndex: number, toIndex: number): void {
		this.hasMany.moveInHasMany(key, fromIndex, toIndex)
	}

	getHasManyOrderedIds(key: string): string[] {
		return this.hasMany.getHasManyOrderedIds(key)
	}

	// ==================== Reachability / Reverse Lookup ====================

	/**
	 * Collects the ids of child entities currently reachable through an entity's
	 * LIVE relations (key prefix "parentType:parentId:"). Unions the live has-one
	 * edges with the live has-many members.
	 */
	getLiveChildIds(keyPrefix: string): string[] {
		const ids = new Set<string>()
		this.hasOne.collectLiveChildIds(keyPrefix, ids)
		this.hasMany.collectLiveChildIds(keyPrefix, ids)
		return Array.from(ids)
	}

	/**
	 * Collects the composite keys ("parentType:parentId") of every entity that
	 * currently has a LIVE relation edge pointing at {@link childId} — the reverse
	 * of {@link getLiveChildIds}. Unions both sub-stores' results, scanning the
	 * same live edges the forward query reads so the two never disagree.
	 */
	getParentKeysForChild(childId: string): Set<string> {
		const parents = new Set<string>()
		this.hasOne.collectParentKeysForChild(childId, parents)
		this.hasMany.collectParentKeysForChild(childId, parents)
		return parents
	}

	// ==================== Bulk Operations ====================

	/**
	 * Removes all relation and has-many state owned by an entity (keys under the
	 * given owner prefix). Called by removeEntity so a removed entity leaves no
	 * stale relation state behind.
	 */
	removeOwnedRelations(keyPrefix: string): void {
		this.hasOne.removeOwnedRelations(keyPrefix)
		this.hasMany.removeOwnedRelations(keyPrefix)
	}

	/**
	 * Commits all relations (hasOne and hasMany) for an entity.
	 */
	commitAllRelations(keyPrefix: string): void {
		this.hasOne.commitAllRelations(keyPrefix)
		this.hasMany.commitAllRelations(keyPrefix)
	}

	/**
	 * Resets all relations (hasOne and hasMany) for an entity to server state.
	 */
	resetAllRelations(keyPrefix: string): void {
		this.hasOne.resetAllRelations(keyPrefix)
		this.hasMany.resetAllRelations(keyPrefix)
	}

	// ==================== Dirty Tracking ====================

	/**
	 * Gets the list of dirty relations (has-one and has-many) for an entity.
	 */
	getDirtyRelations(keyPrefix: string): string[] {
		const dirtyRelations: string[] = []
		this.hasOne.collectDirtyRelations(keyPrefix, dirtyRelations)
		this.hasMany.collectDirtyRelations(keyPrefix, dirtyRelations)
		return dirtyRelations
	}

	// ==================== Export/Import ====================

	exportRelationStates(keys: string[]): Map<string, StoredRelationState> {
		return this.hasOne.exportRelationStates(keys)
	}

	exportHasManyStates(keys: string[]): Map<string, StoredHasManyState> {
		return this.hasMany.exportHasManyStates(keys)
	}

	importRelationStates(states: Map<string, StoredRelationState>): string[] {
		return this.hasOne.importRelationStates(states)
	}

	importHasManyStates(states: Map<string, StoredHasManyState>): string[] {
		return this.hasMany.importHasManyStates(states)
	}

	// ==================== Rekey ====================

	/**
	 * Replaces all occurrences of oldId with newId across relation and hasMany states.
	 * Used after persist to rekey temp IDs to server-assigned IDs.
	 */
	replaceEntityId(oldId: string, newId: string): void {
		this.hasOne.replaceEntityId(oldId, newId)
		this.hasMany.replaceEntityId(oldId, newId)
	}

	/**
	 * Migrates an entity's relation state for a temp→persisted rekey: first the
	 * relation/has-many keys it owns (the parent id in the key), then every value
	 * reference to its id from other entities' relations.
	 */
	rekey(ctx: RekeyContext): void {
		this.rekeyOwner(ctx.oldKeyPrefix, ctx.newKeyPrefix)
		this.replaceEntityId(ctx.oldId, ctx.newId)
	}

	/**
	 * Rekeys relation/hasMany entries owned by an entity (changes the parent ID in the key).
	 */
	rekeyOwner(oldKeyPrefix: string, newKeyPrefix: string): void {
		this.hasOne.rekeyOwner(oldKeyPrefix, newKeyPrefix)
		this.hasMany.rekeyOwner(oldKeyPrefix, newKeyPrefix)
	}

	/**
	 * Clears all relation data.
	 */
	clear(): void {
		this.hasOne.clear()
		this.hasMany.clear()
	}
}
