import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	isTempId,
	type BackendAdapter,
	type TransactionMutation,
	type SchemaNames,
} from '@contember/bindx'

/**
 * Regression tests for: hasOne relation in 'creating' state (placeholder-backed)
 * must be materialized into a real store entity during mutation collection so
 * the post-persist flow can map the server-assigned ID back onto a tracked
 * entity.
 *
 * Without materialization, extractNestedResultsFromNode sees a relation with
 * currentId = null and skips. commitNestedResults never runs for the nested
 * entity, the server-assigned ID is lost, the relation stays in 'creating'
 * with empty placeholderData, and HasOneHandle returns a PlaceholderHandle
 * with no data — rendering fields as blank until a page refresh clears the
 * store.
 *
 * Real-world scenario: admin create form where the parent entity (e.g.
 * Lecturer) has a hasOne to a child (User) and the user fills fields via
 * PlaceholderHandle which dispatches SET_PLACEHOLDER_DATA. On persist the
 * bug would materialize correctly server-side but leave the client store in
 * a broken state.
 */

const schema: SchemaNames = {
	entities: {
		Lecturer: {
			name: 'Lecturer',
			scalars: ['id', 'qualification', 'status'],
			fields: {
				id: { type: 'column' },
				qualification: { type: 'column' },
				status: { type: 'column' },
				user: { type: 'one', entity: 'User' },
			},
		},
		User: {
			name: 'User',
			scalars: ['id', 'firstName', 'lastName', 'email'],
			fields: {
				id: { type: 'column' },
				firstName: { type: 'column' },
				lastName: { type: 'column' },
				email: { type: 'column' },
			},
		},
	},
	enums: {},
}

