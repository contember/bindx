import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SelectionMeta } from '../selection/types.js'

/**
 * The data of an entity as its selection describes it: its own columns, with each
 * selected relation filled in from the relation store and the related entities'
 * snapshots. The store keeps every entity once (issue #170), so nested data is
 * assembled on read, under the keys the selection read it with.
 *
 * A relation the store holds no state for has not been read and is left out.
 */
export function assembleEntityData(
	store: SnapshotStore,
	schema: SchemaRegistry,
	entityType: string,
	entityId: string,
	selection: SelectionMeta,
): Record<string, unknown> | null {
	const snapshot = store.getPresentationSnapshot<Record<string, unknown>>(entityType, entityId)
	if (!snapshot) return null

	const data: Record<string, unknown> = { ...snapshot.data }
	for (const field of selection.fields.values()) {
		const nested = field.nested
		if (!field.isRelation || !nested) continue
		const targetType = schema.getRelationTarget(entityType, field.fieldName)
		if (targetType === undefined) continue

		// A list read without params is not marked `isArray` in its selection, so the schema decides.
		if (schema.getRelationType(entityType, field.fieldName) === 'hasMany') {
			if (!store.getHasMany(entityType, entityId, field.fieldName)) continue
			data[field.alias] = store.getPresentationHasManyOrderedIds(entityType, entityId, field.fieldName, field.alias)
				.map(itemId => assembleEntityData(store, schema, targetType, itemId, nested))
				.filter((item): item is Record<string, unknown> => item !== null)
			continue
		}

		const relation = store.getPresentationRelation(entityType, entityId, field.fieldName)
		if (!relation) continue
		data[field.alias] = relation.currentId === null
			? null
			: assembleEntityData(store, schema, targetType, relation.currentId, nested)
	}
	return data
}
