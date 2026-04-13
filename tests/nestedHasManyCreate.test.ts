import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	type BackendAdapter,
	type TransactionMutation,
	type SchemaNames,
} from '@contember/bindx'

/**
 * Schema modeling the exact pattern from NPI:
 * Program → Approval (hasOne) → Round (hasMany) → Review (hasMany)
 * Review → Guarantor (hasOne)
 *
 * This is a 3-level nesting scenario where:
 * 1. Program is updated to connect a new Approval
 * 2. Approval has a new Round added via hasMany
 * 3. Round has new Reviews added via hasMany
 * 4. Each Review connects to an existing Guarantor
 */
const nestedSchema: SchemaNames = {
	entities: {
		Program: {
			name: 'Program',
			scalars: ['id', 'name', 'goal'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				goal: { type: 'column' },
				approval: { type: 'one', entity: 'Approval', nullable: true },
			},
		},
		Approval: {
			name: 'Approval',
			scalars: ['id', 'status'],
			fields: {
				id: { type: 'column' },
				status: { type: 'column' },
				rounds: { type: 'many', entity: 'Round' },
			},
		},
		Round: {
			name: 'Round',
			scalars: ['id', 'roundNumber', 'status'],
			fields: {
				id: { type: 'column' },
				roundNumber: { type: 'column' },
				status: { type: 'column' },
				reviews: { type: 'many', entity: 'Review' },
			},
		},
		Review: {
			name: 'Review',
			scalars: ['id', 'reviewType', 'status', 'comment'],
			fields: {
				id: { type: 'column' },
				reviewType: { type: 'column' },
				status: { type: 'column' },
				comment: { type: 'column' },
				guarantor: { type: 'one', entity: 'Guarantor' },
			},
		},
		Guarantor: {
			name: 'Guarantor',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
			},
		},
	},
	enums: {},
}

