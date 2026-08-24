import './setup'
import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	UndoManager,
	BatchPersister,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	setField,
	connectRelation,
	disconnectRelation,
	removeFromList,
	moveInList,
	type BackendAdapter,
	type TransactionMutation,
	type SchemaNames,
} from '@contember/bindx'

/**
 * CHARACTERIZATION TESTS — the sweep-vs-journal capture hole.
 *
 * When a created (never-persisted) child is DETACHED from a relation, the gesture
 * only writes the PARENT's relation/has-many cell, so the journal entry records
 * just that cell — not the child's entity snapshot nor its own relation cells.
 * `sweepUnreachableCreated()` (run by BatchPersister after a persist settles, and
 * by the React unmount cleanup) then reclaims the now-unreachable child OUTSIDE any
 * journal transaction, so nothing is recorded. A later undo of the detach restores
 * the parent's membership/currentId pointing at an entity whose snapshot is gone:
 * a dangling relation reference and lost unsaved child data.
 *
 * Tests 1–5 are EXPECTED TO FAIL against today's code (the fix must enrich each
 * journal entry at commit time with the entity/relation cell images of any created,
 * currently-unreachable subtree referenced by the entry's relation/has-many
 * pre-images). Test 6 is the minimality guard and must pass both before and after
 * the fix. Assertions describe the DESIRED post-fix behavior.
 */
