import type { EntitySnapshot } from './snapshots.js'
import type { EntityMetaStore } from './EntityMetaStore.js'
import type { RelationStore } from './RelationStore.js'
import { deepEqual } from '../utils/deepEqual.js'

interface DirtyEntity {
	entityType: string
	entityId: string
	changeType: 'create' | 'update' | 'delete'
}

/**
 * Tracks dirty state across entities by comparing current data to server data.
 *
 * Receives shared references to SnapshotStore internals so it can read
 * entity snapshots, metadata, and relation state without duplicating storage.
 */
export class DirtyTracker {
	constructor(
		private readonly entitySnapshots: ReadonlyMap<string, EntitySnapshot>,
		private readonly meta: EntityMetaStore,
		private readonly relations: RelationStore,
	) {}

	getAllDirtyEntities(): DirtyEntity[] {
		const dirtyEntities: DirtyEntity[] = []

		for (const [key] of this.entitySnapshots) {
			const [entityType, ...idParts] = key.split(':')
			const entityId = idParts.join(':')

			if (!entityType || !entityId) continue

			const entityKey = `${entityType}:${entityId}`

			if (this.meta.isScheduledForDeletion(entityKey)) {
				if (this.meta.existsOnServer(entityKey)) {
					dirtyEntities.push({ entityType, entityId, changeType: 'delete' })
				}
				continue
			}

			if (!this.meta.existsOnServer(entityKey)) {
				dirtyEntities.push({ entityType, entityId, changeType: 'create' })
				continue
			}

			if (this.isEntityDirty(entityType, entityId)) {
				dirtyEntities.push({ entityType, entityId, changeType: 'update' })
			}
		}

		return dirtyEntities
	}

	getDirtyFields(entityType: string, entityId: string): string[] {
		const key = `${entityType}:${entityId}`
		const snapshot = this.entitySnapshots.get(key)
		if (!snapshot) return []

		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>

		const dirtyFields: string[] = []

		for (const fieldName of Object.keys(data)) {
			if (fieldName === 'id') continue

			const currentValue = data[fieldName]
			const serverValue = serverData[fieldName]

			if (isRelationValue(currentValue) || isRelationValue(serverValue)) {
				continue
			}

			if (!deepEqual(currentValue, serverValue)) {
				dirtyFields.push(fieldName)
			}
		}

		return dirtyFields
	}

	getDirtyRelations(entityType: string, entityId: string): string[] {
		const keyPrefix = `${entityType}:${entityId}:`
		return this.relations.getDirtyRelations(keyPrefix)
	}

	private isEntityDirty(entityType: string, entityId: string): boolean {
		const dirtyFields = this.getDirtyFields(entityType, entityId)
		if (dirtyFields.length > 0) return true

		const keyPrefix = `${entityType}:${entityId}:`
		const dirtyRelations = this.relations.getDirtyRelations(keyPrefix)
		if (dirtyRelations.length > 0) return true

		return false
	}
}

/**
 * Checks if a value represents a relation (object with id or array of objects).
 */
function isRelationValue(value: unknown): boolean {
	if (value === null || value === undefined) return false

	if (Array.isArray(value)) {
		return value.length > 0 && typeof value[0] === 'object' && value[0] !== null
	}

	if (typeof value === 'object') {
		return 'id' in (value as object)
	}

	return false
}
