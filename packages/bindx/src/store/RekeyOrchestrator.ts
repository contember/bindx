import { isPersistedId, isPlaceholderId } from './entityId.js'

/**
 * Describes a single temp→persisted rekey in every shape the participating
 * sub-stores need (full key, owner prefix, bare id).
 */
export interface RekeyContext {
	/** Old composite key, "entityType:tempId". */
	readonly oldKey: string
	/** New composite key, "entityType:persistedId". */
	readonly newKey: string
	/** Old owner prefix, "entityType:tempId:". */
	readonly oldKeyPrefix: string
	/** New owner prefix, "entityType:persistedId:". */
	readonly newKeyPrefix: string
	/** The temp id being replaced. */
	readonly oldId: string
	/** The server-assigned id. */
	readonly newId: string
}

/**
 * A store that owns per-entity state keyed (directly or by prefix) on an entity
 * id and can migrate it from a temp id to its persisted id.
 */
export interface Rekeyable {
	rekey(ctx: RekeyContext): void
}

/**
 * Single source of temp→persisted identity, and the one place the rekey fan-out
 * is sequenced.
 *
 * Owns the only id-redirect map: "entityType:tempId" → persistedId. Both key
 * resolution ({@link resolveKey}/{@link resolveId}) and persisted-id queries
 * ({@link getPersistedId}/{@link isNewEntity}) derive from it, so there is no
 * second copy to keep in sync — the former `SnapshotStore.rekeyedEntities` and
 * `EntityMetaStore.tempToPersistedId` are both gone. `SubscriptionManager` keeps
 * its own closure-redirect chain, which tracks relation-key prefixes and stale
 * unsubscribe closures rather than entity identity, so it stays internal there.
 */
export class RekeyOrchestrator {
	/** "entityType:tempId" → persistedId. The single identity-redirect map. */
	private readonly tempToPersisted = new Map<string, string>()

	/**
	 * @param participants the sub-stores to migrate, in the exact order
	 *   {@link rekey} must visit them (the order is load-bearing — see rekey()).
	 */
	constructor(private readonly participants: readonly Rekeyable[]) {}

	/** Resolves an entity key, following a temp→persisted redirect if present. */
	resolveKey(entityType: string, id: string): string {
		const persisted = this.tempToPersisted.get(`${entityType}:${id}`)
		return persisted !== undefined ? `${entityType}:${persisted}` : `${entityType}:${id}`
	}

	/** Resolves an entity id to its persisted id if it has been rekeyed. */
	resolveId(entityType: string, id: string): string {
		return this.tempToPersisted.get(`${entityType}:${id}`) ?? id
	}

	/** The persisted id for an entity, or null if it has none yet. */
	getPersistedId(entityType: string, id: string): string | null {
		if (isPlaceholderId(id)) return null
		if (isPersistedId(id)) return id
		return this.tempToPersisted.get(`${entityType}:${id}`) ?? null
	}

	/** Whether an entity has never been persisted (no server-assigned id yet). */
	isNewEntity(entityType: string, id: string): boolean {
		if (isPlaceholderId(id)) return true
		if (isPersistedId(id)) return false
		return !this.tempToPersisted.has(`${entityType}:${id}`)
	}

	/**
	 * Migrates an entity from its temp id to its server-assigned id across every
	 * participating store.
	 *
	 * Ordering contract (do not reorder — each step relies on the previous):
	 *   0. register the redirect, so any resolveKey/resolveId during the fan-out
	 *      already sees the persisted key;
	 *   1. roots — keep the root registry aligned;
	 *   2. entity snapshot — move data, rewrite the id field and id index;
	 *   3. meta — move metadata/load/persisting, then mark exists-on-server;
	 *   4. subscriptions — move entity + relation subscribers and parent links;
	 *   5. relations — rekey owned relation keys, then replace value references;
	 *   6. errors / touched / propagation — move the remaining per-entity state.
	 * The caller performs the final notification on the new key.
	 */
	rekey(entityType: string, tempId: string, persistedId: string): void {
		const ctx: RekeyContext = {
			oldKey: `${entityType}:${tempId}`,
			newKey: `${entityType}:${persistedId}`,
			oldKeyPrefix: `${entityType}:${tempId}:`,
			newKeyPrefix: `${entityType}:${persistedId}:`,
			oldId: tempId,
			newId: persistedId,
		}

		this.tempToPersisted.set(ctx.oldKey, persistedId)

		for (const participant of this.participants) {
			participant.rekey(ctx)
		}
	}

	clear(): void {
		this.tempToPersisted.clear()
	}
}
