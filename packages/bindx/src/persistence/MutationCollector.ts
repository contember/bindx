import { type SnapshotStore, isPersistedId } from '../store/SnapshotStore.js'
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
	constructor(
		private readonly store: SnapshotStore,
		private readonly schemaProvider: MutationSchemaProvider,
	) {}

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

		// Collect relation values
		const relationFields = this.schemaProvider.getRelationFields(entityType)
		for (const fieldName of relationFields) {
			const value = data[fieldName]
			const relationType = this.schemaProvider.getRelationType(entityType, fieldName)

			if (relationType === 'hasOne') {
				const relationOp = this.collectCreateOneRelation(value)
				if (relationOp !== null) {
					createData[fieldName] = relationOp
				}
			} else if (relationType === 'hasMany') {
				const relationOps = this.collectCreateManyRelation(value)
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
					} else if (currentId) {
						// Entity doesn't exist - might need to create it
						// For now, just connect (the entity should be created separately)
						return { connect: { id: currentId } }
					}
				} else if (currentId && serverId && currentId === serverId) {
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

			if (id && !id.startsWith('__temp_') && this.isExistingEntity(id)) {
				// Connect to existing entity
				return { connect: { id } }
			} else if (id && id.startsWith('__temp_')) {
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
	 * Returns array of operations or null if no changes.
	 */
	private collectHasManyOperations(
		entityType: string,
		entityId: string,
		fieldName: string,
	): Array<Record<string, unknown>> | null {
		// Get current data from snapshot
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null

		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>

		const currentItems = (data[fieldName] as Array<Record<string, unknown>>) ?? []
		const serverItems = (serverData[fieldName] as Array<Record<string, unknown>>) ?? []

		const operations: Array<Record<string, unknown>> = []

		// Build sets of IDs for comparison (exclude temp IDs from current)
		const currentIds = new Set(
			currentItems
				.map(item => item['id'] as string)
				.filter(id => id && !id.startsWith('__temp_')),
		)
		const serverIds = new Set(serverItems.map(item => item['id'] as string).filter(Boolean))

		// Check for planned removals from store
		const plannedRemovals = this.store.getHasManyPlannedRemovals(entityType, entityId, fieldName)
		if (plannedRemovals) {
			for (const [removedId, removalType] of plannedRemovals) {
				if (removalType === 'delete') {
					operations.push({ delete: { id: removedId } })
				} else if (removalType === 'disconnect') {
					operations.push({ disconnect: { id: removedId } })
				}
			}
		}

		// Get created entities (via add() method) and planned connections
		const createdEntities = this.store.getHasManyCreatedEntities(entityType, entityId, fieldName)
		const plannedConnections = this.store.getHasManyPlannedConnections(entityType, entityId, fieldName)

		// Items to create (entities created via add())
		if (createdEntities) {
			const targetType = this.schemaProvider.getRelationTarget(entityType, fieldName)

			for (const tempId of createdEntities) {
				if (targetType) {
					const itemSnapshot = this.store.getEntitySnapshot(targetType, tempId)
					if (itemSnapshot) {
						const createData = { ...itemSnapshot.data as Record<string, unknown> }
						delete createData['id']
						if (Object.keys(createData).length > 0) {
							operations.push({ create: this.processNestedData(createData) })
						} else {
							// Empty create - just create with no data
							operations.push({ create: {} })
						}
					}
				}
			}
		}

		// Items to connect (planned connections that are not created entities)
		if (plannedConnections) {
			for (const connectedId of plannedConnections) {
				// Skip if it's a created entity (already handled above)
				if (createdEntities?.has(connectedId)) continue
				// Skip if already planned for removal
				if (plannedRemovals?.has(connectedId)) continue
				operations.push({ connect: { id: connectedId } })
			}
		}

		// Items to connect from embedded data (in current but not in server, with existing ID, not temp)
		for (const item of currentItems) {
			const itemId = item['id'] as string
			if (itemId && !itemId.startsWith('__temp_') && !serverIds.has(itemId)) {
				// Skip if already planned for removal
				if (plannedRemovals?.has(itemId)) continue
				// Skip if already in planned connections
				if (plannedConnections?.has(itemId)) continue
				operations.push({ connect: { id: itemId } })
			}
		}

		// Items to disconnect (in server but not in current, without planned removal)
		for (const serverItem of serverItems) {
			const itemId = serverItem['id'] as string
			if (itemId && !currentIds.has(itemId)) {
				// Only disconnect if not already planned for removal
				if (!plannedRemovals?.has(itemId)) {
					operations.push({ disconnect: { id: itemId } })
				}
			}
		}

		// Items to create from embedded data (items without ID or with temp ID in currentItems)
		for (const item of currentItems) {
			const itemId = item['id'] as string
			if (!itemId || itemId.startsWith('__temp_')) {
				// Skip if it's a created entity (already handled above)
				if (itemId && createdEntities?.has(itemId)) continue
				const createData = { ...item }
				delete createData['id']
				if (Object.keys(createData).length > 0) {
					operations.push({ create: this.processNestedData(createData) })
				}
			}
		}

		// Items to update (in both, but with different data)
		for (const currentItem of currentItems) {
			const itemId = currentItem['id'] as string
			if (!itemId || itemId.startsWith('__temp_')) continue

			const serverItem = serverItems.find(s => s['id'] === itemId)
			if (!serverItem) continue

			// Check if item data changed
			const itemChanges = this.collectItemChanges(currentItem, serverItem)
			if (itemChanges && Object.keys(itemChanges).length > 0) {
				operations.push({
					update: {
						by: { id: itemId },
						data: itemChanges,
					},
				})
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

			if (id && !id.startsWith('__temp_') && this.isExistingEntity(id)) {
				// Connect to existing entity
				operations.push({ connect: { id } })
			} else {
				// Create new entity
				const createData = { ...obj }
				delete createData['id']
				if (Object.keys(createData).length > 0) {
					operations.push({ create: this.processNestedData(createData) })
				}
			}
		}

		return operations.length > 0 ? operations : null
	}

	// ==================== Helper Methods ====================

	/**
	 * Collects changes between current and server item data.
	 */
	private collectItemChanges(
		currentItem: Record<string, unknown>,
		serverItem: Record<string, unknown>,
	): Record<string, unknown> | null {
		const changes: Record<string, unknown> = {}

		for (const [key, value] of Object.entries(currentItem)) {
			if (key === 'id') continue

			const serverValue = serverItem[key]
			if (!deepEqual(value, serverValue)) {
				changes[key] = value
			}
		}

		return Object.keys(changes).length > 0 ? changes : null
	}

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
						if (itemObj['id'] && !String(itemObj['id']).startsWith('__temp_')) {
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
				if (obj['id'] && !String(obj['id']).startsWith('__temp_')) {
					// Has-one with existing entity - connect
					result[key] = { connect: { id: obj['id'] } }
				} else if (obj['id'] && String(obj['id']).startsWith('__temp_')) {
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
}
