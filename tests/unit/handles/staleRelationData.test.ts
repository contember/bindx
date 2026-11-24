/**
 * Regression tests for stale relation data after entity re-fetch.
 *
 * Reproduces the bug where client-side navigation to a detail page shows
 * stale has-one / has-many data even though the parent entity was re-fetched
 * from the server with correct data.
 *
 * A read is written on arrival: each entity's columns into its own snapshot and
 * each relation into the relation store (issue #170). These tests pin that a
 * re-fetch reaches the related entities and that local or committed state
 * survives it.
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
	// HasOne: a re-fetch updates the related entity
	// ------------------------------------------------------------------

	describe('HasOne — child entity data staleness after re-fetch', () => {
		test('child entity snapshot should update when parent is re-fetched with changed embedded data', () => {
			// T0: Initial fetch — approval status is 'pending'
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'pending' },
			}, schema, { rootId: 'prog-1' })

			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			expect(handle1.isConnected).toBe(true)
			const entity1 = handle1.entityRaw
			expect(entity1.id).toBe('appr-1')

			// Verify initial approval data was extracted
			const snap1 = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snap1!.data as Record<string, unknown>)['status']).toBe('pending')

			// T1: Re-fetch — server now reports approval as 'approved'
			// (e.g., a guarantor approved it while user was on another page)
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'approved' },
			}, schema, { rootId: 'prog-1' })

			// T2: Create new handle (simulating React re-render after snapshot change)
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			expect(handle2.isConnected).toBe(true)

			const entity2 = handle2.entityRaw
			expect(entity2.id).toBe('appr-1')

			// The re-fetch reached the approval, although its snapshot already existed
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
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				approval: {
					id: 'appr-1',
					status: 'pending',
					rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
				},
			}, schema, { rootId: 'prog-1' })

			// T4: New handle (re-render)
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			expect(handle2.isConnected).toBe(true)

			const entity2 = handle2.entityRaw
			expect(entity2.id).toBe('appr-1')

			// The re-fetch wrote the approval's rounds, although the approval already existed.
			expect([...store.getHasMany('Approval', 'appr-1', 'rounds')?.serverIds ?? []]).toEqual(['round-1'])
		})
	})

	// ------------------------------------------------------------------
	// HasMany: a re-fetch updates the server list
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
			store.writeServerRead('Approval', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
			}, schema, { rootId: 'appr-1' })

			const list1 = createRoundsList()

			// Access items — creates has-many state with serverIds = ['round-1']
			const items1 = list1.items
			expect(items1.length).toBe(1)

			// T1: Re-fetch — server now has two rounds (new round added)
			store.writeServerRead('Approval', {
				id: 'appr-1',
				status: 'pending',
				rounds: [
					{ id: 'round-1', roundNumber: 1, status: 'approved' },
					{ id: 'round-2', roundNumber: 2, status: 'pending' },
				],
			}, schema, { rootId: 'appr-1' })

			// T2: New handle (re-render)
			const list2 = createRoundsList()

			// The re-fetch replaced the server list of the existing has-many state
			const items2 = list2.items
			expect(items2.length).toBe(2)
		})

		test('has-many item data should update when parent is re-fetched with changed embedded data', () => {
			// T0: Round with status 'pending'
			store.writeServerRead('Approval', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
			}, schema, { rootId: 'appr-1' })

			const list1 = createRoundsList()

			// The read already wrote Round:round-1 with status 'pending'
			const items1 = list1.items
			expect(items1.length).toBe(1)
			const roundSnap1 = store.getEntitySnapshot('Round', 'round-1')
			expect((roundSnap1!.data as Record<string, unknown>)['status']).toBe('pending')

			// T1: Re-fetch — round status changed to 'approved'
			store.writeServerRead('Approval', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'approved' }],
			}, schema, { rootId: 'appr-1' })

			// T2: New handle (re-render)
			const list2 = createRoundsList()

			// The re-fetch reached the existing round
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
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				expertGuarantors: [],
			}, schema, { rootId: 'prog-1' })

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
			store.commitAllRelations('Program', 'prog-1')

			// Verify committed state via store directly
			const orderedIds = store.getHasManyOrderedIds('Program', 'prog-1', 'expertGuarantors')
			expect(orderedIds).toContain('g-1')

			// T3: Re-render after persist — the committed ['g-1'] must stay
			const list3 = HasManyListHandle.create<{ id: string; name: string }>(
				'Program', 'prog-1', 'expertGuarantors', 'Guarantor',
				store, dispatcher, schema,
			)

			expect(list3.items.length).toBe(1)
		})

		test('has-one child snapshot from commit must not be overwritten by stale parent embedded data', () => {
			// T0: Program with approval status 'pending' (initial server fetch)
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'pending' },
			}, schema, { rootId: 'prog-1' })

			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			// The read already wrote the approval's own snapshot
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

			// T3: Re-render — reading the relation must not bring back the old 'pending'
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			handle2.entityRaw

			const snapAfterRerender = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfterRerender!.data as Record<string, unknown>)['status']).toBe('approved')
		})
	})

	// ------------------------------------------------------------------
	// Rekey regression: committed state must survive temp→real ID rekey
	// ------------------------------------------------------------------

	describe('Rekey regression — propagation tracking must survive temp→real ID rekey', () => {
		test('has-many committed via $create must not be overwritten after tempId rekey', () => {
			// T0: Program with no approval (initial server fetch)
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test Program',
			}, true)

			// T1: User creates approval with rounds via $create (simulates handleSubmitForApproval)
			const approvalHandle = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			const tempApprovalId = approvalHandle.create({ status: 'pending', rounds: [] })

			// Add a round to the approval's rounds has-many
			store.setEntityData('Round', '__temp_round_1', {
				id: '__temp_round_1',
				roundNumber: 1,
				status: 'pending',
			}, false)
			store.addToHasMany('Approval', tempApprovalId, 'rounds', '__temp_round_1')

			// Access items to initialize has-many state + propagation tracking
			const roundsList1 = HasManyListHandle.create<TestRound>(
				'Approval', tempApprovalId, 'rounds', 'Round',
				store, dispatcher, schema,
			)
			expect(roundsList1.items.length).toBe(1)

			// T2: Persist succeeds — rekey temp IDs to real IDs
			store.mapTempIdToPersistedId('Round', '__temp_round_1', 'round-1')
			store.mapTempIdToPersistedId('Approval', tempApprovalId, 'appr-1')

			// Commit entities and relations
			store.commitEntity('Approval', 'appr-1')
			store.commitAllRelations('Approval', 'appr-1')
			store.commitAllRelations('Program', 'prog-1')

			// T3: Re-render after persist — access rounds through new handles
			const roundsList2 = HasManyListHandle.create<TestRound>(
				'Approval', 'appr-1', 'rounds', 'Round',
				store, dispatcher, schema,
			)

			// The committed round survives the rekey
			expect(roundsList2.items.length).toBe(1)
		})

		test('has-one child snapshot must not be overwritten after tempId rekey', () => {
			// T0: Program without approval
			store.setEntityData('Program', 'prog-1', {
				id: 'prog-1',
				name: 'Test',
			}, true)

			// T1: Create approval via $create
			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			const tempId = handle1.create({ status: 'pending' })

			expect(handle1.entityRaw.id).toBe(tempId)

			// T2: User changes status locally before persist
			store.setFieldValue('Approval', tempId, ['status'], 'submitted')

			// T3: Persist — rekey + commit
			store.mapTempIdToPersistedId('Approval', tempId, 'appr-1')
			store.commitEntity('Approval', 'appr-1')
			store.commitAllRelations('Program', 'prog-1')

			// Verify committed state
			const snapCommitted = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapCommitted!.data as Record<string, unknown>)['status']).toBe('submitted')

			// T4: Re-render — new handle accesses the relation
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			handle2.entityRaw

			// The committed 'submitted' survives the rekey
			const snapAfter = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfter!.data as Record<string, unknown>)['status']).toBe('submitted')
		})
	})

	// ------------------------------------------------------------------
	// Polling / re-fetch with unchanged server data
	// ------------------------------------------------------------------

	describe('Re-fetch with unchanged server data — local mutations preservation', () => {
		test('has-one: unpersisted local mutation must survive parent re-fetch with same server data', () => {
			// T0: Initial fetch
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'pending' },
			}, schema, { rootId: 'prog-1' })

			const handle1 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			handle1.entityRaw

			// T1: User edits approval status locally (not yet persisted)
			store.setFieldValue('Approval', 'appr-1', ['status'], 'draft')

			const snapAfterEdit = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfterEdit!.data as Record<string, unknown>)['status']).toBe('draft')
			expect((snapAfterEdit!.serverData as Record<string, unknown>)['status']).toBe('pending')

			// T2: Polling re-fetches parent with SAME server data (new object reference)
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Test Program',
				approval: { id: 'appr-1', status: 'pending' },
			}, schema, { rootId: 'prog-1' })

			// T3: New handle (re-render after parent snapshot change)
			const handle2 = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)
			handle2.entityRaw

			// The local mutation 'draft' must survive — server data hasn't actually changed
			const snapAfterRefetch = store.getEntitySnapshot('Approval', 'appr-1')
			expect((snapAfterRefetch!.data as Record<string, unknown>)['status']).toBe('draft')
			expect((snapAfterRefetch!.serverData as Record<string, unknown>)['status']).toBe('pending')
		})

		test('has-many: unpersisted local mutation on item must survive parent re-fetch with same server data', () => {
			// T0: Initial fetch
			store.writeServerRead('Approval', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
			}, schema, { rootId: 'appr-1' })

			const list1 = HasManyListHandle.create<TestRound>(
				'Approval', 'appr-1', 'rounds', 'Round',
				store, dispatcher, schema,
			)
			list1.items

			// T1: User edits round status locally (not yet persisted)
			store.setFieldValue('Round', 'round-1', ['status'], 'in-review')

			const roundSnapAfterEdit = store.getEntitySnapshot('Round', 'round-1')
			expect((roundSnapAfterEdit!.data as Record<string, unknown>)['status']).toBe('in-review')
			expect((roundSnapAfterEdit!.serverData as Record<string, unknown>)['status']).toBe('pending')

			// T2: Polling re-fetches parent with SAME server data (new object reference)
			store.writeServerRead('Approval', {
				id: 'appr-1',
				status: 'pending',
				rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
			}, schema, { rootId: 'appr-1' })

			// T3: New handle (re-render)
			const list2 = HasManyListHandle.create<TestRound>(
				'Approval', 'appr-1', 'rounds', 'Round',
				store, dispatcher, schema,
			)
			expect(list2.items.length).toBe(1)

			// The local mutation 'in-review' must survive — server data hasn't actually changed
			const roundSnapAfterRefetch = store.getEntitySnapshot('Round', 'round-1')
			expect((roundSnapAfterRefetch!.data as Record<string, unknown>)['status']).toBe('in-review')
			expect((roundSnapAfterRefetch!.serverData as Record<string, unknown>)['status']).toBe('pending')
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
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Ostrej3',
				approval: {
					id: 'appr-1',
					status: 'pending',
					rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
				},
			}, schema, { rootId: 'prog-1' })

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
			store.writeServerRead('Program', {
				id: 'prog-1',
				name: 'Ostrej3',
				approval: {
					id: 'appr-1',
					status: 'pending',
					rounds: [{ id: 'round-1', roundNumber: 1, status: 'pending' }],
				},
			}, schema, { rootId: 'prog-1' })

			const handle = HasOneHandle.createRaw<TestApproval>(
				'Program', 'prog-1', 'approval', 'Approval',
				store, dispatcher, schema,
			)

			// Access entity to create child snapshot
			const entity = handle.entityRaw
			expect(entity.id).toBe('appr-1')

			// The approval holds its own columns; its rounds are a relation of their own.
			const approvalSnap = store.getEntitySnapshot<Record<string, unknown>>('Approval', 'appr-1')
			expect(approvalSnap?.data['status']).toBe('pending')
			expect([...store.getHasMany('Approval', 'appr-1', 'rounds')?.serverIds ?? []]).toEqual(['round-1'])
		})
	})
})
