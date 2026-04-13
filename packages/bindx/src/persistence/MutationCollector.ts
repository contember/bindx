import { type SnapshotStore, isPersistedId, isTempId } from '../store/SnapshotStore.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import type { MutationSchemaProvider } from './MutationSchemaProvider.js'
import type { MutationDataCollector } from './types.js'
import { deepEqual } from '../utils/deepEqual.js'

/**
 * Result of collecting mutations for an entity
 */
export interface EntityMutationResult {
	/** Type of mutation: create, update, or delete */
	type: 'create' | 'update' | 'delete'
	/** Entity type name */
	entityType: string
	/** Entity ID (may be temp ID for creates) */
	entityId: string
	/** The mutation data (for create/update) */
	data?: Record<string, unknown>
}

/**
 * MutationCollector builds Contember-compatible mutation input
 * by collecting changes from SnapshotStore including:
 * - Scalar field changes
 * - Has-one relation operations (connect, disconnect, delete, create, update)
 * - Has-many relation operations (connect, disconnect, delete, create, update)
 * - Entity creates and deletes
 *
 * This is a unified implementation that works with any schema provider
 * implementing MutationSchemaProvider interface (SchemaRegistry, Contember SchemaNames via adapter).
 */
export class MutationCollector implements MutationDataCollector {
	private excludedEntityIds: ReadonlySet<string> = new Set()
	private readonly _nestedEntityIds: Set<string> = new Set()
	/** Maps nested entity temp IDs to their entity types for post-persist processing */
	private readonly _nestedEntityTypes: Map<string, string> = new Map()

	constructor(
		private readonly store: SnapshotStore,
		private readonly schemaProvider: MutationSchemaProvider,
	) {}

	/**
	 * Sets entity IDs that should be excluded from nested mutation generation.
	 * These entities get their own top-level mutations, so nested updates are skipped
	 * to avoid duplicate changes.
	 */
	setExcludedEntities(ids: ReadonlySet<string>): void {
		this.excludedEntityIds = ids
		this._nestedEntityIds.clear()
		this._nestedEntityTypes.clear()
	}

	/**
	 * Returns IDs of entities that were included as nested inline creates
	 * inside another entity's mutation data. These entities don't need
	 * their own standalone top-level mutations.
	 */
	getNestedEntityIds(): ReadonlySet<string> {
		return this._nestedEntityIds
	}

	/**
	 * Returns a map of nested entity temp IDs to their entity types.
	 * Used by BatchPersister to commit and map IDs for nested entities after persist.
	 */
	getNestedEntityTypes(): ReadonlyMap<string, string> {
		return this._nestedEntityTypes
	}

	// ==================== Main Collection Methods ====================

	/**
	 * Collects all changes for an entity into appropriate mutation format.
	 * Returns the mutation result or null if no changes/entity doesn't exist.
	 */
	collectMutation(
		entityType: string,
		entityId: string,
	): EntityMutationResult | null {
		// Check if entity is scheduled for deletion
		if (this.store.isScheduledForDeletion(entityType, entityId)) {
			// Only delete if it exists on server
			if (this.store.existsOnServer(entityType, entityId)) {
				return {
					type: 'delete',
					entityType,
					entityId,
				}
			}
			return null
		}

		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) {
			return null
		}

		// Check if entity exists on server
		const existsOnServer = this.store.existsOnServer(entityType, entityId)

		if (!existsOnServer) {
			// This is a create
			const createData = this.collectCreateData(entityType, entityId)
			if (createData && Object.keys(createData).length > 0) {
				return {
					type: 'create',
					entityType,
					entityId,
					data: createData,
				}
			}
			return null
		}

		// This is an update
		const updateData = this.collectUpdateData(entityType, entityId)
		if (updateData && Object.keys(updateData).length > 0) {
			return {
				type: 'update',
				entityType,
				entityId,
				data: updateData,
			}
		}

