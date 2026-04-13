import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	EntityHandle,
	SchemaRegistry,
	createLoadError,
	type SchemaDefinition,
	type EntityAccessor,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

// Test schema definition
interface TestArticle {
	id: string
	title: string
	content?: string
	author?: { id: string; name: string } | null
	tags?: Array<{ id: string; name: string }>
}

interface TestAuthor {
	id: string
	name: string
	email?: string
}

interface TestTag {
	id: string
	name: string
}

interface TestSchema {
	Article: TestArticle
	Author: TestAuthor
	Tag: TestTag
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				content: { type: 'scalar' },
				author: { type: 'hasOne', target: 'Author' },
				tags: { type: 'hasMany', target: 'Tag' },
			},
		},
		Author: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
				email: { type: 'scalar' },
			},
		},
		Tag: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
			},
		},
	},
}

describe('EntityHandle', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let eventEmitter: EventEmitter
	let schema: SchemaRegistry<TestSchema>

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		eventEmitter = setup.eventEmitter
		schema = new SchemaRegistry(testSchemaDefinition)
	})

	function createEntityHandle(id: string = 'a-1'): EntityAccessor<TestArticle> {
		return EntityHandle.create<TestArticle>(id, 'Article', store, dispatcher, schema)
	}

	function createEntityHandleRaw(id: string = 'a-1'): EntityHandle<TestArticle> {
		return EntityHandle.createRaw<TestArticle>(id, 'Article', store, dispatcher, schema)
	}

	// ==================== Identity ====================

	describe('Identity', () => {
		test('should return entity ID', () => {
			const handle = createEntityHandle('a-1')
			expect(handle.id as string).toBe('a-1')
		})

		test('should return stable temp ID even after persisted ID mapping', () => {
			const tempId = store.createEntity('Article', { title: 'New' })
			store.mapTempIdToPersistedId('Article', tempId, 'real-id-456')

			const handle = EntityHandle.create<TestArticle>(tempId, 'Article', store, dispatcher, schema)

			// id is always the stable original ID (temp ID in this case)
			expect(handle.id as string).toBe(tempId)
		})

		test('should return persisted ID via $resolvedId after temp ID mapping', () => {
			const tempId = store.createEntity('Article', { title: 'New' })
			store.mapTempIdToPersistedId('Article', tempId, 'real-id-456')

			const handle = EntityHandle.create<TestArticle>(tempId, 'Article', store, dispatcher, schema)

			expect(handle.$resolvedId as string).toBe('real-id-456')
		})

		test('should return original ID via $resolvedId when no persisted mapping', () => {
			const handle = createEntityHandle('a-1')

			expect(handle.$resolvedId as string).toBe('a-1')
		})

		test('should return entity type', () => {
			const handle = createEntityHandleRaw('a-1')
			expect(handle.__entityName).toBe('Article')
		})
	})

	// ==================== Data Access ====================

	describe('Data Access', () => {
		test('should return entity data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test Article' }, true)
			const handle = createEntityHandle()

			expect(handle.$data).toEqual({ id: 'a-1', title: 'Test Article' })
		})

		test('should return null when entity not loaded', () => {
			const handle = createEntityHandle()
			expect(handle.$data).toBeNull()
		})

		test('should return server data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createEntityHandleRaw()

			expect(handle.serverData).toEqual({ id: 'a-1', title: 'Original' })
		})

		test('should return snapshot', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandleRaw()

			const snapshot = handle.getSnapshot()
			expect(snapshot).toBeDefined()
			expect(snapshot?.id).toBe('a-1')
		})
	})

	// ==================== Load State ====================

	describe('Load State', () => {
		test('should check if entity is loaded', () => {
			const handle = createEntityHandleRaw()
			expect(handle.isLoaded).toBe(false)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			expect(handle.isLoaded).toBe(true)
		})

		test('should check if entity is loading', () => {
			store.setLoadState('Article', 'a-1', 'loading')
			const handle = createEntityHandleRaw()

			expect(handle.isLoading).toBe(true)
		})

		test('should check if entity has error', () => {
			store.setLoadState('Article', 'a-1', 'error', createLoadError(new Error('Network error')))
			const handle = createEntityHandleRaw()

			expect(handle.isError).toBe(true)
			expect(handle.error?.message).toBe('Network error')
		})
	})

	// ==================== Dirty State ====================

	describe('Dirty State', () => {
		test('should return false when entity matches server data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			expect(handle.$isDirty).toBe(false)
		})

		test('should return true when field is modified', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createEntityHandle()

			expect(handle.$isDirty).toBe(true)
		})

		test('should return false when not loaded', () => {
			const handle = createEntityHandle()
			expect(handle.$isDirty).toBe(false)
		})

		test('should get list of dirty fields', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original', content: 'Content' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createEntityHandleRaw()

			expect(handle.getDirtyFields()).toContain('title')
			expect(handle.getDirtyFields()).not.toContain('content')
		})
	})

	// ==================== Persisting State ====================

	describe('Persisting State', () => {
		test('should check if entity is persisting', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			expect(handle.$isPersisting).toBe(false)

			store.setPersisting('Article', 'a-1', true)
			expect(handle.$isPersisting).toBe(true)
		})
	})

	// ==================== New Entity ====================

	describe('New Entity', () => {
		test('should detect new entity', () => {
			const tempId = store.createEntity('Article', { title: 'New' })
			const handle = EntityHandle.create<TestArticle>(tempId, 'Article', store, dispatcher, schema)

			expect(handle.$isNew).toBe(true)
		})

		test('should detect existing entity', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			expect(handle.$isNew).toBe(false)
		})

		test('should return persisted ID', () => {
			const tempId = store.createEntity('Article', { title: 'New' })
			store.mapTempIdToPersistedId('Article', tempId, 'real-id-123')

			const handle = EntityHandle.create<TestArticle>(tempId, 'Article', store, dispatcher, schema)

			expect(handle.$persistedId).toBe('real-id-123')
		})

		test('should return ID itself for non-temp ID', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			expect(handle.$persistedId).toBe('a-1')
		})
	})

	// ==================== Field Access ====================

	describe('Field Access', () => {
		test('should get field handle via field()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandleRaw()

			const titleField = handle.field('title')
			expect(titleField.value).toBe('Test')
		})

		test('should cache field handles', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandleRaw()

			const field1 = handle.field('title')
			const field2 = handle.field('title')

			expect(field1).toBe(field2)
		})

		test('should access field via fields proxy', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			expect(handle.$fields.title.value).toBe('Test')
		})
	})

	// ==================== Relation Access ====================

	describe('Relation Access', () => {
		test('should get hasOne handle', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', author: { id: 'auth-1', name: 'John' } }, true)
			const handle = createEntityHandleRaw()

			const authorHandle = handle.hasOne('author')
			expect(authorHandle).toBeDefined()
		})

		test('should cache hasOne handles', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandleRaw()

			const handle1 = handle.hasOne('author')
			const handle2 = handle.hasOne('author')

			expect(handle1).toBe(handle2)
		})

		test('should get hasMany handle', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			const handle = createEntityHandleRaw()

			const tagsHandle = handle.hasMany('tags')
			expect(tagsHandle).toBeDefined()
		})

		test('should throw for non-existent relation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandleRaw()

			expect(() => handle.hasOne('nonExistent')).toThrow()
		})
	})

	// ==================== Reset and Commit ====================

	describe('Reset and Commit', () => {
		test('should reset entity to server data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createEntityHandleRaw()
			handle.reset()

			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Original')
		})

		test('should commit entity changes', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createEntityHandleRaw()
			handle.commit()

			expect(store.getEntitySnapshot('Article', 'a-1')?.serverData).toHaveProperty('title', 'Modified')
		})
	})

	// ==================== Errors ====================

	describe('Errors', () => {
		test('should return entity errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addEntityError('Article', 'a-1', { message: 'Entity error', source: 'client' })

			const handle = createEntityHandle()

			expect(handle.$errors.length).toBe(1)
			expect(handle.$errors[0]?.message).toBe('Entity error')
		})

		test('should check if entity has any errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			expect(handle.$hasError).toBe(false)

			store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })
			expect(handle.$hasError).toBe(true)
		})

		test('should add error via addError()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandle()

			handle.$addError({ message: 'Custom entity error' })

			expect(store.getEntityErrors('Article', 'a-1').length).toBe(1)
		})

		test('should clear entity errors via clearErrors()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addEntityError('Article', 'a-1', { message: 'Error', source: 'client' })

			const handle = createEntityHandle()
			handle.$clearErrors()

			expect(store.getEntityErrors('Article', 'a-1').length).toBe(0)
		})

		test('should clear all errors via clearAllErrors()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addEntityError('Article', 'a-1', { message: 'Entity error', source: 'client' })
			store.addFieldError('Article', 'a-1', 'title', { message: 'Field error', source: 'client' })

			const handle = createEntityHandle()
			handle.$clearAllErrors()

			expect(store.hasAnyErrors('Article', 'a-1')).toBe(false)
		})
	})

	// ==================== Event Subscriptions ====================

	describe('Event Subscriptions', () => {
		test('should subscribe to events on entity', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createEntityHandle()

			const listener = mock(() => {})
			handle.$on('field:changed', listener)

			handle.$fields.title.setValue('Updated')

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('should intercept events on entity', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createEntityHandle()

			handle.$intercept('field:changing', () => ({ action: 'cancel' as const }))

			const result = await dispatcher.dispatchAsync({
				type: 'SET_FIELD',
				entityType: 'Article',
				entityId: 'a-1',
				fieldPath: ['title'],
				value: 'Updated',
			})

			expect(result).toBe(false)
			expect(handle.$fields.title.value).toBe('Original')
		})
	})

	// ==================== Type Brands ====================

	describe('Type Brands', () => {
		test('should return entity type name via __entityName', () => {
			const handle = createEntityHandleRaw()
			expect(handle.__entityName).toBe('Article')
		})

	})

	// ==================== Dispose ====================

	describe('Dispose', () => {
		test('should dispose handle and clear caches', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createEntityHandleRaw()

			// Access some fields to populate cache
			handle.field('title')
			handle.hasOne('author')

			handle.dispose()

			// After dispose, handle should throw on operations
			expect(() => handle.reset()).toThrow()
		})
	})
})
