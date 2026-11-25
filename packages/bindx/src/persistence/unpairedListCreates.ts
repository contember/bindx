import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { isTempId } from '../store/entityId.js'
import { entityIdentityKey, type PersistExecution } from './PersistExecution.js'

/** What the persister reads about a row the server returned. */
export type RowSchema = Pick<SchemaRegistry, 'getScalarFields' | 'getRelationTarget' | 'isHasMany'>

type Row = Readonly<Record<string, unknown>>

/**
 * A list in a confirmed mutation's response where some of the list's own creates matched
 * no row. The rows are the ones no create, joiner or known member of the list claimed.
 */
export interface UnpairedListCreates {
	readonly parentEntityType: string
	readonly parentEntityId: string
	readonly fieldName: string
	readonly entityType: string
	readonly unpairedIds: readonly string[]
	readonly rows: readonly Row[]
}

/** The columns of a row the server returned, without its id and relations. */
export function rowColumns(schema: RowSchema, entityType: string, row: Row): Record<string, unknown> {
	const columns: Record<string, unknown> = {}
	for (const field of schema.getScalarFields(entityType)) {
		if (field !== 'id' && field in row) columns[field] = row[field]
	}
	return columns
}

interface SettleableCreates {
	/** The lists whose unpaired creates can leave the store. */
	readonly lists: readonly UnpairedListCreates[]
	/** Their unpaired creates and the unresolved entities created inside them. */
	readonly superseded: ReadonlySet<string>
}

interface SettleInput {
	readonly lists: readonly UnpairedListCreates[]
	/** Keys of this mutation's nested creates that no response row resolved. */
	readonly unresolved: ReadonlySet<string>
	/** Whether a local edit landed while the persist was in flight; see {@link PersistExecution.sentEditableWriteVersion}. */
	readonly editedInFlight: boolean
}

type NestedCreate = PersistExecution['nestedCreates'][number]

interface CreateIndex {
	readonly byKey: ReadonlyMap<string, NestedCreate>
	readonly childrenOf: ReadonlyMap<string, readonly string[]>
}

/**
 * The unpaired list creates that can leave the store. Each list keeps its creates
 * unresolved, as before, when dropping them could lose something:
 * - a local edit landed while the persist was in flight, which may have changed them;
 * - an entity outside what this persist drops still references one of them, so the
 *   reference would point at nothing and the next save would create it through it;
 * - one of them holds a new entity this persist did not send (an interceptor vetoed it),
 *   which would lose its link and later be sent on its own.
 * A create shared with a list that stays, stays as well.
 */
export function settleableUnpairedCreates(store: SnapshotStore, execution: PersistExecution, input: SettleInput): SettleableCreates {
	const { lists, unresolved } = input
	if (input.editedInFlight) return { lists: [], superseded: new Set() }
	const index = indexCreates(execution)
	const sentIds = new Set([...execution.nestedCreates, ...execution.entities].map(entity => entity.entityId))
	const candidates = lists.map(list => (
		unresolvedSubtree(index, list.unpairedIds.map(id => entityIdentityKey(list.entityType, id)), unresolved)
	))
	const blocked = new Set<number>()
	const keysWhere = (isBlocked: boolean): Set<string> => (
		new Set(candidates.filter((_, position) => blocked.has(position) === isBlocked).flat())
	)
	for (let changed = true; changed;) {
		changed = false
		const kept = keysWhere(true)
		const dropped = keysWhere(false)
		const allowed = allowedReferrers(execution, index, dropped)
		candidates.forEach((keys, position) => {
			if (blocked.has(position)) return
			const isUnsafe = (key: string): boolean => (
				kept.has(key) || isReferencedFromOutside(store, index, key, allowed) || holdsUnsentCreate(store, index, key, sentIds)
			)
			if (!keys.some(isUnsafe)) return
			blocked.add(position)
			changed = true
		})
	}
	return { lists: lists.filter((_, position) => !blocked.has(position)), superseded: keysWhere(false) }
}

function indexCreates(execution: PersistExecution): CreateIndex {
	const byKey = new Map<string, NestedCreate>()
	const childrenOf = new Map<string, string[]>()
	for (const descriptor of execution.nestedCreates) {
		const key = entityIdentityKey(descriptor.entityType, descriptor.entityId)
		byKey.set(key, descriptor)
		const parentKey = entityIdentityKey(descriptor.parentEntityType, descriptor.parentEntityId)
		const siblings = childrenOf.get(parentKey)
		if (siblings) siblings.push(key)
		else childrenOf.set(parentKey, [key])
	}
	return { byKey, childrenOf }
}

/**
 * The unresolved roots and the unresolved entities created inside them, at any depth. The
 * walk stops at an entity that resolved: it stays in the store and keeps what it holds.
 */
