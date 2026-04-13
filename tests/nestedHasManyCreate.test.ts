import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	type BackendAdapter,
	type TransactionResult,
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
		expect(programMutation!.approval).toBeDefined()

		// The approval should be an inline create
		const approvalOp = programMutation!.approval as { create: Record<string, unknown> }
		expect(approvalOp.create).toBeDefined()
		expect(approvalOp.create.status).toBe('pending')

		// The approval's create should include rounds
		const roundsOps = approvalOp.create.rounds as Array<{ create: Record<string, unknown> }>
		expect(roundsOps).toBeDefined()
		expect(roundsOps).toHaveLength(1)
		expect(roundsOps[0].create).toBeDefined()
		expect(roundsOps[0].create.roundNumber).toBe(1)
		expect(roundsOps[0].create.status).toBe('pending')

		// THIS IS THE BUG: The round's create should include reviews from the store's hasMany state
		// Currently processNestedData only processes raw entity data (reviews: [])
		// and ignores the reviews added via store.addToHasMany
		const reviewsOps = roundsOps[0].create.reviews as Array<{ create: Record<string, unknown> }>
		expect(reviewsOps).toBeDefined()
		expect(reviewsOps).toHaveLength(2)
		expect(reviewsOps[0].create).toMatchObject({
			reviewType: 'expert',
			status: 'pending',
			guarantor: { connect: { id: 'g-expert' } },
		})
		expect(reviewsOps[1].create).toMatchObject({
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
		const approvalOp = programMutation!.approval as { create: Record<string, unknown> }
		const roundsOps = approvalOp.create.rounds as Array<{ create: Record<string, unknown> }>
		const reviewsOps = roundsOps[0].create.reviews as Array<{ create: Record<string, unknown> }>

		// This works — processNestedData handles the embedded data
		expect(reviewsOps).toHaveLength(2)
		expect(reviewsOps[0].create).toMatchObject({
			reviewType: 'expert',
			status: 'pending',
			guarantor: { connect: { id: 'g-expert' } },
		})
		expect(reviewsOps[1].create).toMatchObject({
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
	 * BUG 2: After persistAll(), inline-created entities (from embedded data like
	 * `reviews: [{ reviewType: 'expert', ... }]`) are NOT hydrated into the store.
	 *
	 * The server creates them and returns IDs, but BatchPersister only maps
	 * top-level entity temp IDs. The inline-created entities have no snapshots
	 * in the store, so HasManyListHandle.items returns [] for them.
	 *
	 * Expected: After persist, the store should contain snapshots for all entities
	 * created inline, with their server-assigned IDs. The parent entity's embedded
	 * data should be updated with the real IDs so that items getter works.
	 */
	test('after persistAll, inline-created nested entities should have store snapshots', async () => {
		// Create adapter that returns realistic IDs for created entities
		let createCallIndex = 0
		const createdIds = ['server-approval-1', 'server-round-1', 'server-review-1', 'server-review-2']
		const transactionMutations: TransactionMutation[] = []

		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			persist: mock(() => Promise.resolve({ ok: true })),
			create: mock((entityType: string, data: Record<string, unknown>) => {
				const id = createdIds[createCallIndex++] ?? `server-${createCallIndex}`
				return Promise.resolve({ ok: true, data: { id, ...data } })
			}),
			delete: mock(() => Promise.resolve({ ok: true })),
			persistTransaction: mock((mutations: readonly TransactionMutation[]) => {
				transactionMutations.push(...mutations)
				// Simulate server response — each mutation succeeds with a generated ID
				return Promise.resolve({
					ok: true,
					results: mutations.map((m, i) => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: true,
						persistedId: m.operation === 'create' ? createdIds[i] : undefined,
					})),
				})
			}),
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(nestedSchema)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector: new MutationCollector(store, schemaAdapter),
			schema: schemaAdapter,
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

		// Create approval with round containing embedded reviews
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

		// After persist, the round's embedded reviews data should be updated
		// with server-assigned IDs so that items getter can find them
		const roundSnapshot = store.getEntitySnapshot('Round', roundId)
		const roundData = roundSnapshot?.data as Record<string, unknown> | undefined
		const reviewsData = roundData?.reviews as Array<Record<string, unknown>> | undefined

		// The reviews in the round's data should now have server-assigned IDs
		expect(reviewsData).toBeDefined()
		expect(reviewsData!.length).toBeGreaterThan(0)

		// Each review should have an 'id' field (server-assigned, not temp)
		const hasServerIds = reviewsData!.every(r => typeof r.id === 'string' && !r.id.startsWith('__temp_'))
		expect(hasServerIds).toBe(true)
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
		expect(roundMutation!.roundNumber).toBe(1)
		expect(roundMutation!.status).toBe('pending')

		const reviewsOps = roundMutation!.reviews as Array<{ create: Record<string, unknown> }>
		expect(reviewsOps).toBeDefined()
		expect(reviewsOps).toHaveLength(1)
		expect(reviewsOps[0].create).toMatchObject({
			reviewType: 'expert',
			status: 'pending',
			guarantor: { connect: { id: 'g-expert' } },
		})
	})
})