		return null
	}

	/**
	 * Collects all changes for an entity into Contember UpdateDataInput format.
	 * Returns the mutation data or null if no changes.
	 */
	collectUpdateData(
		entityType: string,
		entityId: string,
	): Record<string, unknown> | null {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) {
			return null
		}

		if (!this.schemaProvider.hasEntity(entityType)) {
			throw new Error(`Entity type '${entityType}' not found in schema`)
		}

		const mutation: Record<string, unknown> = {}

		// Collect scalar field changes
		this.collectScalarChanges(entityType, snapshot, mutation)

		// Collect relation changes
		this.collectRelationChanges(entityType, entityId, mutation)

		return Object.keys(mutation).length > 0 ? mutation : null
	}

	/**
	 * Collects data for creating a new entity.
	 * Returns the create data or null if empty.
	 */
	collectCreateData(
		entityType: string,
		entityId: string,
	): Record<string, unknown> | null {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) {
			return null
		}

		if (!this.schemaProvider.hasEntity(entityType)) {
			throw new Error(`Entity type '${entityType}' not found in schema`)
		}

		const data = snapshot.data as Record<string, unknown>
		const createData: Record<string, unknown> = {}

		// Collect scalar field values
		const scalarFields = this.schemaProvider.getScalarFields(entityType)
		for (const fieldName of scalarFields) {
			if (fieldName === 'id') continue // ID is auto-generated

			const value = data[fieldName]
			if (value !== undefined && value !== null) {
				createData[fieldName] = value
			}
		}

		// Materialize embedded relation data into store entities,
		// then collect from store for consistent tracking and post-persist ID mapping
		this.materializeEntityRelations(entityType, entityId)

		// Collect relation values from store
		const relationFields = this.schemaProvider.getRelationFields(entityType)
		for (const fieldName of relationFields) {
			const relationType = this.schemaProvider.getRelationType(entityType, fieldName)

			if (relationType === 'hasOne') {
				const relationOp = this.collectHasOneOperation(entityType, entityId, fieldName)
				if (relationOp !== null) {
					createData[fieldName] = relationOp
				}
			} else if (relationType === 'hasMany') {
				const relationOps = this.collectHasManyOperations(entityType, entityId, fieldName)
				if (relationOps !== null && relationOps.length > 0) {
					createData[fieldName] = relationOps
				}
			}
		}

		return Object.keys(createData).length > 0 ? createData : null
	}

	/**
	 * Collects mutation data for specific fields only.
	 * Returns the mutation data containing only the specified fields.
	 */
	collectFieldsData(
		entityType: string,
		entityId: string,
		fieldNames: readonly string[],
	): Record<string, unknown> | null {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) {
			return null
		}

		if (!this.schemaProvider.hasEntity(entityType)) {
			throw new Error(`Entity type '${entityType}' not found in schema`)
		}

		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>
		const result: Record<string, unknown> = {}

		const scalarFields = new Set(this.schemaProvider.getScalarFields(entityType))

		for (const fieldName of fieldNames) {
			if (scalarFields.has(fieldName)) {
				// Scalar field - include if changed
				const currentValue = data[fieldName]
				const serverValue = serverData[fieldName]
				if (!deepEqual(currentValue, serverValue)) {
					result[fieldName] = currentValue
				}
			} else {
				const relationType = this.schemaProvider.getRelationType(entityType, fieldName)
				if (relationType === 'hasOne') {
					const operation = this.collectHasOneOperation(entityType, entityId, fieldName)
					if (operation !== null) {
						result[fieldName] = operation
					}
				} else if (relationType === 'hasMany') {
					const operations = this.collectHasManyOperations(entityType, entityId, fieldName)
					if (operations !== null && operations.length > 0) {
						result[fieldName] = operations
					}
				}
			}
		}

		return Object.keys(result).length > 0 ? result : null
	}

	// ==================== Scalar Changes ====================

	/**
	 * Collects scalar field changes by comparing data to serverData.
	 */
	private collectScalarChanges(
		entityType: string,
		snapshot: EntitySnapshot,
		mutation: Record<string, unknown>,
	): void {
		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>

		const scalarFields = this.schemaProvider.getScalarFields(entityType)
		for (const fieldName of scalarFields) {
			const currentValue = data[fieldName]
			const serverValue = serverData[fieldName]

			if (!deepEqual(currentValue, serverValue)) {
				mutation[fieldName] = currentValue
			}
		}
	}

	// ==================== Relation Changes ====================

	/**
	 * Collects has-one and has-many relation changes.
	 */
	private collectRelationChanges(
		entityType: string,
		entityId: string,
		mutation: Record<string, unknown>,
	): void {
		const relationFields = this.schemaProvider.getRelationFields(entityType)

		for (const fieldName of relationFields) {
			const relationType = this.schemaProvider.getRelationType(entityType, fieldName)

			if (relationType === 'hasOne') {
				const operation = this.collectHasOneOperation(entityType, entityId, fieldName)
				if (operation !== null) {
					mutation[fieldName] = operation
				}
			} else if (relationType === 'hasMany') {
				const operations = this.collectHasManyOperations(entityType, entityId, fieldName)
				if (operations !== null && operations.length > 0) {
					mutation[fieldName] = operations
				}
			}
		}
	}

	/**
	 * Collects has-one relation operation.
	 * Returns the operation object or null if no change.
	 */
	private collectHasOneOperation(
		entityType: string,
		entityId: string,
		fieldName: string,
	): Record<string, unknown> | null {
		const relationState = this.store.getRelation(entityType, entityId, fieldName)
		if (!relationState) {
			return null
		}

		const { state, serverState, currentId, serverId, placeholderData } = relationState

		switch (state) {
			case 'connected':
				if (currentId !== serverId) {
					// Check if current entity exists on server
					if (currentId && this.isExistingEntity(currentId)) {
						return { connect: { id: currentId } }
					} else if (currentId && isTempId(currentId)) {
						// Temp entity — generate inline create with its collected data
						this._nestedEntityIds.add(currentId)
						const targetType = this.schemaProvider.getRelationTarget(entityType, fieldName)
						if (targetType) {
							this._nestedEntityTypes.set(currentId, targetType)
							const createData = this.collectCreateData(targetType, currentId)
							return { create: createData ?? {} }
						}
						return { create: {} }
					} else if (currentId) {
						return { connect: { id: currentId } }
					}
				} else if (currentId && serverId && currentId === serverId) {
					// Skip if entity has its own top-level mutation
					if (this.excludedEntityIds.has(currentId)) {
						return null
					}
					// Same entity - check if we need to update it
					const targetType = this.schemaProvider.getRelationTarget(entityType, fieldName)
					if (targetType) {
						const nestedChanges = this.collectUpdateData(targetType, currentId)
						if (nestedChanges) {
							return { update: nestedChanges }
						}
					}
				}
				return null

			case 'disconnected':
				// Only emit disconnect if server had a connection
				if (serverState === 'connected' && serverId !== null) {
					return { disconnect: true }
				}
				return null

			case 'deleted':
				// Delete the related entity
				return { delete: true }

			case 'creating':
				// Create new entity with placeholder data
				if (Object.keys(placeholderData).length > 0) {
					const createData = this.processNestedData(placeholderData)
					return { create: createData }
				}
				return null

			default:
				return null
		}
	}

	/**
	 * Collects has-one relation for create mutation.
	 */
	private collectCreateOneRelation(
		value: unknown,
	): Record<string, unknown> | null {
		if (value === null || value === undefined) {
			return null
		}

		if (typeof value === 'object') {
			const obj = value as Record<string, unknown>
			const id = obj['id'] as string | undefined

			if (id && !isTempId(id) && this.isExistingEntity(id)) {
				// Connect to existing entity
				return { connect: { id } }
			} else if (id && isTempId(id)) {
				// Create new entity (temp ID)
				const createData = { ...obj }
				delete createData['id']
				return { create: this.processNestedData(createData) }
			} else if (!id) {
				// Create new entity (no ID)
				return { create: this.processNestedData(obj) }
			}
		}

		return null
	}

	// ==================== Has-Many Relation Changes ====================

	/**
	 * Collects has-many relation operations.
	 * Uses StoredHasManyState as the single source of truth for all operations.
	 * Returns array of operations or null if no changes.
	 */
	private collectHasManyOperations(
		entityType: string,
		entityId: string,
		fieldName: string,
	): Array<Record<string, unknown>> | null {
		const hasManyState = this.store.getHasMany(entityType, entityId, fieldName)
		if (!hasManyState) return null

		const operations: Array<Record<string, unknown>> = []
		const targetType = this.schemaProvider.getRelationTarget(entityType, fieldName)

		// Planned removals -> disconnect/delete
		for (const [removedId, removalType] of hasManyState.plannedRemovals) {
			if (removalType === 'delete') {
				operations.push({ delete: { id: removedId }, alias: removedId })
			} else {
				operations.push({ disconnect: { id: removedId }, alias: removedId })
			}
		}

		// Created entities -> create (using collectCreateData for full recursive collection)
		if (targetType) {
			for (const tempId of hasManyState.createdEntities) {
				this._nestedEntityIds.add(tempId)
				this._nestedEntityTypes.set(tempId, targetType)
				const createData = this.collectCreateData(targetType, tempId)
				operations.push({ create: createData ?? {}, alias: tempId })
			}
		}

		// Planned connections (minus created entities) -> connect
		for (const connectedId of hasManyState.plannedConnections) {
			if (hasManyState.createdEntities.has(connectedId)) continue
			operations.push({ connect: { id: connectedId }, alias: connectedId })
		}

		// Server items that aren't removed -> check for updates via entity snapshots
		if (targetType) {
			for (const itemId of hasManyState.serverIds) {
				if (hasManyState.plannedRemovals.has(itemId)) continue
				if (this.excludedEntityIds.has(itemId)) continue

				const itemSnapshot = this.store.getEntitySnapshot(targetType, itemId)
				if (!itemSnapshot) continue

				const itemData = itemSnapshot.data as Record<string, unknown>
				const itemServerData = itemSnapshot.serverData as Record<string, unknown>

				const changes: Record<string, unknown> = {}
				for (const [key, value] of Object.entries(itemData)) {
					if (key === 'id') continue
					if (!deepEqual(value, itemServerData[key])) {
						changes[key] = value
					}
				}

				if (Object.keys(changes).length > 0) {
					operations.push({
						update: {
							by: { id: itemId },
							data: changes,
						},
						alias: itemId,
					})
				}
			}
		}

		return operations.length > 0 ? operations : null
	}

	/**
	 * Collects has-many relations for create mutation.
	 */
	private collectCreateManyRelation(
		value: unknown,
	): Array<Record<string, unknown>> | null {
		if (!Array.isArray(value)) return null

		const operations: Array<Record<string, unknown>> = []

		for (const item of value) {
			if (typeof item !== 'object' || item === null) continue

			const obj = item as Record<string, unknown>
			const id = obj['id'] as string | undefined

			if (id && !isTempId(id) && this.isExistingEntity(id)) {
				// Connect to existing entity
				operations.push({ connect: { id }, alias: id })
			} else {
				// Create new entity
				const createData = { ...obj }
				delete createData['id']
				if (Object.keys(createData).length > 0) {
					operations.push({ create: this.processNestedData(createData), alias: id })
				}
			}
		}

		return operations.length > 0 ? operations : null
	}

	// ==================== Helper Methods ====================

	/**
	 * Processes nested data to handle relation objects.
	 * Converts nested objects with 'id' to connect operations.
	 */
	private processNestedData(data: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {}

		for (const [key, value] of Object.entries(data)) {
			if (value === null || value === undefined) {
				result[key] = value
				continue
			}

			if (Array.isArray(value)) {
				// Has-many: convert each item
				result[key] = value.map(item => {
					if (typeof item === 'object' && item !== null) {
						const itemObj = item as Record<string, unknown>
						if (itemObj['id'] && !isTempId(String(itemObj['id']))) {
							// Existing item - connect
							return { connect: { id: itemObj['id'] } }
						} else {
							// New item - create
							const createData = { ...itemObj }
							delete createData['id']
							return { create: this.processNestedData(createData) }
						}
					}
					return item
				})
			} else if (typeof value === 'object') {
				const obj = value as Record<string, unknown>
				if (obj['id'] && !isTempId(String(obj['id']))) {
					// Has-one with existing entity - connect
					result[key] = { connect: { id: obj['id'] } }
				} else if (obj['id'] && isTempId(String(obj['id']))) {
					// Has-one with temp entity - create
					const createData = { ...obj }
					delete createData['id']
					result[key] = { create: this.processNestedData(createData) }
				} else {
					// Regular nested object
					result[key] = value
				}
			} else {
				result[key] = value
			}
		}

		return result
	}

	/**
	 * Checks if an entity ID represents an existing entity (persisted, not temp or placeholder).
	 */
	private isExistingEntity(id: string): boolean {
		return isPersistedId(id)
	}

	// ==================== Embedded Data Materialization ====================

	/**
	 * Materializes embedded relation data in an entity's snapshot into proper
	 * store entities and relations. This normalizes inline objects (e.g.
	 * `reviews: [{ reviewType: 'expert' }]`) into tracked entities with temp IDs,
	 * enabling proper post-persist ID mapping and commit.
	 */
	private materializeEntityRelations(entityType: string, entityId: string): void {
		if (!this.schemaProvider.hasEntity(entityType)) return

		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return

		const data = snapshot.data as Record<string, unknown>
		const relationFields = this.schemaProvider.getRelationFields(entityType)

		for (const fieldName of relationFields) {
			const value = data[fieldName]
			if (value === null || value === undefined) continue

			const relationType = this.schemaProvider.getRelationType(entityType, fieldName)

			if (relationType === 'hasOne' && typeof value === 'object' && !Array.isArray(value)) {
				this.materializeEmbeddedHasOne(entityType, entityId, fieldName, value as Record<string, unknown>)
			} else if (relationType === 'hasMany' && Array.isArray(value) && value.length > 0) {
				this.materializeEmbeddedHasMany(entityType, entityId, fieldName, value)
			}
		}
	}

	/**
	 * Materializes an embedded hasMany array into store entities.
	 * Skips if the hasMany state already has store-managed entities.
	 */
	private materializeEmbeddedHasMany(
		entityType: string,
		entityId: string,
		fieldName: string,
		items: unknown[],
	): void {
		const targetType = this.schemaProvider.getRelationTarget(entityType, fieldName)
		if (!targetType) return

		// Skip if store already has managed entities for this relation
		const existing = this.store.getHasMany(entityType, entityId, fieldName)
		if (existing && (existing.createdEntities.size > 0 || existing.plannedConnections.size > 0)) {
			return
		}

		this.store.getOrCreateHasMany(entityType, entityId, fieldName, [])

		for (const item of items) {
			if (typeof item !== 'object' || item === null) continue
			const obj = item as Record<string, unknown>
			const id = obj['id'] as string | undefined

			if (id && !isTempId(id) && isPersistedId(id)) {
				// Existing entity — add as a planned connection (not created)
				this.store.connectExistingToHasMany(entityType, entityId, fieldName, id)
				continue
			}

			// Create store entity from embedded data
			const entityData = { ...obj }
			delete entityData['id']
			const tempId = this.store.createEntity(targetType, entityData)
			this.store.addToHasMany(entityType, entityId, fieldName, tempId)

			// Recursively materialize nested relations in the new entity
			this.materializeEntityRelations(targetType, tempId)
		}

		// Clear embedded array from parent snapshot
		this.clearEmbeddedField(entityType, entityId, fieldName, [])
	}

	/**
	 * Materializes an embedded hasOne object into a store entity and relation.
	 * Skips if a relation already exists in the store for this field.
	 */
	private materializeEmbeddedHasOne(
		entityType: string,
		entityId: string,
		fieldName: string,
		obj: Record<string, unknown>,
	): void {
		// Skip if relation already exists in store
		const existingRelation = this.store.getRelation(entityType, entityId, fieldName)
		if (existingRelation) return

		const targetType = this.schemaProvider.getRelationTarget(entityType, fieldName)
		if (!targetType) return

		const id = obj['id'] as string | undefined

		if (id && !isTempId(id) && isPersistedId(id)) {
			// Existing entity — create a connect relation
			this.store.getOrCreateRelation(entityType, entityId, fieldName, {
				currentId: id,
				serverId: null,
				state: 'connected',
				serverState: 'disconnected',
				placeholderData: {},
			})
		} else {
			// New entity — create store entity and connect
			const entityData = { ...obj }
			delete entityData['id']
			const tempId = this.store.createEntity(targetType, entityData)

			this.store.getOrCreateRelation(entityType, entityId, fieldName, {
				currentId: tempId,
				serverId: null,
				state: 'connected',
				serverState: 'disconnected',
				placeholderData: {},
			})

			// Recursively materialize nested relations
			this.materializeEntityRelations(targetType, tempId)
		}

		// Clear embedded data from parent snapshot
		this.clearEmbeddedField(entityType, entityId, fieldName, null)
	}

	/**
	 * Clears an embedded field value from an entity's snapshot data.
	 */
	private clearEmbeddedField(
		entityType: string,
		entityId: string,
		fieldName: string,
		emptyValue: unknown,
	): void {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return

		const data = { ...(snapshot.data as Record<string, unknown>) }
		data[fieldName] = emptyValue
		this.store.setEntityData(entityType, entityId, data, false)
	}
}
