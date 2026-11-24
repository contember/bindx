import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SelectionMeta } from '../selection/types.js'

interface AssembledEntity {
	readonly columns: object
	readonly relations: ReadonlyMap<string, unknown>
	readonly data: Record<string, unknown>
}

/**
 * The data of an entity as its selection describes it: its own columns, with each
 * selected relation filled in from the relation store and the related entities'
 * snapshots. The store keeps every entity once (issue #170), so nested data is
 * assembled on read, under the keys the selection read it with.
 *
 * A selected column the snapshot holds no key for reads as null, as FieldHandle.value
 * does; the snapshot itself keeps the key absent, so a create mutation leaves it out.
 * A relation the store holds no state for has not been read and is left out.
 * A subtree whose columns and relations did not change keeps its identity from the
 * previous assembly, so a consumer memoizing on it re-runs only when it changed.
 */
export class EntityDataAssembler {
	private previous = new Map<string, AssembledEntity>()
	private next = new Map<string, AssembledEntity>()

	constructor(
		private readonly store: SnapshotStore,
		private readonly schema: SchemaRegistry,
	) {}

	assemble(entityType: string, entityId: string, selection: SelectionMeta): Record<string, unknown> | null {
		this.next = new Map()
		const data = this.assembleEntity(entityType, entityId, selection, '')
		// Only what this assembly reached is kept, so entities that left the tree are released.
		this.previous = this.next
		return data
	}

	private assembleEntity(
		entityType: string,
		entityId: string,
		selection: SelectionMeta,
		pathPrefix: string,
	): Record<string, unknown> | null {
		const snapshot = this.store.getPresentationSnapshot<Record<string, unknown>>(entityType, entityId)
		if (!snapshot) return null

		const path = `${pathPrefix}${entityType}:${entityId}`
		const previous = this.previous.get(path)
		const relations = new Map<string, unknown>()
		for (const field of selection.fields.values()) {
			const nested = field.nested
			if (!field.isRelation || !nested) continue
			const value = this.assembleRelation(entityType, entityId, field.fieldName, field.alias, nested, `${path}.${field.alias}/`)
			if (value === undefined) continue
			const before = previous?.relations.get(field.alias)
			relations.set(field.alias, isSameList(before, value) ? before : value)
		}

		const assembled = previous && previous.columns === snapshot.data && isSameRelations(previous.relations, relations)
			? previous
			: {
				columns: snapshot.data,
				relations,
				data: { ...snapshot.data, ...unsetColumnsOf(snapshot.data, selection), ...Object.fromEntries(relations) },
			}
		this.next.set(path, assembled)
		return assembled.data
	}

	/** `undefined` when the store holds no state for the relation, i.e. it was not read. */
	private assembleRelation(
		entityType: string,
		entityId: string,
		fieldName: string,
		alias: string,
		nested: SelectionMeta,
		pathPrefix: string,
	): unknown {
		const targetType = this.schema.getRelationTarget(entityType, fieldName)
		if (targetType === undefined) return undefined

		// A list read without params is not marked `isArray` in its selection, so the schema decides.
		if (this.schema.getRelationType(entityType, fieldName) === 'hasMany') {
			if (!this.store.hasHasManyView(entityType, entityId, fieldName, alias)) return undefined
			return this.store.getPresentationHasManyOrderedIds(entityType, entityId, fieldName, alias)
				.map(itemId => this.assembleEntity(targetType, itemId, nested, pathPrefix))
				.filter(item => item !== null)
		}

		const relation = this.store.getPresentationRelation(entityType, entityId, fieldName)
		if (!relation) return undefined
		return relation.currentId === null
			? null
			: this.assembleEntity(targetType, relation.currentId, nested, pathPrefix)
	}
}

/**
 * The selected columns the entity data holds no value for, each as null under its output key.
 * A read stores a column under its alias, a write under its field name, so both are checked.
 */
function unsetColumnsOf(columns: Record<string, unknown>, selection: SelectionMeta): Record<string, null> {
	const unset: Record<string, null> = {}
	for (const field of selection.fields.values()) {
		if (field.isRelation || columns[field.alias] !== undefined || columns[field.fieldName] !== undefined) continue
		unset[field.alias] = null
	}
	return unset
}

function isSameList(before: unknown, after: unknown): boolean {
	return Array.isArray(before)
		&& Array.isArray(after)
		&& before.length === after.length
		&& before.every((item, index) => item === after[index])
}

function isSameRelations(before: ReadonlyMap<string, unknown>, after: ReadonlyMap<string, unknown>): boolean {
	if (before.size !== after.size) return false
	for (const [alias, value] of after) {
		if (before.get(alias) !== value) return false
	}
	return true
}
