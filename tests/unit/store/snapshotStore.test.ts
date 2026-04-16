import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore, isTempId, isPlaceholderId, isPersistedId, createServerError, createLoadError } from '@contember/bindx'
import { createTestStore, createMockSubscriber, createArticleData, createAuthorData } from '../shared/unitTestHelpers.js'

describe('SnapshotStore', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
	})

	// ==================== Entity Snapshots ====================

	describe('Entity Snapshots', () => {
		describe('setEntityData', () => {
			test('should create a new entity snapshot', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot).toBeDefined()
				expect(snapshot?.id).toBe('a-1')
				expect(snapshot?.entityType).toBe('Article')
				expect(snapshot?.data).toEqual({ id: 'a-1', title: 'Test' })
			})

			test('should set serverData when isServerData is true', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.serverData).toEqual({ id: 'a-1', title: 'Test' })
			})

			test('should not update serverData when isServerData is false', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Updated' }, false)

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toEqual({ id: 'a-1', title: 'Updated' })
				expect(snapshot?.serverData).toEqual({ id: 'a-1', title: 'Original' })
			})

			test('should merge new data with existing data', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.setEntityData('Article', 'a-1', { id: 'a-1', content: 'Content' }, true)

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toEqual({ id: 'a-1', title: 'Test', content: 'Content' })
			})

			test('should increment version on each update', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'V1' }, true)
				const v1 = store.getEntitySnapshot('Article', 'a-1')?.version

				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'V2' }, true)
				const v2 = store.getEntitySnapshot('Article', 'a-1')?.version

				expect(v2).toBe(v1! + 1)
			})

			test('should return immutable snapshot', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				const snapshot = store.getEntitySnapshot('Article', 'a-1')

				expect(Object.isFrozen(snapshot)).toBe(true)
			})

			test('should mark entity as existing on server when isServerData is true', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				expect(store.existsOnServer('Article', 'a-1')).toBe(true)
			})
		})

		describe('hasEntity', () => {
			test('should return true for existing entity', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				expect(store.hasEntity('Article', 'a-1')).toBe(true)
			})

			test('should return false for non-existing entity', () => {
				expect(store.hasEntity('Article', 'non-existent')).toBe(false)
			})
		})

		describe('updateEntityFields', () => {
			test('should update specific fields', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', content: 'Original' }, true)
				store.updateEntityFields('Article', 'a-1', { content: 'Updated' })

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toEqual({ id: 'a-1', title: 'Test', content: 'Updated' })
			})

			test('should return undefined for non-existing entity', () => {
				const result = store.updateEntityFields('Article', 'non-existent', { title: 'Test' })
				expect(result).toBeUndefined()
			})
		})

		describe('setFieldValue', () => {
			test('should set a simple field value', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toHaveProperty('title', 'Updated')
			})

			test('should set a nested field value', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', meta: { views: 0 } }, true)
				store.setFieldValue('Article', 'a-1', ['meta', 'views'], 100)

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect((snapshot?.data as Record<string, unknown>)['meta']).toEqual({ views: 100 })
			})

			test('should do nothing for non-existing entity', () => {
				store.setFieldValue('Article', 'non-existent', ['title'], 'Test')
				expect(store.hasEntity('Article', 'non-existent')).toBe(false)
			})
		})

		describe('commitEntity', () => {
			test('should set serverData equal to data', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Updated')
				store.commitEntity('Article', 'a-1')

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toEqual(snapshot?.serverData)
			})

			test('should do nothing for non-existing entity', () => {
				store.commitEntity('Article', 'non-existent')
				expect(store.hasEntity('Article', 'non-existent')).toBe(false)
			})
		})

		describe('resetEntity', () => {
			test('should set data equal to serverData', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Updated')
				store.resetEntity('Article', 'a-1')

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toEqual({ id: 'a-1', title: 'Original' })
			})
		})

		describe('removeEntity', () => {
			test('should remove entity from store', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.removeEntity('Article', 'a-1')

				expect(store.hasEntity('Article', 'a-1')).toBe(false)
			})

			test('should also remove load state', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.setLoadState('Article', 'a-1', 'success')
				store.removeEntity('Article', 'a-1')

				expect(store.getLoadState('Article', 'a-1')).toBeUndefined()
			})
		})
	})

	// ==================== Entity Metadata ====================

	describe('Entity Metadata', () => {
		describe('existsOnServer', () => {
			test('should return false for new entity', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, false)
				store.setExistsOnServer('Article', 'a-1', false)
				expect(store.existsOnServer('Article', 'a-1')).toBe(false)
			})

			test('should return true when marked as existing', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				expect(store.existsOnServer('Article', 'a-1')).toBe(true)
			})
		})

		describe('scheduleForDeletion', () => {
			test('should mark entity for deletion', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.scheduleForDeletion('Article', 'a-1')

				expect(store.isScheduledForDeletion('Article', 'a-1')).toBe(true)
			})

			test('should unschedule entity from deletion', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.scheduleForDeletion('Article', 'a-1')
				store.unscheduleForDeletion('Article', 'a-1')

				expect(store.isScheduledForDeletion('Article', 'a-1')).toBe(false)
			})
		})
	})

	// ==================== Temp ID Management ====================

	describe('Temp ID Management', () => {
		describe('createEntity', () => {
			test('should create entity with temp ID', () => {
				const tempId = store.createEntity('Article', { title: 'New Article' })

				expect(isTempId(tempId)).toBe(true)
				expect(store.hasEntity('Article', tempId)).toBe(true)
			})

			test('should mark new entity as not existing on server', () => {
				const tempId = store.createEntity('Article', { title: 'New Article' })
				expect(store.existsOnServer('Article', tempId)).toBe(false)
			})

			test('should include initial data in snapshot', () => {
				const tempId = store.createEntity('Article', { title: 'New Article' })
				const snapshot = store.getEntitySnapshot('Article', tempId)

				expect(snapshot?.data).toHaveProperty('title', 'New Article')
			})
		})

		describe('mapTempIdToPersistedId', () => {
			test('should map temp ID to persisted ID', () => {
				const tempId = store.createEntity('Article')
				store.mapTempIdToPersistedId('Article', tempId, 'real-id-123')

				expect(store.getPersistedId('Article', tempId)).toBe('real-id-123')
			})

			test('should mark entity as existing on server after mapping', () => {
				const tempId = store.createEntity('Article')
				store.mapTempIdToPersistedId('Article', tempId, 'real-id-123')

				expect(store.existsOnServer('Article', tempId)).toBe(true)
			})
		})

		describe('isNewEntity', () => {
			test('should return true for temp ID without mapping', () => {
				const tempId = store.createEntity('Article')
				expect(store.isNewEntity('Article', tempId)).toBe(true)
			})

			test('should return false for temp ID with mapping', () => {
				const tempId = store.createEntity('Article')
				store.mapTempIdToPersistedId('Article', tempId, 'real-id')
				expect(store.isNewEntity('Article', tempId)).toBe(false)
			})

			test('should return false for real ID', () => {
				store.setEntityData('Article', 'real-id', { id: 'real-id', title: 'Test' }, true)
				expect(store.isNewEntity('Article', 'real-id')).toBe(false)
			})

			test('should return true for placeholder ID', () => {
				expect(store.isNewEntity('Article', '__placeholder_123')).toBe(true)
			})
		})

		describe('ID type detection helpers', () => {
			test('isTempId should detect temp IDs', () => {
				expect(isTempId('__temp_abc123')).toBe(true)
				expect(isTempId('regular-id')).toBe(false)
			})

			test('isPlaceholderId should detect placeholder IDs', () => {
				expect(isPlaceholderId('__placeholder_abc123')).toBe(true)
				expect(isPlaceholderId('regular-id')).toBe(false)
			})

			test('isPersistedId should detect persisted IDs', () => {
				expect(isPersistedId('regular-id')).toBe(true)
				expect(isPersistedId('__temp_abc123')).toBe(false)
				expect(isPersistedId('__placeholder_abc123')).toBe(false)
			})
		})
	})

	// ==================== Load State ====================

	describe('Load State', () => {
		test('should set and get load state', () => {
			store.setLoadState('Article', 'a-1', 'loading')
			expect(store.getLoadState('Article', 'a-1')?.status).toBe('loading')
		})

		test('should store error in load state', () => {
			const error = createLoadError(new Error('Network error'))
			store.setLoadState('Article', 'a-1', 'error', error)

			const loadState = store.getLoadState('Article', 'a-1')
			expect(loadState?.status).toBe('error')
			expect(loadState?.error).toBe(error)
		})
	})

	// ==================== Has-Many State ====================

	describe('Has-Many State', () => {
		describe('getOrCreateHasMany', () => {
			test('should create has-many state with server IDs', () => {
				const state = store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])

				expect(state.serverIds).toEqual(new Set(['t-1', 't-2']))
				expect(state.plannedRemovals.size).toBe(0)
				expect(state.plannedConnections.size).toBe(0)
			})

			test('should update serverIds when called with new values', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				const state2 = store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'])

				expect(state2.serverIds).toEqual(new Set(['t-2']))
			})

			test('should preserve existing state when called without serverIds', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				const state2 = store.getOrCreateHasMany('Article', 'a-1', 'tags')

				expect(state2.serverIds).toEqual(new Set(['t-1']))
			})
		})

		describe('setHasManyServerIds', () => {
			test('should set server IDs', () => {
				store.setHasManyServerIds('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])
				const state = store.getHasMany('Article', 'a-1', 'tags')

				expect(state?.serverIds).toEqual(new Set(['t-1', 't-2', 't-3']))
			})

			test('should reset orderedIds when server IDs change', () => {
				const state = store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.moveInHasMany('Article', 'a-1', 'tags', 0, 0) // triggers orderedIds
				store.setHasManyServerIds('Article', 'a-1', 'tags', ['t-1', 't-2'])

				const newState = store.getHasMany('Article', 'a-1', 'tags')
				expect(newState?.orderedIds).toBeNull()
			})
		})

		describe('planHasManyRemoval', () => {
			test('should plan removal with disconnect type', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.get('t-1')).toBe('disconnect')
			})

			test('should plan removal with delete type', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'delete')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.get('t-1')).toBe('delete')
			})

			test('should cancel planned connection when planning removal', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-1')
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedConnections.has('t-1')).toBe(false)
			})

			test('should clear createdEntities when planning removal', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')
				expect(store.getHasMany('Article', 'a-1', 'tags')?.createdEntities.has('t-new')).toBe(true)

				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-new', 'delete')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.createdEntities.has('t-new')).toBe(false)
			})

			test('should remove item from orderedIds when planning removal', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])
				// Force orderedIds by doing a move first
				store.moveInHasMany('Article', 'a-1', 'tags', 0, 2)
				expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags')).toEqual(['t-2', 't-3', 't-1'])

				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-3', 'delete')

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toEqual(['t-2', 't-1'])
			})
		})

		describe('cancelHasManyRemoval', () => {
			test('should cancel planned removal', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')
				store.cancelHasManyRemoval('Article', 'a-1', 'tags', 't-1')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.has('t-1')).toBe(false)
			})

			test('should cancel delete-type planned removal', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'delete')
				store.cancelHasManyRemoval('Article', 'a-1', 'tags', 't-1')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.has('t-1')).toBe(false)
			})
		})

		describe('planHasManyConnection', () => {
			test('should plan connection', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-new')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedConnections.has('t-new')).toBe(true)
			})

			test('should cancel planned disconnect when planning connection', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-1')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.has('t-1')).toBe(false)
			})

			test('should cancel planned delete when planning connection', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'delete')
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-1')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.has('t-1')).toBe(false)
				expect(state?.plannedConnections.has('t-1')).toBe(true)
			})
		})

		describe('addToHasMany', () => {
			test('should add item to planned connections', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedConnections.has('t-new')).toBe(true)
			})

			test('should track item in createdEntities', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.createdEntities.has('t-new')).toBe(true)
			})

			test('should add to orderedIds', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toContain('t-new')
			})
		})

		describe('removeFromHasMany', () => {
			test('should cancel connection for created entity', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')
				store.removeFromHasMany('Article', 'a-1', 'tags', 't-new', 'disconnect')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedConnections.has('t-new')).toBe(false)
				expect(state?.createdEntities.has('t-new')).toBe(false)
			})

			test('should plan disconnect for server entity', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.removeFromHasMany('Article', 'a-1', 'tags', 't-1', 'disconnect')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.get('t-1')).toBe('disconnect')
			})

			test('should plan delete for server entity when removalType is delete', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.removeFromHasMany('Article', 'a-1', 'tags', 't-1', 'delete')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.get('t-1')).toBe('delete')
			})

			test('should cancel connection for created entity even with delete removalType', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')
				store.removeFromHasMany('Article', 'a-1', 'tags', 't-new', 'delete')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				// Created entities should be cancelled, not planned for deletion
				expect(state?.plannedConnections.has('t-new')).toBe(false)
				expect(state?.createdEntities.has('t-new')).toBe(false)
				expect(state?.plannedRemovals.has('t-new')).toBe(false)
			})
		})

		describe('moveInHasMany', () => {
			test('should move item within list', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])
				store.moveInHasMany('Article', 'a-1', 'tags', 0, 2)

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toEqual(['t-2', 't-3', 't-1'])
			})

			test('should not move if indices are same', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])
				const versionBefore = store.getHasMany('Article', 'a-1', 'tags')?.version
				store.moveInHasMany('Article', 'a-1', 'tags', 0, 0)
				const versionAfter = store.getHasMany('Article', 'a-1', 'tags')?.version

				expect(versionAfter).toBe(versionBefore)
			})

			test('should not move if index out of bounds', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])
				const versionBefore = store.getHasMany('Article', 'a-1', 'tags')?.version
				store.moveInHasMany('Article', 'a-1', 'tags', 0, 10)
				const versionAfter = store.getHasMany('Article', 'a-1', 'tags')?.version

				expect(versionAfter).toBe(versionBefore)
			})
		})

		describe('commitHasMany', () => {
			test('should update server IDs and clear planned operations', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-2')
				store.commitHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.serverIds).toEqual(new Set(['t-1', 't-2']))
				expect(state?.plannedConnections.size).toBe(0)
			})
		})

		describe('resetHasMany', () => {
			test('should clear planned operations', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-2')
				store.resetHasMany('Article', 'a-1', 'tags')

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.size).toBe(0)
				expect(state?.plannedConnections.size).toBe(0)
				expect(state?.orderedIds).toBeNull()
			})
		})

		describe('getHasManyOrderedIds', () => {
			test('should return server IDs minus removals plus connections', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-3')

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toEqual(['t-2', 't-3'])
			})

			test('should exclude delete-type removals from ordered IDs', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-2', 'delete')

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toEqual(['t-1', 't-3'])
			})

			test('should exclude mixed disconnect and delete removals', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')
				store.planHasManyRemoval('Article', 'a-1', 'tags', 't-3', 'delete')

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toEqual(['t-2'])
			})
		})

		describe('isHasManyItemCreated', () => {
			test('should return true for created item', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags')
				store.addToHasMany('Article', 'a-1', 'tags', 't-new')

				expect(store.isHasManyItemCreated('Article', 'a-1', 'tags', 't-new')).toBe(true)
			})

			test('should return false for server item', () => {
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

				expect(store.isHasManyItemCreated('Article', 'a-1', 'tags', 't-1')).toBe(false)
			})
		})
	})

	// ==================== Has-One Relations ====================

	describe('Has-One Relations', () => {
		describe('getOrCreateRelation', () => {
			test('should create relation state with initial values', () => {
				const state = store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: 'auth-1',
					serverId: 'auth-1',
					state: 'connected',
					serverState: 'connected',
					placeholderData: {},
				})

				expect(state.currentId).toBe('auth-1')
				expect(state.state).toBe('connected')
			})
		})

		describe('setRelation', () => {
			test('should update relation state', () => {
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: null,
					serverId: null,
					state: 'disconnected',
					serverState: 'disconnected',
					placeholderData: {},
				})

				store.setRelation('Article', 'a-1', 'author', {
					currentId: 'auth-1',
					state: 'connected',
				})

				const state = store.getRelation('Article', 'a-1', 'author')
				expect(state?.currentId).toBe('auth-1')
				expect(state?.state).toBe('connected')
			})

			test('should initialize relation if not exists', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', author: { id: 'auth-1' } }, true)
				store.setRelation('Article', 'a-1', 'author', {
					currentId: 'auth-2',
					state: 'connected',
				})

				const state = store.getRelation('Article', 'a-1', 'author')
				expect(state?.currentId).toBe('auth-2')
				expect(state?.serverId).toBe('auth-1')
			})
		})

		describe('commitRelation', () => {
			test('should set server state equal to current state', () => {
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: 'auth-1',
					serverId: null,
					state: 'connected',
					serverState: 'disconnected',
					placeholderData: {},
				})

				store.commitRelation('Article', 'a-1', 'author')

				const state = store.getRelation('Article', 'a-1', 'author')
				expect(state?.serverId).toBe('auth-1')
				expect(state?.serverState).toBe('connected')
			})

			test('should clear placeholder data', () => {
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: null,
					serverId: null,
					state: 'disconnected',
					serverState: 'disconnected',
					placeholderData: { name: 'New Author' },
				})

				store.commitRelation('Article', 'a-1', 'author')

				const state = store.getRelation('Article', 'a-1', 'author')
				expect(Object.keys(state?.placeholderData ?? {}).length).toBe(0)
			})
		})

		describe('resetRelation', () => {
			test('should reset to server state', () => {
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: 'auth-2',
					serverId: 'auth-1',
					state: 'connected',
					serverState: 'connected',
					placeholderData: {},
				})

				store.resetRelation('Article', 'a-1', 'author')

				const state = store.getRelation('Article', 'a-1', 'author')
				expect(state?.currentId).toBe('auth-1')
			})
		})
	})

	// ==================== Error State ====================

	describe('Error State', () => {
		describe('Field Errors', () => {
			test('should add field error', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', {
					message: 'Title is required',
					source: 'client',
				})

				const errors = store.getFieldErrors('Article', 'a-1', 'title')
				expect(errors.length).toBe(1)
				expect(errors[0]?.message).toBe('Title is required')
			})

			test('should clear field errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })
				store.clearFieldErrors('Article', 'a-1', 'title')

				expect(store.getFieldErrors('Article', 'a-1', 'title').length).toBe(0)
			})

			test('should clear errors by source', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Client error', source: 'client' })
				store.addFieldError('Article', 'a-1', 'title', createServerError('Server error'))

				store.clearFieldErrors('Article', 'a-1', 'title', 'client')

				const errors = store.getFieldErrors('Article', 'a-1', 'title')
				expect(errors.length).toBe(1)
				expect(errors[0]?.source).toBe('server')
			})

			test('should clear non-sticky errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Non-sticky', source: 'client' })
				store.addFieldError('Article', 'a-1', 'title', { message: 'Sticky', source: 'client', sticky: true })

				store.clearNonStickyFieldErrors('Article', 'a-1', 'title')

				const errors = store.getFieldErrors('Article', 'a-1', 'title')
				expect(errors.length).toBe(1)
				expect(errors[0]?.message).toBe('Sticky')
			})
		})

		describe('Entity Errors', () => {
			test('should add entity error', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addEntityError('Article', 'a-1', { message: 'Entity error', source: 'client' })

				const errors = store.getEntityErrors('Article', 'a-1')
				expect(errors.length).toBe(1)
			})

			test('should clear entity errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addEntityError('Article', 'a-1', { message: 'Error', source: 'client' })
				store.clearEntityErrors('Article', 'a-1')

				expect(store.getEntityErrors('Article', 'a-1').length).toBe(0)
			})
		})

		describe('Relation Errors', () => {
			test('should add relation error', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addRelationError('Article', 'a-1', 'author', { message: 'Relation error', source: 'client' })

				const errors = store.getRelationErrors('Article', 'a-1', 'author')
				expect(errors.length).toBe(1)
			})

			test('should clear relation errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addRelationError('Article', 'a-1', 'author', { message: 'Error', source: 'client' })
				store.clearRelationErrors('Article', 'a-1', 'author')

				expect(store.getRelationErrors('Article', 'a-1', 'author').length).toBe(0)
			})
		})

		describe('Error Queries', () => {
			test('hasClientErrors should return true when client errors exist', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })

				expect(store.hasClientErrors('Article', 'a-1')).toBe(true)
			})

			test('hasClientErrors should return false for server errors only', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', createServerError('Error'))

				expect(store.hasClientErrors('Article', 'a-1')).toBe(false)
			})

			test('hasAnyErrors should return true for any error', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', createServerError('Error'))

				expect(store.hasAnyErrors('Article', 'a-1')).toBe(true)
			})

			test('clearAllServerErrors should clear server errors only', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Client', source: 'client' })
				store.addFieldError('Article', 'a-1', 'title', createServerError('Server'))
				store.addEntityError('Article', 'a-1', createServerError('Server Entity'))

				store.clearAllServerErrors('Article', 'a-1')

				expect(store.getFieldErrors('Article', 'a-1', 'title').length).toBe(1)
				expect(store.getEntityErrors('Article', 'a-1').length).toBe(0)
			})

			test('clearAllErrors should clear all errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })
				store.addEntityError('Article', 'a-1', createServerError('Error'))
				store.addRelationError('Article', 'a-1', 'author', { message: 'Error', source: 'client' })

				store.clearAllErrors('Article', 'a-1')

				expect(store.hasAnyErrors('Article', 'a-1')).toBe(false)
			})
		})
	})

	// ==================== Touched State ====================

	describe('Touched State', () => {
		test('should set field as touched', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setFieldTouched('Article', 'a-1', 'title', true)

			expect(store.isFieldTouched('Article', 'a-1', 'title')).toBe(true)
		})

		test('should return false for non-touched field', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

			expect(store.isFieldTouched('Article', 'a-1', 'title')).toBe(false)
		})

		test('should clear touched state for entity', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setFieldTouched('Article', 'a-1', 'title', true)
			store.setFieldTouched('Article', 'a-1', 'content', true)
			store.clearEntityTouchedState('Article', 'a-1')

			expect(store.isFieldTouched('Article', 'a-1', 'title')).toBe(false)
			expect(store.isFieldTouched('Article', 'a-1', 'content')).toBe(false)
		})
	})

	// ==================== Persisting State ====================

	describe('Persisting State', () => {
		test('should set persisting state', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setPersisting('Article', 'a-1', true)

			expect(store.isPersisting('Article', 'a-1')).toBe(true)
		})

		test('should clear persisting state', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setPersisting('Article', 'a-1', true)
			store.setPersisting('Article', 'a-1', false)

			expect(store.isPersisting('Article', 'a-1')).toBe(false)
		})
	})

	// ==================== Subscriptions ====================

	describe('Subscriptions', () => {
		describe('Entity Subscriptions', () => {
			test('should notify entity subscribers on data change', () => {
				const subscriber = createMockSubscriber()
				store.subscribeToEntity('Article', 'a-1', subscriber.fn)

				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				expect(subscriber.callCount()).toBe(1)
			})

			test('should unsubscribe correctly', () => {
				const subscriber = createMockSubscriber()
				const unsubscribe = store.subscribeToEntity('Article', 'a-1', subscriber.fn)

				unsubscribe()
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				expect(subscriber.callCount()).toBe(0)
			})
		})

		describe('Relation Subscriptions', () => {
			test('should notify relation subscribers', () => {
				const subscriber = createMockSubscriber()
				store.subscribeToRelation('Article', 'a-1', 'author', subscriber.fn)

				store.setHasManyServerIds('Article', 'a-1', 'author', ['auth-1'])

				expect(subscriber.callCount()).toBe(1)
			})
		})

		describe('Global Subscriptions', () => {
			test('should notify global subscribers on any change', () => {
				const subscriber = createMockSubscriber()
				store.subscribe(subscriber.fn)

				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'John' }, true)

				expect(subscriber.callCount()).toBe(2)
			})

			test('should notify global subscribers on clear', () => {
				const subscriber = createMockSubscriber()
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.subscribe(subscriber.fn)

				store.clear()

				expect(subscriber.callCount()).toBe(1)
			})
		})

		describe('Version tracking', () => {
			test('should increment global version on changes', () => {
				const v1 = store.getVersion()
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				const v2 = store.getVersion()

				expect(v2).toBeGreaterThan(v1)
			})

			test('notify should increment global version', () => {
				const v1 = store.getVersion()
				store.notify()
				const v2 = store.getVersion()

				expect(v2).toBe(v1 + 1)
			})
		})
	})

	// ==================== Dirty Tracking ====================

	describe('Dirty Tracking', () => {
		describe('getAllDirtyEntities', () => {
			test('should return entities with field changes', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

				const dirty = store.getAllDirtyEntities()
				expect(dirty).toContainEqual({
					entityType: 'Article',
					entityId: 'a-1',
					changeType: 'update',
				})
			})

			test('should return new entities', () => {
				const tempId = store.createEntity('Article', { title: 'New' })

				const dirty = store.getAllDirtyEntities()
				expect(dirty).toContainEqual({
					entityType: 'Article',
					entityId: tempId,
					changeType: 'create',
				})
			})

			test('should return entities scheduled for deletion', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.scheduleForDeletion('Article', 'a-1')

				const dirty = store.getAllDirtyEntities()
				expect(dirty).toContainEqual({
					entityType: 'Article',
					entityId: 'a-1',
					changeType: 'delete',
				})
			})

			test('should not include clean entities', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				const dirty = store.getAllDirtyEntities()
				expect(dirty.length).toBe(0)
			})
		})

		describe('getDirtyFields', () => {
			test('should return changed fields', () => {
				store.setEntityData('Article', 'a-1', {
					id: 'a-1',
					title: 'Original',
					content: 'Content',
				}, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

				const dirtyFields = store.getDirtyFields('Article', 'a-1')
				expect(dirtyFields).toContain('title')
				expect(dirtyFields).not.toContain('content')
			})

			test('should not include id field', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				const dirtyFields = store.getDirtyFields('Article', 'a-1')
				expect(dirtyFields).not.toContain('id')
			})
		})

		describe('getDirtyRelations', () => {
			test('should return dirty hasOne relations', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: 'auth-2',
					serverId: 'auth-1',
					state: 'connected',
					serverState: 'connected',
					placeholderData: {},
				})

				const dirtyRelations = store.getDirtyRelations('Article', 'a-1')
				expect(dirtyRelations).toContain('author')
			})

			test('should return dirty hasMany relations', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
				store.planHasManyConnection('Article', 'a-1', 'tags', 't-2')

				const dirtyRelations = store.getDirtyRelations('Article', 'a-1')
				expect(dirtyRelations).toContain('tags')
			})
		})

		describe('commitFields', () => {
			test('should commit only specified fields', () => {
				store.setEntityData('Article', 'a-1', {
					id: 'a-1',
					title: 'Original',
					content: 'Original',
				}, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
				store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')

				store.commitFields('Article', 'a-1', ['title'])

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.serverData).toHaveProperty('title', 'Updated Title')
				expect(snapshot?.serverData).toHaveProperty('content', 'Original')
			})
		})
	})

	// ==================== Parent-Child Relationships ====================

	describe('Parent-Child Relationships', () => {
		test('should propagate changes to parent on child change', () => {
			const subscriber = createMockSubscriber()

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'John' }, true)
			store.registerParentChild('Article', 'a-1', 'Author', 'auth-1')
			store.subscribeToEntity('Article', 'a-1', subscriber.fn)

			store.setFieldValue('Author', 'auth-1', ['name'], 'Jane')

			expect(subscriber.callCount()).toBeGreaterThan(0)
		})

		test('should unregister parent-child relationship', () => {
			const subscriber = createMockSubscriber()

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'John' }, true)
			store.registerParentChild('Article', 'a-1', 'Author', 'auth-1')
			store.unregisterParentChild('Article', 'a-1', 'Author', 'auth-1')
			store.subscribeToEntity('Article', 'a-1', subscriber.fn)

			store.setFieldValue('Author', 'auth-1', ['name'], 'Jane')

			// Parent should not be notified after unregistering
			expect(subscriber.callCount()).toBe(0)
		})
	})

	// ==================== Partial Snapshot Export/Import ====================

	describe('Partial Snapshot Export/Import', () => {
		test('should export partial snapshot', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'John' }, true)

			const snapshot = store.exportPartialSnapshot({
				entityKeys: ['Article:a-1'],
				relationKeys: [],
				hasManyKeys: [],
			})

			expect(snapshot.entitySnapshots.has('Article:a-1')).toBe(true)
			expect(snapshot.entitySnapshots.has('Author:auth-1')).toBe(false)
		})

		test('should import partial snapshot', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			const partialSnapshot = {
				entitySnapshots: new Map([
					['Article:a-1', {
						id: 'a-1',
						entityType: 'Article',
						data: { id: 'a-1', title: 'Restored' },
						serverData: { id: 'a-1', title: 'Restored' },
						version: 10,
					}],
				]),
				relationStates: new Map(),
				hasManyStates: new Map(),
				entityMetas: new Map(),
			}

			store.importPartialSnapshot(partialSnapshot)

			const current = store.getEntitySnapshot('Article', 'a-1')
			expect(current?.data).toHaveProperty('title', 'Restored')
		})
	})

	// ==================== Utility ====================

	describe('Utility', () => {
		describe('clear', () => {
			test('should clear all data from store', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.setLoadState('Article', 'a-1', 'success')
				store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

				store.clear()

				expect(store.hasEntity('Article', 'a-1')).toBe(false)
				expect(store.getLoadState('Article', 'a-1')).toBeUndefined()
				expect(store.getFieldErrors('Article', 'a-1', 'title').length).toBe(0)
				expect(store.getHasMany('Article', 'a-1', 'tags')).toBeUndefined()
			})
		})
	})
})