describe('Nested hasMany create — 3-level deep (Program → Approval → Round → Reviews)', () => {
	let store: SnapshotStore
	let collector: MutationCollector

	beforeEach(() => {
		store = new SnapshotStore()
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		collector = new MutationCollector(store, schemaAdapter)
	})

	/**
	 * BUG: When Round is nested inside Approval's create (via collectHasManyOperations),
	 * the MutationCollector uses processNestedData on the Round's raw entity data
	 * instead of collectCreateData. This means Reviews added to the Round via
	 * store.addToHasMany are NOT included — only embedded data in the Round's
	 * entity snapshot is processed.
	 *
	 * Embedded reviews data IS processed by processNestedData (this works),
	 * but the Reviews are not registered as entities in the store, so after
	 * persist they have no snapshots and items getter returns [].
	 */
	test('collectCreateData for nested round should include reviews from hasMany store state', () => {
		// Setup: existing program on server
		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			goal: 'Learn things',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)

		// Existing guarantors on server
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert Guy' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)
		store.setEntityData('Guarantor', 'g-main', { id: 'g-main', name: 'Main Boss' }, true)
		store.setExistsOnServer('Guarantor', 'g-main', true)

		// Step 1: Create approval entity
		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })

		// Step 2: Connect approval to program
		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		// Step 3: Create round entity with empty reviews array
		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [],
		})

		// Step 4: Add round to approval's rounds hasMany
		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		// Step 5: Create review entities and add to round's reviews hasMany
		const reviewExpertId = store.createEntity('Review', {
			reviewType: 'expert',
			status: 'pending',
		})
		store.getOrCreateRelation('Review', reviewExpertId, 'guarantor', {
			currentId: 'g-expert',
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const reviewMainId = store.createEntity('Review', {
			reviewType: 'main',
			status: 'pending',
		})
		store.getOrCreateRelation('Review', reviewMainId, 'guarantor', {
			currentId: 'g-main',
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		// Add reviews to round's reviews hasMany
		store.getOrCreateHasMany('Round', roundId, 'reviews', [])
		store.addToHasMany('Round', roundId, 'reviews', reviewExpertId)
		store.addToHasMany('Round', roundId, 'reviews', reviewMainId)

		// Now collect the program update mutation
		const programMutation = collector.collectUpdateData('Program', 'prog-1')

		expect(programMutation).not.toBeNull()
		expect(programMutation!['approval']).toBeDefined()

		// The approval should be an inline create
		const approvalOp = programMutation!['approval'] as { create: Record<string, unknown> }
		expect(approvalOp.create).toBeDefined()
		expect(approvalOp.create['status']).toBe('pending')

		// The approval's create should include rounds
		const roundsOps = approvalOp.create['rounds'] as Array<{ create: Record<string, unknown> }>
		expect(roundsOps).toBeDefined()
		expect(roundsOps).toHaveLength(1)
		expect(roundsOps[0]!.create).toBeDefined()
		expect(roundsOps[0]!.create['roundNumber']).toBe(1)
		expect(roundsOps[0]!.create['status']).toBe('pending')

		// THIS IS THE BUG: The round's create should include reviews from the store's hasMany state
		// Currently processNestedData only processes raw entity data (reviews: [])
		// and ignores the reviews added via store.addToHasMany
		const reviewsOps = roundsOps[0]!.create['reviews'] as Array<{ create: Record<string, unknown> }>
		expect(reviewsOps).toBeDefined()
		expect(reviewsOps).toHaveLength(2)
		expect(reviewsOps[0]!.create).toMatchObject({
			reviewType: 'expert',
			status: 'pending',
			guarantor: { connect: { id: 'g-expert' } },
		})
		expect(reviewsOps[1]!.create).toMatchObject({
			reviewType: 'main',
			status: 'pending',
			guarantor: { connect: { id: 'g-main' } },
		})
	})

	/**
	 * Same scenario but using embedded data in the Round's entity snapshot.
	 * This WORKS because processNestedData processes the raw data correctly.
	 * However, the reviews don't exist as store entities, so after persist
	 * the items getter can't find them (no snapshots with server-assigned IDs).
	 */
	test('embedded reviews data in round entity IS included (workaround)', () => {
		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)

		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })

		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		// Round with reviews EMBEDDED in entity data (not via store.addToHasMany)
		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [
				{ reviewType: 'expert', status: 'pending', guarantor: { id: 'g-expert' } },
				{ reviewType: 'main', status: 'pending', guarantor: { id: 'g-main' } },
			],
		})

		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		const programMutation = collector.collectUpdateData('Program', 'prog-1')

		expect(programMutation).not.toBeNull()
		const approvalOp = programMutation!['approval'] as { create: Record<string, unknown> }
		const roundsOps = approvalOp.create['rounds'] as Array<{ create: Record<string, unknown> }>
		const reviewsOps = roundsOps[0]!.create['reviews'] as Array<{ create: Record<string, unknown> }>

		// This works — processNestedData handles the embedded data
		expect(reviewsOps).toHaveLength(2)
		expect(reviewsOps[0]!.create).toMatchObject({
			reviewType: 'expert',
			status: 'pending',
			guarantor: { connect: { id: 'g-expert' } },
		})
		expect(reviewsOps[1]!.create).toMatchObject({
			reviewType: 'main',
			status: 'pending',
			guarantor: { connect: { id: 'g-main' } },
		})
	})

	/**
	 * Verify that standalone collectCreateData for a Round entity
	 * DOES include reviews from the store's hasMany state.
	 * This is the correct behavior — the issue is only when the Round
	 * is nested inside another entity's create via collectHasManyOperations.
	 */
	/**
	 * After persistAll(), embedded relation data (like `reviews: [{ reviewType: 'expert' }]`)
	 * should be materialized into store entities during mutation building, and those
	 * entities should be committed after the parent mutation succeeds.
	 *
	 * This verifies:
	 * 1. Embedded data is materialized into proper store entities with temp IDs
	 * 2. Materialized entities are committed after successful persist
	 * 3. Entities are accessible via the hasMany store state
	 */
	test('after persistAll, materialized embedded entities should be committed in store', async () => {
		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			persist: mock(() => Promise.resolve({ ok: true })),
			delete: mock(() => Promise.resolve({ ok: true })),
			persistTransaction: mock((mutations: readonly TransactionMutation[]) => {
				return Promise.resolve({
					ok: true,
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: true,
						persistedId: undefined,
					})),
				})
			}),
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never, // ContemberSchemaMutationAdapter satisfies MutationSchemaProvider
		})

		// Setup: existing program
		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)

		// Existing guarantors
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)

		// Create approval with round containing EMBEDDED reviews
		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })
		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [
				{ reviewType: 'expert', status: 'pending', guarantor: { id: 'g-expert' } },
			],
		})
		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		// Persist
		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		// After persist + commit, the embedded review should have been materialized
		// into a store entity. commitAllRelations moves createdEntities → serverIds.
		const reviewsState = store.getHasMany('Round', roundId, 'reviews')
		expect(reviewsState).not.toBeUndefined()
		expect(reviewsState!.serverIds.size).toBe(1)

		// The review entity should exist in the store and be committed (existsOnServer)
		const reviewTempId = [...reviewsState!.serverIds][0]!
		const reviewSnapshot = store.getEntitySnapshot('Review', reviewTempId)
		expect(reviewSnapshot).not.toBeUndefined()
		expect(store.existsOnServer('Review', reviewTempId)).toBe(true)

		// The review should have the correct data
		const reviewData = reviewSnapshot!.data as Record<string, unknown>
		expect(reviewData['reviewType']).toBe('expert')
		expect(reviewData['status']).toBe('pending')

		// The review's guarantor should have been materialized as a relation
		const guarantorRelation = store.getRelation('Review', reviewTempId, 'guarantor')
		expect(guarantorRelation).not.toBeUndefined()
		expect(guarantorRelation!.currentId).toBe('g-expert')
	})

	/**
	 * When the adapter provides nestedResults, the nested entity temp IDs
	 * should be mapped to server-assigned IDs.
	 */
	test('nestedResults from adapter maps server IDs for materialized entities', async () => {
		let capturedMutations: readonly TransactionMutation[] = []

		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			persist: mock(() => Promise.resolve({ ok: true })),
			delete: mock(() => Promise.resolve({ ok: true })),
			persistTransaction: mock((mutations: readonly TransactionMutation[]) => {
				capturedMutations = mutations
				return Promise.resolve({
					ok: true,
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: true,
						// Provide nestedResults for inline-created entities
						nestedResults: buildNestedResults(m),
					})),
				})
			}),
		}

		// Build nested results by walking the mutation data and assigning server IDs
		let serverIdCounter = 0
		function buildNestedResults(mutation: TransactionMutation): Array<{ entityType: string; entityId: string; ok: boolean; persistedId: string }> {
			const results: Array<{ entityType: string; entityId: string; ok: boolean; persistedId: string }> = []
			if (!mutation.data) return results
			walkMutationData(mutation.data, results)
			return results
		}
		function walkMutationData(data: Record<string, unknown>, results: Array<{ entityType: string; entityId: string; ok: boolean; persistedId: string }>): void {
			for (const value of Object.values(data)) {
				if (value === null || value === undefined) continue
				if (Array.isArray(value)) {
					for (const item of value) {
						processCreateOp(item, results)
					}
				} else {
					processCreateOp(value, results)
				}
			}
		}
		function processCreateOp(value: unknown, results: Array<{ entityType: string; entityId: string; ok: boolean; persistedId: string }>): void {
			if (typeof value !== 'object' || value === null) return
			const obj = value as Record<string, unknown>
			if (!('create' in obj)) return
			const createData = obj['create'] as Record<string, unknown>
			if (obj['alias'] && typeof obj['alias'] === 'string') {
				results.push({ entityType: 'Unknown', entityId: obj['alias'], ok: true, persistedId: `server-id-${++serverIdCounter}` })
			}
			// Always recurse into create data (even hasOne creates without alias)
			walkMutationData(createData, results)
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)

		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })
		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [
				{ reviewType: 'expert', status: 'pending', guarantor: { id: 'g-expert' } },
			],
		})
		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		// The adapter should have received mutations
		expect(capturedMutations.length).toBeGreaterThan(0)

		// After commit, createdEntities are moved to serverIds
		const reviewsState = store.getHasMany('Round', roundId, 'reviews')
		expect(reviewsState).not.toBeUndefined()
		const reviewTempId = [...reviewsState!.serverIds][0]!
		expect(reviewTempId).toBeDefined()

		// The adapter provided nestedResults, so the temp ID should be mapped to a server ID
		const persistedId = store.getPersistedId('Review', reviewTempId)
		expect(persistedId).not.toBeNull()
		expect(persistedId).toMatch(/^server-id-/)
	})

	/**
	 * When the adapter does NOT support persistTransaction (sequential fallback path),
	 * the BatchPersister extracts nested IDs from the adapter's node response data
	 * and builds nestedResults automatically.
	 */
	test('sequential fallback extracts nested IDs from node response data', async () => {
		let serverIdCounter = 0

		// Adapter without persistTransaction — uses sequential fallback
		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			delete: mock(() => Promise.resolve({ ok: true })),
			persist: mock((entityType: string, id: string, changes: Record<string, unknown>) => {
				// Simulate Contember response: return node data with server-assigned IDs for nested creates
				const nodeData = buildMockNodeResponse(changes)
				return Promise.resolve({ ok: true, data: nodeData })
			}),
			create: mock((entityType: string, data: Record<string, unknown>) => {
				const nodeData = buildMockNodeResponse(data)
				return Promise.resolve({ ok: true, data: nodeData })
			}),
		}

		// Simulate what Contember returns: walk mutation data, assign UUIDs to creates,
		// and include scalar fields (just like the real API returns requested fields)
		function buildMockNodeResponse(data: Record<string, unknown>): Record<string, unknown> {
			const node: Record<string, unknown> = { id: `server-${++serverIdCounter}` }

			for (const [key, value] of Object.entries(data)) {
				if (value === null || value === undefined) continue
				if (Array.isArray(value)) {
					// HasMany: process creates
					const items: Record<string, unknown>[] = []
					for (const item of value) {
						if (typeof item !== 'object' || item === null) continue
						const op = item as Record<string, unknown>
						if ('create' in op) {
							items.push(buildMockNodeResponse(op['create'] as Record<string, unknown>))
						}
					}
					if (items.length > 0) node[key] = items
				} else if (typeof value === 'object') {
					const op = value as Record<string, unknown>
					if ('create' in op) {
						node[key] = buildMockNodeResponse(op['create'] as Record<string, unknown>)
					} else if ('connect' in op) {
						const connectBy = op['connect'] as Record<string, unknown>
						node[key] = { id: connectBy['id'] }
					}
				} else {
					// Scalar field: echo back the value
					node[key] = value
				}
			}
			return node
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		// Setup
		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)

		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })
		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [
				{ reviewType: 'expert', status: 'pending', guarantor: { id: 'g-expert' } },
			],
		})
		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		// The approval should have been mapped to a server ID
		const approvalPersistedId = store.getPersistedId('Approval', approvalId)
		expect(approvalPersistedId).not.toBeNull()
		expect(approvalPersistedId).toMatch(/^server-/)

		// The round should have been mapped
		const roundPersistedId = store.getPersistedId('Round', roundId)
		expect(roundPersistedId).not.toBeNull()
		expect(roundPersistedId).toMatch(/^server-/)

		// The materialized review should also be mapped
		const reviewsState = store.getHasMany('Round', roundId, 'reviews')
		expect(reviewsState).not.toBeUndefined()
		expect(reviewsState!.serverIds.size).toBe(1)

		const reviewTempId = [...reviewsState!.serverIds][0]!
		const reviewPersistedId = store.getPersistedId('Review', reviewTempId)
		expect(reviewPersistedId).not.toBeNull()
		expect(reviewPersistedId).toMatch(/^server-/)
	})

	/**
	 * When the adapter returns fewer new items than create operations (e.g. partial server
	 * failure or ACL filtering), position-based matching is skipped entirely to avoid
	 * wrong ID mappings. The entities should still be committed (they exist on the server
	 * as part of the parent mutation) but keep their temp IDs.
	 */
	test('partial failure: fewer response items than creates skips ID mapping but still commits', async () => {
		let serverIdCounter = 0

		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			delete: mock(() => Promise.resolve({ ok: true })),
			persist: mock((_entityType: string, _id: string, changes: Record<string, unknown>) => {
				const nodeData = buildMockNodeResponse(changes)
				return Promise.resolve({ ok: true, data: nodeData })
			}),
			create: mock((_entityType: string, data: Record<string, unknown>) => {
				const nodeData = buildMockNodeResponse(data)
				return Promise.resolve({ ok: true, data: nodeData })
			}),
		}

		// Simulate a response where one of two reviews is missing from the node
		// (e.g. server created it but ACL prevents reading it back)
		function buildMockNodeResponse(data: Record<string, unknown>): Record<string, unknown> {
			const node: Record<string, unknown> = { id: `server-${++serverIdCounter}` }

			for (const [key, value] of Object.entries(data)) {
				if (value === null || value === undefined) continue
				if (Array.isArray(value)) {
					const items: Record<string, unknown>[] = []
					let createCount = 0
					for (const item of value) {
						if (typeof item !== 'object' || item === null) continue
						const op = item as Record<string, unknown>
						if ('create' in op) {
							createCount++
							// Only return the first create — skip the second to simulate partial response
							if (createCount <= 1) {
								items.push(buildMockNodeResponse(op['create'] as Record<string, unknown>))
							}
						}
					}
					if (items.length > 0) node[key] = items
				} else if (typeof value === 'object') {
					const op = value as Record<string, unknown>
					if ('create' in op) {
						node[key] = buildMockNodeResponse(op['create'] as Record<string, unknown>)
					} else if ('connect' in op) {
						const connectBy = op['connect'] as Record<string, unknown>
						node[key] = { id: connectBy['id'] }
					}
				} else {
					node[key] = value
				}
			}
			return node
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		// Setup
		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)
		store.setEntityData('Guarantor', 'g-main', { id: 'g-main', name: 'Main Boss' }, true)
		store.setExistsOnServer('Guarantor', 'g-main', true)

		// Create approval with round containing TWO embedded reviews
		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })
		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [
				{ reviewType: 'expert', status: 'pending', guarantor: { id: 'g-expert' } },
				{ reviewType: 'main', status: 'pending', guarantor: { id: 'g-main' } },
			],
		})
		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		// Both reviews should be committed (existsOnServer = true)
		const reviewsState = store.getHasMany('Round', roundId, 'reviews')
		expect(reviewsState).not.toBeUndefined()
		expect(reviewsState!.serverIds.size).toBe(2)

		const reviewTempIds = [...reviewsState!.serverIds]
		for (const tempId of reviewTempIds) {
			expect(store.existsOnServer('Review', tempId)).toBe(true)
		}

		// Content matching maps the one review present in the response.
		// The other review (missing from response due to ACL) keeps its temp ID.
		let mappedCount = 0
		let unmappedCount = 0
		for (const tempId of reviewTempIds) {
			const persistedId = store.getPersistedId('Review', tempId)
			if (persistedId) {
				mappedCount++
			} else {
				unmappedCount++
			}
		}
		expect(mappedCount).toBe(1)
		expect(unmappedCount).toBe(1)
	})

	/**
	 * Verifies content-based matching works when the server returns items in a
	 * different order than the create operations. Position-based matching would
	 * produce wrong temp→persisted ID mappings here.
	 */
	test('content matching: reversed server response order maps IDs correctly', async () => {
		let serverIdCounter = 0

		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			delete: mock(() => Promise.resolve({ ok: true })),
			persist: mock((_entityType: string, _id: string, changes: Record<string, unknown>) => {
				const nodeData = buildMockNodeResponse(changes)
				return Promise.resolve({ ok: true, data: nodeData })
			}),
			create: mock((_entityType: string, data: Record<string, unknown>) => {
				const nodeData = buildMockNodeResponse(data)
				return Promise.resolve({ ok: true, data: nodeData })
			}),
		}

		// Return hasMany items in REVERSE order to test content matching
		function buildMockNodeResponse(data: Record<string, unknown>): Record<string, unknown> {
			const node: Record<string, unknown> = { id: `server-${++serverIdCounter}` }

			for (const [key, value] of Object.entries(data)) {
				if (value === null || value === undefined) continue
				if (Array.isArray(value)) {
					const items: Record<string, unknown>[] = []
					for (const item of value) {
						if (typeof item !== 'object' || item === null) continue
						const op = item as Record<string, unknown>
						if ('create' in op) {
							items.push(buildMockNodeResponse(op['create'] as Record<string, unknown>))
						}
					}
					// Reverse the order to simulate non-deterministic DB ordering
					if (items.length > 0) node[key] = items.reverse()
				} else if (typeof value === 'object') {
					const op = value as Record<string, unknown>
					if ('create' in op) {
						node[key] = buildMockNodeResponse(op['create'] as Record<string, unknown>)
					} else if ('connect' in op) {
						const connectBy = op['connect'] as Record<string, unknown>
						node[key] = { id: connectBy['id'] }
					}
				} else {
					node[key] = value
				}
			}
			return node
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		store.setEntityData('Program', 'prog-1', {
			id: 'prog-1',
			name: 'Test Program',
			approval: null,
		}, true)
		store.setExistsOnServer('Program', 'prog-1', true)
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)
		store.setEntityData('Guarantor', 'g-main', { id: 'g-main', name: 'Main Boss' }, true)
		store.setExistsOnServer('Guarantor', 'g-main', true)

		// Two reviews with DIFFERENT data — content matching can distinguish them
		const approvalId = store.createEntity('Approval', { status: 'pending', rounds: [] })
		store.getOrCreateRelation('Program', 'prog-1', 'approval', {
			currentId: approvalId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [
				{ reviewType: 'expert', status: 'pending', guarantor: { id: 'g-expert' } },
				{ reviewType: 'main', status: 'pending', guarantor: { id: 'g-main' } },
			],
		})
		store.getOrCreateHasMany('Approval', approvalId, 'rounds', [])
		store.addToHasMany('Approval', approvalId, 'rounds', roundId)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		// Both reviews should be committed and mapped despite reversed order
		const reviewsState = store.getHasMany('Round', roundId, 'reviews')
		expect(reviewsState).not.toBeUndefined()
		expect(reviewsState!.serverIds.size).toBe(2)

		const reviewTempIds = [...reviewsState!.serverIds]
		for (const tempId of reviewTempIds) {
			expect(store.existsOnServer('Review', tempId)).toBe(true)
			const persistedId = store.getPersistedId('Review', tempId)
			expect(persistedId).not.toBeNull()
			expect(persistedId).toMatch(/^server-/)
		}

		// Verify that the mapping is CORRECT — the "expert" review should map to the
		// response item that has reviewType: 'expert', not the one with 'main'
		const expertTempId = reviewTempIds.find(id => {
			const snap = store.getEntitySnapshot('Review', id)
			return (snap?.data as Record<string, unknown>)?.['reviewType'] === 'expert'
		})
		const mainTempId = reviewTempIds.find(id => {
			const snap = store.getEntitySnapshot('Review', id)
			return (snap?.data as Record<string, unknown>)?.['reviewType'] === 'main'
		})
		expect(expertTempId).toBeDefined()
		expect(mainTempId).toBeDefined()

		// The two reviews should have DIFFERENT server IDs
		const expertServerId = store.getPersistedId('Review', expertTempId!)
		const mainServerId = store.getPersistedId('Review', mainTempId!)
		expect(expertServerId).not.toBe(mainServerId)
	})

	test('standalone collectCreateData for round includes reviews from store', () => {
		const roundId = store.createEntity('Round', {
			roundNumber: 1,
			status: 'pending',
			reviews: [],
		})

		const reviewId = store.createEntity('Review', {
			reviewType: 'expert',
			status: 'pending',
		})
		store.getOrCreateRelation('Review', reviewId, 'guarantor', {
			currentId: 'g-expert',
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.setEntityData('Guarantor', 'g-expert', { id: 'g-expert', name: 'Expert' }, true)
		store.setExistsOnServer('Guarantor', 'g-expert', true)

		store.getOrCreateHasMany('Round', roundId, 'reviews', [])
		store.addToHasMany('Round', roundId, 'reviews', reviewId)

		// When collectCreateData is called directly on the Round,
		// it properly checks the store's hasMany state for reviews
		const roundMutation = collector.collectCreateData('Round', roundId)

		expect(roundMutation).not.toBeNull()
		expect(roundMutation!['roundNumber']).toBe(1)
		expect(roundMutation!['status']).toBe('pending')

		const reviewsOps = roundMutation!['reviews'] as Array<{ create: Record<string, unknown> }>
		expect(reviewsOps).toBeDefined()
		expect(reviewsOps).toHaveLength(1)
		expect(reviewsOps[0]!.create).toMatchObject({
			reviewType: 'expert',
			status: 'pending',
			guarantor: { connect: { id: 'g-expert' } },
		})
	})
})