describe('undo — created child survives a sweep after detach', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let undo: UndoManager

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		undo = new UndoManager(store, { debounceMs: 0 }) // one entry per dispatch
		dispatcher.addMiddleware(undo.createMiddleware())
	})

	// ============================================================
	// 1. has-many detach survives the sweep
	// ============================================================
	test('has-many: detached created child is restored (data + membership + create) after sweep + undo', () => {
		store.setEntityData('Article', 'p', { id: 'p' }, true)
		store.setHasManyServerIds('Article', 'p', 'items', [])

		// Gesture 1: add a created child to the list.
		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: 'p',
			fieldName: 'items',
			targetType: 'Item',
			itemData: { id: 'c1', name: 'orig' },
		})
		// Gesture 2: edit a scalar so the child carries unsaved data beyond its defaults.
		dispatcher.dispatch(setField('Item', 'c1', ['name'], 'edited'))
		// Gesture 3 (the detach we later undo): remove the child from the list.
		dispatcher.dispatch(removeFromList('Article', 'p', 'items', 'c1', 'disconnect'))

		store.sweepUnreachableCreated()
		expect(store.getEntitySnapshot('Item', 'c1')).toBeUndefined()

		undo.undo()

		// The child snapshot is back with its edited value…
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c1')?.data.name).toBe('edited')
		// …its list membership is restored…
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('c1')
		// …and it is reported as a create again.
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Item',
			entityId: 'c1',
			changeType: 'create',
		})
	})

	// ============================================================
	// 2. nested created subtree survives the sweep
	// ============================================================
	test('nested subtree: detached child + its created grandchild are both restored after sweep + undo', () => {
		store.setEntityData('Article', 'p', { id: 'p' }, true)
		store.setHasManyServerIds('Article', 'p', 'items', [])

		// Gesture 1: add a created child C to the list.
		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: 'p',
			fieldName: 'items',
			targetType: 'Item',
			itemData: { id: 'c1', name: 'child' },
		})
		// Gesture 2: give C its own created grandchild G through a has-one relation.
		store.transaction(() => {
			store.createEntity('Detail', { id: 'g1', label: 'grand' })
			dispatcher.dispatch(connectRelation('Item', 'c1', 'detail', 'g1', 'Detail'))
		})
		expect(store.getRelation('Item', 'c1', 'detail')?.currentId).toBe('g1')

		// Gesture 3 (the detach we later undo): remove C from the parent list.
		dispatcher.dispatch(removeFromList('Article', 'p', 'items', 'c1', 'disconnect'))

		store.sweepUnreachableCreated()
		expect(store.getEntitySnapshot('Item', 'c1')).toBeUndefined()
		expect(store.getEntitySnapshot('Detail', 'g1')).toBeUndefined()

		undo.undo()

		// Whole subtree is back: child data, child's relation cell to the grandchild,
		// and the grandchild snapshot/data.
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c1')?.data.name).toBe('child')
		expect(store.getRelation('Item', 'c1', 'detail')?.currentId).toBe('g1')
		expect(store.getEntitySnapshot<{ label: string }>('Detail', 'g1')?.data.label).toBe('grand')
	})

	// ============================================================
	// 3. has-one create → disconnect → sweep → undo
	// ============================================================
	test('has-one: created target restored (entity + currentId) after disconnect + sweep + undo', () => {
		store.setEntityData('Article', 'a', { id: 'a' }, true)

		// Create + connect through the has-one path (mirrors HasOneHandle.create()).
		store.transaction(() => {
			store.createEntity('Author', { id: 'auth1', name: 'Written' })
			dispatcher.dispatch(connectRelation('Article', 'a', 'author', 'auth1', 'Author'))
		})
		expect(store.getRelation('Article', 'a', 'author')?.currentId).toBe('auth1')

		// The detach we later undo.
		dispatcher.dispatch(disconnectRelation('Article', 'a', 'author'))
		expect(store.getRelation('Article', 'a', 'author')?.state).toBe('disconnected')

		store.sweepUnreachableCreated()
		expect(store.getEntitySnapshot('Author', 'auth1')).toBeUndefined()

		undo.undo()

		// currentId points back at the target — and the target snapshot is back too
		// (no dangling reference).
		expect(store.getRelation('Article', 'a', 'author')?.currentId).toBe('auth1')
		expect(store.getEntitySnapshot<{ name: string }>('Author', 'auth1')?.data.name).toBe('Written')
	})

	// ============================================================
	// 4. undo → redo → undo round-trip across a sweep
	// ============================================================
	test('round-trip: detach → sweep → undo → redo → undo restores the child fully', () => {
		store.setEntityData('Article', 'p', { id: 'p' }, true)
		store.setHasManyServerIds('Article', 'p', 'items', [])

		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: 'p',
			fieldName: 'items',
			targetType: 'Item',
			itemData: { id: 'c1', name: 'child' },
		})
		dispatcher.dispatch(setField('Item', 'c1', ['name'], 'edited'))
		dispatcher.dispatch(removeFromList('Article', 'p', 'items', 'c1', 'disconnect'))

		store.sweepUnreachableCreated()
		expect(store.getEntitySnapshot('Item', 'c1')).toBeUndefined()

		// Undo the detach: the child comes back.
		undo.undo()
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c1')?.data.name).toBe('edited')
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('c1')

		// Redo the detach: it is acceptable that the recreated (unreachable) child is
		// removed from the list again.
		undo.redo()
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).not.toContain('c1')

		// Undo again: the child + membership are fully restored.
		undo.undo()
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c1')?.data.name).toBe('edited')
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('c1')
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Item',
			entityId: 'c1',
			changeType: 'create',
		})
	})

	// ============================================================
	// 5. persist-path integration (BatchPersister-triggered sweep)
	// ============================================================
	test('persist path: after a real persist sweeps the detached child, undo brings it back and the next persist re-sends its create', async () => {
		const schema: SchemaNames = {
			entities: {
				Article: {
					name: 'Article',
					scalars: ['id', 'title'],
					fields: {
						id: { type: 'column' },
						title: { type: 'column' },
						items: { type: 'many', entity: 'Item' },
					},
				},
				Item: {
					name: 'Item',
					scalars: ['id', 'name'],
					fields: {
						id: { type: 'column' },
						name: { type: 'column' },
					},
				},
			},
			enums: {},
		}

		let capturedMutations: readonly TransactionMutation[] = []
		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			persist: mock(() => Promise.resolve({ ok: true })),
			create: mock((_entityType: string, data: Record<string, unknown>) =>
				Promise.resolve({ ok: true, data: { id: 'srv', ...data } }),
			),
			delete: mock(() => Promise.resolve({ ok: true })),
			persistTransaction: mock((mutations: readonly TransactionMutation[]) => {
				capturedMutations = mutations
				return Promise.resolve({
					ok: true,
					results: mutations.map(m => ({ entityType: m.entityType, entityId: m.entityId, ok: true })),
				})
			}),
		}

		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, { mutationCollector, undoManager: undo })

		store.setEntityData('Article', 'p', { id: 'p', title: 'orig' }, true)
		store.setHasManyServerIds('Article', 'p', 'items', [])

		// Gesture A: dirty the parent so the first persist has something to persist
		// (and therefore reaches the BatchPersister sweep).
		dispatcher.dispatch(setField('Article', 'p', ['title'], 'edited-title'))
		// Gesture B/C: add + edit a created child.
		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: 'p',
			fieldName: 'items',
			targetType: 'Item',
			itemData: { id: 'c1', name: 'child' },
		})
		dispatcher.dispatch(setField('Item', 'c1', ['name'], 'child-edited'))
		// Gesture D (the detach we later undo).
		dispatcher.dispatch(removeFromList('Article', 'p', 'items', 'c1', 'disconnect'))

		// Real persist — its post-settle sweep reclaims the unreachable child.
		const firstResult = await persister.persistAll()
		expect(firstResult.success).toBe(true)
		expect(store.getEntitySnapshot('Item', 'c1')).toBeUndefined()

		// Undo the detach: the child (with its unsaved edit) must come back.
		undo.undo()
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c1')?.data.name).toBe('child-edited')
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('c1')
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Item',
			entityId: 'c1',
			changeType: 'create',
		})

		// The next persist must send a create carrying the child's data (preserve-for-retry).
		capturedMutations = []
		const secondResult = await persister.persistAll()
		expect(secondResult.success).toBe(true)
		expect(hasCreateWithName(capturedMutations, 'child-edited')).toBe(true)
	})

	// ============================================================
	// 6. entry minimality guard — must PASS before AND after the fix
	// ============================================================
	test('minimality: a move over a list of REACHABLE created children round-trips without embedding them', () => {
		store.setEntityData('Article', 'p', { id: 'p' }, true)
		store.setHasManyServerIds('Article', 'p', 'items', [])

		// Two created children, both reachable — nothing is ever swept here.
		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: 'p',
			fieldName: 'items',
			targetType: 'Item',
			itemData: { id: 'c1', name: 'first' },
		})
		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: 'p',
			fieldName: 'items',
			targetType: 'Item',
			itemData: { id: 'c2', name: 'second' },
		})
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['c1', 'c2'])

		// A gesture that writes only the has-many cell whose membership contains
		// reachable created children.
		dispatcher.dispatch(moveInList('Article', 'p', 'items', 0, 1))
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['c2', 'c1'])

		// Undo restores the order and both children survive intact — the move entry
		// does not need to embed the still-reachable children's data.
		undo.undo()
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['c1', 'c2'])
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c1')?.data.name).toBe('first')
		expect(store.getEntitySnapshot<{ name: string }>('Item', 'c2')?.data.name).toBe('second')
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Item',
			entityId: 'c1',
			changeType: 'create',
		})
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Item',
			entityId: 'c2',
			changeType: 'create',
		})

		undo.redo()
		expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['c2', 'c1'])
		expect(store.getEntitySnapshot('Item', 'c1')).toBeDefined()
		expect(store.getEntitySnapshot('Item', 'c2')).toBeDefined()
	})
})

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recursively finds an inline `create` op whose data carries `name === value`. */
function hasCreateWithName(mutations: readonly TransactionMutation[], value: string): boolean {
	const visit = (node: unknown): boolean => {
		if (Array.isArray(node)) return node.some(visit)
		if (isRecord(node)) {
			const create = node['create']
			if (isRecord(create) && create['name'] === value) return true
			return Object.values(node).some(visit)
		}
		return false
	}
	return mutations.some(m => visit(m.data ?? {}))
}