describe('hasOne creating-state materialization', () => {
	describe('MutationCollector', () => {
		let store: SnapshotStore
		let collector: MutationCollector

		beforeEach(() => {
			store = new SnapshotStore()
			const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
			collector = new MutationCollector(store, schemaAdapter)
		})

		test('materializes placeholder-backed creating relation into a real store entity', () => {
			// New lecturer with placeholder-backed user (PlaceholderHandle pattern)
			const lecturerId = store.createEntity('Lecturer', { status: 'active' })
			store.getOrCreateRelation('Lecturer', lecturerId, 'user', {
				currentId: null,
				serverId: null,
				state: 'creating',
				serverState: 'disconnected',
				placeholderData: {
					firstName: 'Jan',
					lastName: 'Novák',
					email: 'jan@example.com',
				},
			})

			// Sanity: no User entity exists yet, relation has no currentId
			expect(store.getRelation('Lecturer', lecturerId, 'user')?.currentId).toBeNull()

			const mutation = collector.collectCreateData('Lecturer', lecturerId)

			// Mutation payload is correct
			expect(mutation).toEqual({
				status: 'active',
				user: {
					create: {
						firstName: 'Jan',
						lastName: 'Novák',
						email: 'jan@example.com',
					},
				},
			})

			// Without the fix, the relation stays in 'creating' with currentId = null
			// and no User entity is created. With the fix:
			const relation = store.getRelation('Lecturer', lecturerId, 'user')
			expect(relation).not.toBeUndefined()
			expect(relation!.state).toBe('connected')
			expect(relation!.currentId).not.toBeNull()
			expect(isTempId(relation!.currentId!)).toBe(true)

			// The materialized User entity must exist in the store with the placeholder data
			const userTempId = relation!.currentId!
			const userSnapshot = store.getEntitySnapshot('User', userTempId)
			expect(userSnapshot).not.toBeUndefined()
			expect(userSnapshot!.data).toMatchObject({
				firstName: 'Jan',
				lastName: 'Novák',
				email: 'jan@example.com',
			})

			// The materialized entity must be tracked for post-persist ID mapping
			expect(collector.getNestedEntityIds().has(userTempId)).toBe(true)
			expect(collector.getNestedEntityTypes().get(userTempId)).toBe('User')
		})

		test('materializes creating relation during update of existing parent', () => {
			// Existing lecturer on server, user later added via placeholder
			store.setEntityData('Lecturer', 'lect-1', {
				id: 'lect-1',
				qualification: 'PhD',
				user: null,
			}, true)
			store.setExistsOnServer('Lecturer', 'lect-1', true)

			store.getOrCreateRelation('Lecturer', 'lect-1', 'user', {
				currentId: null,
				serverId: null,
				state: 'creating',
				serverState: 'disconnected',
				placeholderData: {
					firstName: 'Petra',
					email: 'petra@example.com',
				},
			})

			const mutation = collector.collectUpdateData('Lecturer', 'lect-1')

			expect(mutation).toEqual({
				user: {
					create: {
						firstName: 'Petra',
						email: 'petra@example.com',
					},
				},
			})

			// The relation must have been materialized and tracked
			const relation = store.getRelation('Lecturer', 'lect-1', 'user')
			expect(relation!.state).toBe('connected')
			expect(isTempId(relation!.currentId!)).toBe(true)
			expect(collector.getNestedEntityTypes().get(relation!.currentId!)).toBe('User')
		})

		test('returns null for empty placeholderData without mutating the store', () => {
			const lecturerId = store.createEntity('Lecturer', { status: 'active' })
			store.getOrCreateRelation('Lecturer', lecturerId, 'user', {
				currentId: null,
				serverId: null,
				state: 'creating',
				serverState: 'disconnected',
				placeholderData: {},
			})

			const mutation = collector.collectCreateData('Lecturer', lecturerId)

			expect(mutation).toEqual({ status: 'active' })

			// Relation should be untouched — no materialization for empty placeholder
			const relation = store.getRelation('Lecturer', lecturerId, 'user')
			expect(relation!.state).toBe('creating')
			expect(relation!.currentId).toBeNull()
		})
	})

	describe('BatchPersister end-to-end', () => {
		test('after persist, hasOne creating-state is connected to a server-persisted entity', async () => {
			let capturedMutations: readonly TransactionMutation[] = []

			const adapter: BackendAdapter = {
				query: mock(() => Promise.resolve([])),
				persist: mock(() => Promise.resolve({ ok: true })),
				delete: mock(() => Promise.resolve({ ok: true })),
				persistTransaction: mock((mutations: readonly TransactionMutation[]) => {
					capturedMutations = mutations
					// Simulate Contember response: parent gets server ID, nested user gets
					// server ID, both returned as nestedResults for inline creates.
					let serverIdCounter = 0
					const allocate = () => `server-${++serverIdCounter}`

					return Promise.resolve({
						ok: true,
						results: mutations.map(m => {
							const parentServerId = allocate()
							const nestedResults: Array<{
								entityType: string
								entityId: string
								ok: boolean
								persistedId: string
							}> = []

							// Walk the mutation payload and allocate server IDs for any
							// inline creates — matches BatchPersister's extractNestedResultsFromNode.
							const userOp = (m.data as Record<string, unknown> | undefined)?.['user'] as
								| { create?: Record<string, unknown> }
								| undefined
							if (userOp?.create) {
								const relation = store.getRelation(m.entityType, m.entityId, 'user')
								if (relation?.currentId) {
									nestedResults.push({
										entityType: 'User',
										entityId: relation.currentId,
										ok: true,
										persistedId: allocate(),
									})
								}
							}

							return {
								entityType: m.entityType,
								entityId: m.entityId,
								ok: true,
								persistedId: parentServerId,
								nestedResults: nestedResults.length > 0 ? nestedResults : undefined,
							}
						}),
					})
				}),
			}

			const store = new SnapshotStore()
			const dispatcher = new ActionDispatcher(store)
			const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
			const mutationCollector = new MutationCollector(store, schemaAdapter)
			const persister = new BatchPersister(adapter, store, dispatcher, {
				mutationCollector,
				schema: schemaAdapter as never,
			})

			// Simulate the admin create form: new Lecturer, user filled via PlaceholderHandle.
			const lecturerId = store.createEntity('Lecturer', { status: 'active' })
			store.getOrCreateRelation('Lecturer', lecturerId, 'user', {
				currentId: null,
				serverId: null,
				state: 'creating',
				serverState: 'disconnected',
				placeholderData: {
					firstName: 'Jan',
					lastName: 'Novák',
					email: 'jan@example.com',
				},
			})

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(capturedMutations).toHaveLength(1)
			expect(capturedMutations[0]!.data).toMatchObject({
				user: {
					create: {
						firstName: 'Jan',
						lastName: 'Novák',
						email: 'jan@example.com',
					},
				},
			})

			// The relation must resolve to a persisted User entity after commit + ID mapping.
			const relation = store.getRelation('Lecturer', lecturerId, 'user')
			expect(relation).not.toBeUndefined()
			expect(relation!.state).toBe('connected')
			expect(relation!.currentId).not.toBeNull()

			// Without the fix, currentId would still be null and no User entity would exist,
			// leaving HasOneHandle returning a PlaceholderHandle with empty placeholderData.
			const userId = relation!.currentId!
			expect(isTempId(userId)).toBe(false) // tempId mapped to persisted server ID

			const userSnapshot = store.getEntitySnapshot('User', userId)
			expect(userSnapshot).not.toBeUndefined()
			expect(userSnapshot!.data).toMatchObject({
				firstName: 'Jan',
				lastName: 'Novák',
				email: 'jan@example.com',
			})
			expect(store.existsOnServer('User', userId)).toBe(true)

			// Placeholder data must be cleared after commit
			expect(relation!.placeholderData).toEqual({})
		})
	})
})
