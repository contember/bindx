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

/** Keys of the given entities and of every entity created inside them, at any depth. */
export function withNestedCreates(execution: PersistExecution, roots: Iterable<string>): Set<string> {
	const keys = new Set(roots)
	const queue = [...keys]
	for (let index = 0; index < queue.length; index++) {
		const parent = queue[index]!
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

interface SupersedeInput {
	readonly lists: readonly UnpairedListCreates[]
	/** Unpaired list creates and everything created inside them. */
	readonly superseded: ReadonlySet<string>
	/** Server ids this persist mapped to entities of its own. */
	readonly confirmedIds: ReadonlySet<string>
}

/**
 * Settles list creates the server confirmed without a row to pair them with, the way the
 * original Contember binding does: the client's items leave the store, so the next save
 * cannot create them again, and the list takes the response's unclaimed rows as persisted
 * entities. A row is never assigned to a client entity, as that would be a guess.
 */
export function supersedeUnpairedCreates(store: SnapshotStore, schema: RowSchema | undefined, execution: PersistExecution, input: SupersedeInput): void {
	const changes = new Map<string, { parentType: string; parentId: string; fieldName: string; dropped: Set<string>; adopted: string[] }>()
	const changeOf = (parentType: string, parentId: string, fieldName: string) => {
		const key = `${entityIdentityKey(parentType, parentId)}:${fieldName}`
		const existing = changes.get(key)
		if (existing) return existing
		const created = { parentType, parentId, fieldName, dropped: new Set<string>(), adopted: [] }
		changes.set(key, created)
		return created
	}
	for (const list of input.lists) {
		const change = changeOf(list.parentEntityType, list.parentEntityId, list.fieldName)
		for (const row of list.rows) {
			const id = adoptRow(store, schema, list.entityType, row, input.confirmedIds)
			if (id !== undefined && !change.adopted.includes(id)) change.adopted.push(id)
		}
	}
	for (const change of execution.hasManyChanges) {
		for (const addition of change.additions) {
			const descriptor = execution.nestedCreates.find(item => item.entityId === addition.itemId)
			if (addition.kind !== 'created' || !descriptor) continue
			if (!input.superseded.has(entityIdentityKey(descriptor.entityType, descriptor.entityId))) continue
			changeOf(change.entityType, change.entityId, change.fieldName).dropped.add(addition.itemId)
		}
	}
	for (const change of changes.values()) {
		store.supersedeHasManyCreates(change.parentType, change.parentId, change.fieldName, change)
	}
	for (const key of input.superseded) {
		const descriptor = execution.nestedCreates.find(item => entityIdentityKey(item.entityType, item.entityId) === key)
		if (descriptor) store.removeEntity(descriptor.entityType, descriptor.entityId)
	}
}

/** Stores a row the server returned as a persisted entity, with the has-one rows it carries. */
function adoptRow(store: SnapshotStore, schema: RowSchema | undefined, entityType: string, row: Row, confirmedIds: ReadonlySet<string>): string | undefined {
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