function unresolvedSubtree(index: CreateIndex, roots: readonly string[], unresolved: ReadonlySet<string>): string[] {
	const keys = new Set(roots.filter(key => unresolved.has(key)))
	for (const parent of keys) {
		for (const child of index.childrenOf.get(parent) ?? []) {
			if (unresolved.has(child)) keys.add(child)
		}
	}
	return [...keys]
}

/** The dropped entities and the owners of every list they leave: their references go away with them. */
function allowedReferrers(execution: PersistExecution, index: CreateIndex, dropped: ReadonlySet<string>): Set<string> {
	const allowed = new Set(dropped)
	const droppedIds = new Set<string>()
	for (const key of dropped) {
		const descriptor = index.byKey.get(key)
		if (descriptor) droppedIds.add(descriptor.entityId)
	}
	for (const change of execution.hasManyChanges) {
		if (change.additions.some(addition => droppedIds.has(addition.itemId))) {
			allowed.add(entityIdentityKey(change.entityType, change.entityId))
		}
	}
	return allowed
}

function isReferencedFromOutside(store: SnapshotStore, index: CreateIndex, key: string, allowed: ReadonlySet<string>): boolean {
	const descriptor = index.byKey.get(key)
	if (!descriptor) return false
	for (const parent of store.getParentKeysForChild(descriptor.entityId)) {
		if (!allowed.has(parent)) return true
	}
	return false
}

function holdsUnsentCreate(store: SnapshotStore, index: CreateIndex, key: string, sentIds: ReadonlySet<string>): boolean {
	const descriptor = index.byKey.get(key)
	if (!descriptor) return false
	return store.getLiveChildIds(descriptor.entityType, descriptor.entityId).some(id => isTempId(id) && !sentIds.has(id))
}

interface SupersedeInput {
	readonly lists: readonly UnpairedListCreates[]
	/** Unpaired list creates and the unresolved entities created inside them. */
	readonly superseded: ReadonlySet<string>
	/** Server ids this persist mapped to entities of its own. */
	readonly confirmedIds: ReadonlySet<string>
}

interface ListChange {
	readonly parentType: string
	readonly parentId: string
	readonly fieldName: string
	readonly entityType: string
	readonly dropped: Set<string>
	readonly adopted: string[]
	readonly rows: Map<string, Row>
}

/**
 * Settles list creates the server confirmed without a row to pair them with, the way the
 * original Contember binding does: the client's items leave the store, so the next save
 * cannot create them again, and the list takes the response's unclaimed rows as persisted
 * entities. A row is never assigned to a client entity, as that would be a guess.
 */
export function supersedeUnpairedCreates(
	store: SnapshotStore,
	schema: RowSchema | undefined,
	execution: PersistExecution,
	input: SupersedeInput,
): void {
	const changes = new Map<string, ListChange>()
	const changeOf = (parentType: string, parentId: string, fieldName: string, entityType: string): ListChange => {
		const key = `${entityIdentityKey(parentType, parentId)}:${fieldName}`
		const existing = changes.get(key)
		if (existing) return existing
		const created: ListChange = { parentType, parentId, fieldName, entityType, dropped: new Set(), adopted: [], rows: new Map() }
		changes.set(key, created)
		return created
	}
	for (const list of input.lists) {
		const change = changeOf(list.parentEntityType, list.parentEntityId, list.fieldName, list.entityType)
		for (const row of list.rows) {
			const id = row['id']
			if (typeof id !== 'string' || input.confirmedIds.has(id) || change.rows.has(id)) continue
			change.rows.set(id, row)
			change.adopted.push(id)
		}
	}
	const supersededById = new Map<string, NestedCreate>()
	for (const descriptor of execution.nestedCreates) {
		if (input.superseded.has(entityIdentityKey(descriptor.entityType, descriptor.entityId))) supersededById.set(descriptor.entityId, descriptor)
	}
	for (const listChange of execution.hasManyChanges) {
		for (const addition of listChange.additions) {
			const descriptor = supersededById.get(addition.itemId)
			if (addition.kind !== 'created' || !descriptor) continue
			changeOf(listChange.entityType, listChange.entityId, listChange.fieldName, descriptor.entityType).dropped.add(addition.itemId)
		}
	}
	for (const change of changes.values()) {
		const joined = store.supersedeHasManyCreates(change.parentType, change.parentId, change.fieldName, change)
		const rows = joined.map(id => change.rows.get(id)).filter(row => row !== undefined)
		if (schema) store.writeServerRead(change.entityType, rows, schema)
		else for (const id of joined) store.refreshServerData(change.entityType, id, { id })
	}
	for (const descriptor of supersededById.values()) store.removeEntity(descriptor.entityType, descriptor.entityId)
}
