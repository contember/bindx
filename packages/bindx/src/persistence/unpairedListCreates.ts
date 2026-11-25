import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { entityIdentityKey, type PersistExecution } from './PersistExecution.js'

/** What the persister reads about a row the server returned. */
export type RowSchema = Pick<SchemaRegistry, 'getScalarFields' | 'getRelationType' | 'getRelationTarget'>

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

/**
 * The unpaired list creates that can leave the store. A list keeps its creates unresolved,
 * as before, when an entity outside what this persist drops still references one of them:
 * removing it would leave that reference pointing at nothing, and the next save would
 * create it again through the reference. A create shared with such a list stays as well.
 */
export function settleableUnpairedCreates(
	store: SnapshotStore,
	execution: PersistExecution,
	lists: readonly UnpairedListCreates[],
	unresolved: ReadonlySet<string>,
): SettleableCreates {
	const candidates = lists.map(list => {
		const roots = list.unpairedIds.map(id => entityIdentityKey(list.entityType, id))
		return [...withNestedCreates(execution, roots)].filter(key => unresolved.has(key))
	})
	const blocked = new Set<number>()
	const keysWhere = (isBlocked: boolean): Set<string> => (
		new Set(candidates.filter((_, index) => blocked.has(index) === isBlocked).flat())
	)
	for (let changed = true; changed;) {
		changed = false
		const kept = keysWhere(true)
		const allowed = allowedReferrers(execution, keysWhere(false))
		candidates.forEach((keys, index) => {
			if (blocked.has(index)) return
			if (!keys.some(key => kept.has(key) || isReferencedFromOutside(store, execution, key, allowed))) return
			blocked.add(index)
			changed = true
		})
	}
	return { lists: lists.filter((_, index) => !blocked.has(index)), superseded: keysWhere(false) }
}

/** Keys of the given entities and of every entity created inside them, at any depth. */
function withNestedCreates(execution: PersistExecution, roots: Iterable<string>): Set<string> {
	const keys = new Set(roots)
	const queue = [...keys]
	for (const parent of queue) {
		for (const descriptor of execution.nestedCreates) {
			if (entityIdentityKey(descriptor.parentEntityType, descriptor.parentEntityId) !== parent) continue
			const key = entityIdentityKey(descriptor.entityType, descriptor.entityId)
			if (keys.has(key)) continue
			keys.add(key)
			queue.push(key)
		}
	}
	return keys
}

/** The dropped entities and the owners of every list they leave: their references go away with them. */
function allowedReferrers(execution: PersistExecution, dropped: ReadonlySet<string>): Set<string> {
	const allowed = new Set(dropped)
	const droppedIds = new Set<string>()
	for (const descriptor of execution.nestedCreates) {
		if (!dropped.has(entityIdentityKey(descriptor.entityType, descriptor.entityId))) continue
		droppedIds.add(descriptor.entityId)
		allowed.add(entityIdentityKey(descriptor.parentEntityType, descriptor.parentEntityId))
	}
	for (const change of execution.hasManyChanges) {
		if (change.additions.some(addition => droppedIds.has(addition.itemId))) {
			allowed.add(entityIdentityKey(change.entityType, change.entityId))
		}
	}
	return allowed
}

function isReferencedFromOutside(
	store: SnapshotStore,
	execution: PersistExecution,
	key: string,
	allowed: ReadonlySet<string>,
): boolean {
	const descriptor = execution.nestedCreates.find(item => entityIdentityKey(item.entityType, item.entityId) === key)
	if (!descriptor) return false
	for (const parent of store.getParentKeysForChild(descriptor.entityId)) {
		if (!allowed.has(parent)) return true
	}
	return false
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
	for (const listChange of execution.hasManyChanges) {
		for (const addition of listChange.additions) {
			const descriptor = execution.nestedCreates.find(item => item.entityId === addition.itemId)
			if (addition.kind !== 'created' || !descriptor) continue
			if (!input.superseded.has(entityIdentityKey(descriptor.entityType, descriptor.entityId))) continue
			changeOf(listChange.entityType, listChange.entityId, listChange.fieldName, descriptor.entityType).dropped.add(addition.itemId)
		}
	}
	for (const change of changes.values()) {
		const joined = store.supersedeHasManyCreates(change.parentType, change.parentId, change.fieldName, change)
		for (const id of joined) {
			const row = change.rows.get(id)
			if (row) adoptRow(store, schema, change.entityType, row, input.confirmedIds)
		}
	}
	for (const key of input.superseded) {
		const descriptor = execution.nestedCreates.find(item => entityIdentityKey(item.entityType, item.entityId) === key)
		if (descriptor) store.removeEntity(descriptor.entityType, descriptor.entityId)
	}
}

/** Stores a row the server returned as a persisted entity, with the has-one rows it carries. */
function adoptRow(
	store: SnapshotStore,
	schema: RowSchema | undefined,
	entityType: string,
	row: Row,
	confirmedIds: ReadonlySet<string>,
): string | undefined {
	const id = row['id']
	if (typeof id !== 'string' || confirmedIds.has(id)) return undefined
	const data = { id, ...schema ? rowColumns(schema, entityType, row) : {} }
	if (store.getEntitySnapshot(entityType, id)) store.refreshServerData(entityType, id, data)
	else store.setEntityData(entityType, id, data, true)
	store.setExistsOnServer(entityType, id, true)
	if (!schema) return id
	for (const [field, value] of Object.entries(row)) {
		const target = schema.getRelationType(entityType, field) === 'hasOne' ? schema.getRelationTarget(entityType, field) : undefined
		if (target === undefined || !isRow(value)) continue
		const targetId = adoptRow(store, schema, target, value, confirmedIds) ?? (typeof value['id'] === 'string' ? value['id'] : undefined)
		if (targetId === undefined) continue
		store.getOrCreateRelation(entityType, id, field, {
			currentId: targetId, serverId: targetId, state: 'connected', serverState: 'connected', placeholderData: {},
		})
	}
	return id
}

function isRow(value: unknown): value is Row {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
