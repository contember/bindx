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

	// ==================== Eager Materialization (PR 6) ====================
	//
	// RelationStore is the single source of truth for has-one: reading relatedId/
	// state materializes the entry from embedded snapshot data, and there is no
	// longer a snapshot fallback in the getters.

	describe('Eager materialization', () => {
		test('a loaded has-one materializes a RelationStore entry and is not dirty', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			// No explicit setRelation — the entry only lives in embedded snapshot data.
			expect(store.getRelation('Article', 'a-1', 'author')).toBeUndefined()

			const handle = createHasOneHandleRaw()

			// Reading state materializes the entry.
			expect(handle.state).toBe('connected')
			expect(handle.relatedId).toBe('auth-1')

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation).toBeDefined()
			expect(relation!.currentId).toBe('auth-1')
			expect(relation!.serverId).toBe('auth-1')
			expect(relation!.state).toBe('connected')
			expect(relation!.serverState).toBe('connected')

			// A freshly materialized loaded relation must NOT be dirty.
			expect(handle.isDirty).toBe(false)
		})

		test('relatedId reads purely from RelationStore (no snapshot fallback)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			const handle = createHasOneHandleRaw()

			// First read materializes the entry.
			expect(handle.relatedId).toBe('auth-1')

			// Disconnect at the relation level only — the parent's embedded data is
			// left untouched (still { id: 'auth-1', ... }). A snapshot fallback would
			// resurrect 'auth-1'; reading purely from the store must report null.
			store.setRelation('Article', 'a-1', 'author', { currentId: null, state: 'disconnected' })

			const embedded = (store.getEntitySnapshot('Article', 'a-1')!.data as Record<string, unknown>)['author']
			expect(embedded).toEqual({ id: 'auth-1', name: 'John' })

			const handle2 = createHasOneHandleRaw()
			expect(handle2.relatedId).toBeNull()
			expect(handle2.state).toBe('disconnected')
		})

		test('disconnected (no embedded data, no entry) leaves the relation unmaterialized', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBeNull()
			expect(handle.state).toBe('disconnected')

			// No spurious entry created for an empty relation.
			expect(store.getRelation('Article', 'a-1', 'author')).toBeUndefined()
		})

		test('materialization does not clobber a local connect', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			// Local connect to a different author than the embedded one.
			store.setRelation('Article', 'a-1', 'author', { currentId: 'auth-2', state: 'connected' })

			const handle = createHasOneHandleRaw()

			// The local connect survives — embedded 'auth-1' must not win.
			expect(handle.relatedId).toBe('auth-2')
			expect(handle.isDirty).toBe(true)
		})
	})

	// ==================== Server-baseline advance on re-fetch ====================
	//
	// On a parent re-fetch whose embedded related id changed, a non-dirty has-one
	// must advance its server baseline to the new id (and stay clean), while a
	// locally-dirty relation must survive the re-fetch. The advance runs during a
	// render-phase read and must NOT notify subscribers (the re-fetch already did).

	describe('Server-baseline advance on re-fetch', () => {
		test('a re-fetch that changes the related id advances the baseline and stays clean', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe('auth-1')
			expect(handle.isDirty).toBe(false)

			// Parent re-fetched: a NEW embedded author reference with a different id.
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-2', name: 'Jane' },
			}, true)

			// Reading advances the server baseline to the new related id; still clean.
			expect(handle.relatedId).toBe('auth-2')
			expect(handle.isDirty).toBe(false)

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe('auth-2')
			expect(relation?.serverId).toBe('auth-2')
			expect(relation?.state).toBe('connected')
			expect(relation?.serverState).toBe('connected')
		})

		test('a re-fetch with explicit null advances a clean relation to disconnected', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe('auth-1')
			expect(handle.isDirty).toBe(false)

			store.refreshServerData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: null,
			})

			expect(handle.relatedId).toBeNull()
			expect(handle.state).toBe('disconnected')
			expect(handle.isDirty).toBe(false)

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBeNull()
			expect(relation?.serverId).toBeNull()
			expect(relation?.state).toBe('disconnected')
			expect(relation?.serverState).toBe('disconnected')
		})

		test('a locally-connected relation survives a re-fetch that changes the embedded id', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe('auth-1')

			// Local connect to a different author → dirty.
			store.setRelation('Article', 'a-1', 'author', { currentId: 'auth-2', state: 'connected' })
			expect(handle.relatedId).toBe('auth-2')
			expect(handle.isDirty).toBe(true)

			// Parent re-fetched at yet another author — the local dirty connect wins.
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-3', name: 'Bob' },
			}, true)

			expect(handle.relatedId).toBe('auth-2')
			expect(handle.isDirty).toBe(true)
		})

		test('a locally-connected relation survives an explicit null re-fetch', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe('auth-1')

			store.setRelation('Article', 'a-1', 'author', { currentId: 'auth-2', state: 'connected' })
			expect(handle.relatedId).toBe('auth-2')
			expect(handle.isDirty).toBe(true)

			store.refreshServerData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: null,
			})

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(handle.relatedId).toBe('auth-2')
			expect(handle.state).toBe('connected')
			expect(handle.isDirty).toBe(true)
			expect(relation?.serverId).toBe('auth-1')
			expect(relation?.serverState).toBe('connected')
		})

		test('a locally-disconnected relation survives an explicit null re-fetch', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe('auth-1')

			store.setRelation('Article', 'a-1', 'author', { currentId: null, state: 'disconnected' })
			expect(handle.relatedId).toBeNull()
			expect(handle.isDirty).toBe(true)

			store.refreshServerData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: null,
			})

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(handle.relatedId).toBeNull()
			expect(handle.state).toBe('disconnected')
			expect(handle.isDirty).toBe(true)
			expect(relation?.serverId).toBe('auth-1')
			expect(relation?.serverState).toBe('connected')
		})

		test('the baseline advance does not notify subscribers during a render-phase read', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-1', name: 'John' },
			}, true)
			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe('auth-1')

			// Re-fetch with a new related id, setting up the advance on the next read.
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				author: { id: 'auth-2', name: 'Jane' },
			}, true)

			// Subscribe AFTER the re-fetch notification: any callback fired now would be
			// the illegal mid-read notification from the baseline advance (CORR-6).
			const entityCb = mock(() => {})
			const relationCb = mock(() => {})
			store.subscribeToEntity('Article', 'a-1', entityCb)
			store.subscribeToRelation('Article', 'a-1', 'author', relationCb)

			// This read triggers advanceServerBaselineOnRefetch.
			expect(handle.relatedId).toBe('auth-2')

			expect(entityCb).not.toHaveBeenCalled()
			expect(relationCb).not.toHaveBeenCalled()
		})
	})

	// ==================== Reachability / dirty for created has-one child ====================

	describe('Created has-one child via embedded data', () => {
		test('a created child connected via has-one appears as a create without explicit setRelation', () => {
			// Server parent.
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

			// User creates a new author (auto-rooted as a top-level create).
			const childId = store.createEntity('Author', { name: 'Draft Author' })

			// The connection lives ONLY in the parent's embedded current data —
			// no store.setRelation() call.
			store.setFieldValue('Article', 'a-1', ['author'], { id: childId, name: 'Draft Author' })

			// Detach the auto-root so the child is reachable ONLY through the has-one
			// edge once it is materialized (proves materialization drives reachability).
			store.registerParentChild('Article', 'a-1', 'Author', childId)
			store.unregisterRootEntity('Author', childId)

			// Before any handle read, the relation entry does not exist yet, so the
			// child is not reachable through it.
			expect(store.getRelation('Article', 'a-1', 'author')).toBeUndefined()
			const beforeCreates = store.getAllDirtyEntities().filter(e => e.changeType === 'create')
			expect(beforeCreates.map(e => e.entityId)).not.toContain(childId)

			// A handle read materializes the relation entry.
			const handle = createHasOneHandleRaw()
			expect(handle.relatedId).toBe(childId)

			// Now the created child is reachable via the materialized has-one edge and
			// reported as a create — no explicit setRelation was ever called.
			const creates = store.getAllDirtyEntities().filter(e => e.changeType === 'create')
			expect(creates.map(e => e.entityId)).toContain(childId)
		})
	})
})
