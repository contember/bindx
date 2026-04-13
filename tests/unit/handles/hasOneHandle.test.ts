import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	HasOneHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type HasOneAccessor,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

// Test schema
interface TestArticle {
	id: string
	title: string
	author?: { id: string; name: string } | null
}

interface TestAuthor {
	id: string
	name: string
	email?: string
}

interface TestCategory {
	id: string
	label: string
}

interface TestSchema {
	Article: TestArticle
	Author: TestAuthor
	Category: TestCategory
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				author: { type: 'hasOne', target: 'Author', nullable: true },
				category: { type: 'hasOne', target: 'Category', nullable: false },
			},
		},
		Author: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
				email: { type: 'scalar' },
			},
		},
		Category: {
			fields: {
				id: { type: 'scalar' },
				label: { type: 'scalar' },
			},
		},
	},
}

describe('HasOneHandle', () => {
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

	function createHasOneHandle(): HasOneAccessor<TestAuthor> {
		return HasOneHandle.create<TestAuthor>(
			'Article',
			'a-1',
			'author',
			'Author',
			store,
			dispatcher,
			schema,
		)
	}

	function createHasOneHandleRaw(): HasOneHandle<TestAuthor> {
		return HasOneHandle.createRaw<TestAuthor>(
			'Article',
			'a-1',
			'author',
			'Author',
			store,
			dispatcher,
			schema,
		)
	}

	// ==================== State Detection ====================

	describe('State Detection', () => {
		test('should return disconnected state when no relation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			expect(handle.$state).toBe('disconnected')
		})

		test('should return connected state when relation exists', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', author: { id: 'auth-1', name: 'John' } }, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})
			const handle = createHasOneHandle()

			expect(handle.$state).toBe('connected')
		})

		test('should return deleted state when marked for deletion', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', author: { id: 'auth-1', name: 'John' } }, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'deleted',
				serverState: 'connected',
				placeholderData: {},
			})
			const handle = createHasOneHandle()

			expect(handle.$state).toBe('deleted')
		})
	})

	// ==================== Related ID ====================

	describe('Related ID', () => {
		test('should return related ID from relation state', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})
			const handle = createHasOneHandleRaw()

			expect(handle.relatedId).toBe('auth-1')
		})

		test('should return related ID from embedded data when no relation state', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			const handle = createHasOneHandleRaw()

			expect(handle.relatedId).toBe('auth-1')
		})

		test('should return null when no relation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandleRaw()

			expect(handle.relatedId).toBeNull()
		})
	})

	// ==================== Entity Accessor ====================

	describe('Entity Accessor', () => {
		test('should return entity accessor for connected relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()
			const entity = handle.$entity

			expect(entity.id as string).toBe('auth-1')
		})

		test('should return placeholder handle for disconnected relation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			const entity = handle.$entity

			// Placeholder should have a placeholder ID
			expect(entity.id).toMatch(/^__placeholder_/)
		})

		test('should cache entity handle', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()
			const entity1 = handle.$entity
			const entity2 = handle.$entity

			expect(entity1).toBe(entity2)
		})
	})

	// ==================== Fields Access ====================

	describe('Fields Access', () => {
		test('should access fields via fields proxy', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})
			store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'John' }, true)

			const handle = createHasOneHandle()

			expect(handle.$fields.name.value).toBe('John')
		})
	})

	// ==================== Dirty State ====================

	describe('Dirty State', () => {
		test('should return false when relation matches server state', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const handle = createHasOneHandle()

			expect(handle.$isDirty).toBe(false)
		})

		test('should return true when connected to different entity', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-2',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const handle = createHasOneHandle()

			expect(handle.$isDirty).toBe(true)
		})

		test('should return true when has placeholder data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: null,
				serverId: null,
				state: 'disconnected',
				serverState: 'disconnected',
				placeholderData: { name: 'Draft Author' },
			})

			const handle = createHasOneHandle()

			expect(handle.$isDirty).toBe(true)
		})
	})

	// ==================== Connect / Disconnect / Delete ====================

	describe('Connect / Disconnect / Delete', () => {
		test('should connect to entity', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			handle.$connect('auth-new')

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe('auth-new')
			expect(relation?.state).toBe('connected')
		})

		test('should disconnect relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()
			handle.$disconnect()

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBeNull()
			expect(relation?.state).toBe('disconnected')
		})

		test('should mark relation for deletion', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()
			handle.$delete()

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.state).toBe('deleted')
		})
	})

	// ==================== Remove (auto-detect) ====================

	describe('Remove (auto-detect)', () => {
		test('should disconnect when FK is nullable', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()
			handle.$remove()

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBeNull()
			expect(relation?.state).toBe('disconnected')
		})

		test('should delete when FK is non-nullable', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				category: { id: 'cat-1', label: 'Tech' },
			}, true)
			store.setRelation('Article', 'a-1', 'category', {
				currentId: 'cat-1',
				state: 'connected',
			})

			const handle = HasOneHandle.create<TestCategory>(
				'Article',
				'a-1',
				'category',
				'Category',
				store,
				dispatcher,
				schema,
			)
			handle.$remove()

			const relation = store.getRelation('Article', 'a-1', 'category')
			expect(relation?.state).toBe('deleted')
		})

		test('should disconnect when nullable is unknown (safe fallback)', () => {
			const minimalSchema = new SchemaRegistry<TestSchema>({
				entities: {
					Article: {
						fields: {
							id: { type: 'scalar' },
							title: { type: 'scalar' },
							author: { type: 'hasOne', target: 'Author' }, // no nullable
						},
					},
					Author: {
						fields: {
							id: { type: 'scalar' },
							name: { type: 'scalar' },
						},
					},
					Category: {
						fields: {
							id: { type: 'scalar' },
							label: { type: 'scalar' },
						},
					},
				},
			})

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = HasOneHandle.create<TestAuthor>(
				'Article',
				'a-1',
				'author',
				'Author',
				store,
				dispatcher,
				minimalSchema,
			)
			handle.$remove()

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBeNull()
			expect(relation?.state).toBe('disconnected')
		})
	})

	// ==================== Reset ====================

	describe('Reset', () => {
		test('should reset to server state', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-2',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const handle = createHasOneHandle()
			handle.$reset()

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe('auth-1')
		})
	})

	// ==================== Errors ====================

	describe('Errors', () => {
		test('should return relation errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addRelationError('Article', 'a-1', 'author', { message: 'Required', source: 'client' })

			const handle = createHasOneHandle()

			expect(handle.$errors.length).toBe(1)
			expect(handle.$errors[0]?.message).toBe('Required')
		})

		test('should check if relation has errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			expect(handle.$hasError).toBe(false)

			store.addRelationError('Article', 'a-1', 'author', { message: 'Error', source: 'client' })
			expect(handle.$hasError).toBe(true)
		})

		test('should add error via addError()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			handle.$addError({ message: 'Author is required' })

			expect(store.getRelationErrors('Article', 'a-1', 'author').length).toBe(1)
		})

		test('should clear errors via clearErrors()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addRelationError('Article', 'a-1', 'author', { message: 'Error', source: 'client' })

			const handle = createHasOneHandle()
			handle.$clearErrors()

			expect(store.getRelationErrors('Article', 'a-1', 'author').length).toBe(0)
		})
	})

	// ==================== Event Subscriptions ====================

	describe('Event Subscriptions', () => {
		test('should subscribe to connect events', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			const listener = mock(() => {})
			handle.$onConnect(listener)

			// Simulate connect action with event emission
			dispatcher.dispatch({
				type: 'CONNECT_RELATION',
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'author',
				targetId: 'auth-1',
				targetType: 'Author',
			})

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('should subscribe to disconnect events', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()

			const listener = mock(() => {})
			handle.$onDisconnect(listener)

			dispatcher.dispatch({
				type: 'DISCONNECT_RELATION',
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'author',
			})

			expect(listener).toHaveBeenCalledTimes(1)
		})
	})

	// ==================== $create ====================

	describe('$create', () => {
		test('should create entity and connect relation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			const tempId = handle.$create({ name: 'New Author' })

			// Should return a temp ID
			expect(tempId).toMatch(/^__temp_/)

			// Relation should be connected to the new entity
			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe(tempId)
			expect(relation?.state).toBe('connected')

			// Entity should exist in the store
			const snapshot = store.getEntitySnapshot('Author', tempId)
			expect(snapshot).not.toBeUndefined()
			expect((snapshot!.data as Record<string, unknown>)['name']).toBe('New Author')
		})

		test('should create entity without initial data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			const tempId = handle.$create()

			expect(tempId).toMatch(/^__temp_/)

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe(tempId)
			expect(relation?.state).toBe('connected')

			const snapshot = store.getEntitySnapshot('Author', tempId)
			expect(snapshot).not.toBeUndefined()
		})

		test('created entity data should be accessible via the hasOne handle', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			handle.$create({ name: 'Jane Doe', email: 'jane@example.com' })

			// Access via $entity
			expect(handle.$entity.$data).not.toBeNull()
			expect((handle.$entity.$data as TestAuthor).name).toBe('Jane Doe')
		})

		test('should replace existing connection when called on already-connected relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'Old Author' },
			}, true)
			store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'Old Author' }, true)
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				state: 'connected',
			})

			const handle = createHasOneHandle()
			const tempId = handle.$create({ name: 'New Author' })

			// Relation should now point to the new entity
			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe(tempId)
			expect(relation?.currentId).not.toBe('auth-1')
		})

		test('should register parent-child relationship for change propagation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			const callback = mock(() => {})
			store.subscribeToEntity('Article', 'a-1', callback)
			callback.mockClear()

			const tempId = handle.$create({ name: 'Author' })

			// Clear calls from $create
			callback.mockClear()

			// Modifying the child should propagate to parent subscriber
			store.setFieldValue('Author', tempId, ['name'], 'Updated')

			expect(callback).toHaveBeenCalled()
		})

		test('should mark created entity as new (not exists on server)', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandle()

			const tempId = handle.$create({ name: 'Author' })

			expect(store.existsOnServer('Author', tempId)).toBe(false)
			expect(store.isNewEntity('Author', tempId)).toBe(true)
		})
	})

	// ==================== Type Brands ====================

	describe('Type Brands', () => {
		test('should return target entity name via __entityName', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createHasOneHandleRaw()

			expect(handle.__entityName).toBe('Author')
		})
	})
})
