/**
 * Regression tests for stale relation data after entity re-fetch.
 *
 * Reproduces the bug where client-side navigation to a detail page shows
 * stale has-one / has-many data even though the parent entity was re-fetched
 * from the server with correct data.
 *
 * Root causes:
 * - HasOneHandle.ensureRelatedEntitySnapshot() skips if child snapshot exists
 * - HasManyListHandle.items getter's getOrCreateHasMany() skips if state exists
 * - Neither updates when the parent's embedded data changes from a re-fetch
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	HasOneHandle,
	HasManyListHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type HasManyAccessor,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

// ==================== Test Schema ====================

interface TestGuarantor {
	id: string
	name: string
}

interface TestProgram {
	id: string
	name: string
	approval?: { id: string; status: string; rounds?: Array<{ id: string; roundNumber: number; status: string }> } | null
	expertGuarantors?: Array<{ id: string; name: string }>
}

interface TestApproval {
	id: string
	status: string
	rounds?: Array<{ id: string; roundNumber: number; status: string }>
}

interface TestRound {
	id: string
	roundNumber: number
	status: string
}

interface TestSchema {
	Program: TestProgram
	Approval: TestApproval
	Round: TestRound
	Guarantor: TestGuarantor
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Program: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
				approval: { type: 'hasOne', target: 'Approval', nullable: true },
				expertGuarantors: { type: 'hasMany', target: 'Guarantor', relationKind: 'manyHasMany' },
			},
		},
		Guarantor: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
			},
		},
		Approval: {
			fields: {
				id: { type: 'scalar' },
				status: { type: 'scalar' },
				rounds: { type: 'hasMany', target: 'Round', relationKind: 'oneHasMany' },
			},
		},
		Round: {
			fields: {
				id: { type: 'scalar' },
				roundNumber: { type: 'scalar' },
				status: { type: 'scalar' },
			},
		},
	},
}

// ==================== Tests ====================

describe('Stale relation data after re-fetch', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let schema: SchemaRegistry<TestSchema>

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		schema = new SchemaRegistry(testSchemaDefinition)
	})

	// ------------------------------------------------------------------
	// HasOne: ensureRelatedEntitySnapshot should update stale child data
	// ------------------------------------------------------------------

	describe('HasOne — child entity data staleness after re-fetch', () => {
		test('child entity snapshot should update when parent is re-fetched with changed embedded data', () => {
			// T0: Initial fetch — approval status is 'pending'
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'pending' },
			}, true)

			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			// Access the entity — this calls ensureRelatedEntitySnapshot
			// which creates Approval:appr-1 snapshot from embedded data
			expect(handle1.isConnected).toBe(true)
			const entity1 = handle1.entityRaw
			expect(entity1.id).toBe('appr-1')

			// Verify initial approval data was extracted
			const snap1 = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snap1!.data as Record<string, unknown>)['status']).toBe('pending')

			// T1: Re-fetch — server now reports approval as 'approved'
			// (e.g., a guarantor approved it while user was on another page)
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'approved' },
			}, true)

			// T2: Create new handle (simulating React re-render after snapshot change)
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			expect(handle2.isConnected).toBe(true)

			// Access the entity — this calls ensureRelatedEntitySnapshot again
			const entity2 = handle2.entityRaw
			expect(entity2.id).toBe('appr-1')

			// BUG: The approval entity snapshot should have status 'approved'
			// but ensureRelatedEntitySnapshot skips because Approval:appr-1 already exists
			const snap2 = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snap2!.data as Record<string, unknown>)['status']).toBe('approved')
		})

		test('child entity snapshot should update when $create + persist is followed by server re-fetch with changed data', () => {
			// T0: No approval
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
			}, true)

			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			expect(handle1.isConnected).toBe(false)

			// T1: User creates approval via $create
			const tempId = handle1.create({ status: 'pending' })
			expect(handle1.isConnected).toBe(true)

			// T2: Simulate persist — rekey temp → real, then commit
			store.mapTempIdToPersistedId('Approval', tempId, 'appr-1')
			store.commitAllRelations('Program', 'prog-1')
			store.commitEntity('Program', 'prog-1')

			// Approval entity exists with status 'pending' (from $create)
			const snapAfterPersist = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfterPersist!.data as Record<string, unknown>)['status']).toBe('pending')

			// T3: User navigates away, then back — re-fetch returns updated data
			// Server has added rounds and changed internal state
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
				approval: {
					id: 'appr-1',
					status: 'pending',
					rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
				},
			}, true)

			// T4: New handle (re-render)
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			expect(handle2.isConnected).toBe(true)

			// Access entity to trigger ensureRelatedEntitySnapshot
			const entity2 = handle2.entityRaw
			expect(entity2.id).toBe('appr-1')

			// BUG: Approval snapshot should include rounds from server re-fetch,
			// but ensureRelatedEntitySnapshot skips because Approval:appr-1 already exists
			const snap2 = store.getEntitySnapshot('Approval', 'appr-1')
			const data2 = snap2!.data as Record<string, unknown>
			expect(data2['rounds']).toBeDefined()
			expect((data2['rounds'] as unknown[]).length).toBe(1)
		})
	})

	// ------------------------------------------------------------------
	// HasMany: getOrCreateHasMany should update stale serverIds
	// ------------------------------------------------------------------

	describe('HasMany — stale serverIds after parent re-fetch', () => {
		function createRoundsList(): HasManyAccessor<TestRound> {
			return HasManyListHandle.create<TestRound>(
				'Approval', 'appr-1', 'rounds', 'Round',
				store, dispatcher, schema,
			)
		}

		test('has-many items should reflect new server data after parent entity is re-fetched', () => {
			// T0: Approval with one round
			store.setEntityData('Approval', 'appr-1', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
			}, true)

			const list1 = createRoundsList()

			// Access items — creates has-many state with serverIds = ['round-1']
			const items1 = list1.items
			expect(items1.length).toBe(1)

			// T1: Re-fetch — server now has two rounds (new round added)
			store.setEntityData('Approval', 'appr-1', {
				id: 'appr-1',
				status: 'pending',
				rounds: [
					{ id: 'round-1', roundNumber: 1, status: 'approved' },
					{ id: 'round-2', roundNumber: 2, status: 'pending' },
				],
			}, true)

			// T2: New handle (re-render)
			const list2 = createRoundsList()

			// BUG: Should see 2 items, but getOrCreateHasMany skips because
			// the has-many state already exists with serverIds = ['round-1']
			const items2 = list2.items
			expect(items2.length).toBe(2)
		})

		test('has-many item data should update when parent is re-fetched with changed embedded data', () => {
			// T0: Round with status 'pending'
			store.setEntityData('Approval', 'appr-1', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
			}, true)

			const list1 = createRoundsList()

			// Access items — creates Round:round-1 snapshot with status 'pending'
			const items1 = list1.items
			expect(items1.length).toBe(1)
			const roundSnap1 = store.getEntitySnapshot('Round', 'round-1')
			expect((roundSnap1!.data as Record<string, unknown>)['status']).toBe('pending')

			// T1: Re-fetch — round status changed to 'approved'
			store.setEntityData('Approval', 'appr-1', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'approved' }],
			}, true)

			// T2: New handle (re-render)
			const list2 = createRoundsList()

			// Access items
			list2.items

			// BUG: Round snapshot should have status 'approved',
			// but ensureItemSnapshots skips because Round:round-1 already exists
			const roundSnap2 = store.getEntitySnapshot('Round', 'round-1')
			expect((roundSnap2!.data as Record<string, unknown>)['status']).toBe('approved')
		})
	})

	// ------------------------------------------------------------------
	// Persist regression: committed state must not be overwritten
	// ------------------------------------------------------------------

	describe('Persist regression — committed has-many must survive re-render', () => {
		test('has-many serverIds from commit must not be overwritten by stale parent embedded data', () => {
			// T0: Program with no expert guarantors (initial server fetch)
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
				expertGuarantors: [],
			}, true)

			const list1 = HasManyListHandle.create<{ id: string; name: string }>(
				'Program', 'prog-1', 'expertGuarantors', 'Guarantor',
				store, dispatcher, schema,
			)

			// Access items — initializes has-many state with serverIds = []
			expect(list1.items.length).toBe(0)

			// T1: User connects a guarantor (simulates UI action)
			store.setEntityData('Guarantor', 'g-1', { id: 'g-1', name: 'Garant' }, true)
			store.planHasManyConnection('Program', 'prog-1', 'expertGuarantors', 'g-1')

			// Should now see 1 item (planned connection)
			const list2 = HasManyListHandle.create<{ id: string; name: string }>(
				'Program', 'prog-1', 'expertGuarantors', 'Guarantor',
				store, dispatcher, schema,
			)
			expect(list2.items.length).toBe(1)

			// T2: Persist succeeds — commit has-many with new serverIds
			store.commitHasMany('Program', 'prog-1', 'expertGuarantors', ['g-1'])

			// Verify committed state via store directly (not through items getter,
			// which would trigger the bug)
			const orderedIds = store.getHasManyOrderedIds('Program', 'prog-1', 'expertGuarantors')
			expect(orderedIds).toContain('g-1')

			// T3: Re-render after persist — items getter reads stale parent embedded data
			// Parent snapshot STILL has expertGuarantors: [] (old data from server)
			// The fix must NOT overwrite committed serverIds ['g-1'] with stale []
			const list3 = HasManyListHandle.create<{ id: string; name: string }>(
				'Program', 'prog-1', 'expertGuarantors', 'Guarantor',
				store, dispatcher, schema,
			)

			// BUG: This fails because getOrCreateHasMany overwrites serverIds
			// from stale parent embedded data (empty array) over committed ['g-1']
			expect(list3.items.length).toBe(1)
		})

		test('has-one child snapshot from commit must not be overwritten by stale parent embedded data', () => {
			// T0: Program with approval status 'pending' (initial server fetch)
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'pending' },
			}, true)

			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			// Access entity to create child snapshot from embedded data
			expect(handle1.isConnected).toBe(true)
			expect(handle1.entityRaw.id).toBe('appr-1')

			// T1: User changes approval status locally
			store.setFieldValue('Approval', 'appr-1', ['status'], 'approved')

			// T2: Persist succeeds — commit entity (serverData = data)
			store.commitEntity('Approval', 'appr-1')

			// Verify: approval entity has status 'approved' in both data and serverData
			const snapAfterCommit = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfterCommit!.data as Record<string, unknown>)['status']).toBe('approved')
			expect((snapAfterCommit!.serverData as Record<string, unknown>)['status']).toBe('approved')

			// T3: Re-render — HasOneHandle reads stale parent embedded data
			// Parent snapshot STILL has approval: { id: 'appr-1', status: 'pending' }
			// The fix must NOT overwrite committed 'approved' with stale 'pending'
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			handle2.entityRaw // triggers ensureRelatedEntitySnapshot

			const snapAfterRerender = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfterRerender!.data as Record<string, unknown>)['status']).toBe('approved')
		})
	})

	// ------------------------------------------------------------------
	// Full scenario: list page → detail page navigation
	// ------------------------------------------------------------------

	describe('Navigation scenario: list → detail', () => {
		test('has-one relation should be visible after list page loaded entity without the relation', () => {
			// T0: List page loads entity with partial data (no approval field)
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Ostrej3',
			}, true)

			// Verify: no approval in snapshot
			const handle0 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			expect(handle0.isConnected).toBe(false)

			// T1: Detail page re-fetches with full data including approval
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Ostrej3',
				approval: {
					id: 'appr-1',
					status: 'pending',
					rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
				},
			}, true)

			// T2: New handle on re-render
			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			// Should now see the approval
			expect(handle1.isConnected).toBe(true)
			expect(handle1.relatedId).toBe('appr-1')
		})

		test('has-one child data should be accessible after list → detail navigation', () => {
			// T0: List page loads entity with partial data
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Ostrej3',
			}, true)

			// T1: Detail page re-fetches with full data
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Ostrej3',
				approval: {
					id: 'appr-1',
					status: 'pending',
					rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
				},
			}, true)

			const handle = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			// Access entity to create child snapshot
			const entity = handle.entityRaw
			expect(entity.id).toBe('appr-1')

			// Approval snapshot should contain embedded rounds data
			const approvalSnap = store.getEntitySnapshot('Approval', 'appr-1')
			expect(approvalSnap).toBeDefined()
			expect((approvalSnap!.data as Record<string, unknown>)['status']).toBe('pending')
			expect((approvalSnap!.data as Record<string, unknown>)['rounds']).toBeDefined()
		})
	})
})
