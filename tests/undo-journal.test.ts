import './setup'
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	UndoManager,
	setField,
	connectRelation,
	disconnectRelation,
	moveInList,
	removeFromList,
} from '@contember/bindx'

/**
 * Deep coverage of the write-journal machinery (beyond the headline
 * characterization tests in undo-stabilization.test.ts): the create-seal across a
 * persist, temp→persisted id remapping inside stored entries, every has-many
 * mutation, multi-cell atomic gestures, redo after a persist-surviving undo,
 * absent-relation/has-many restore, and assorted edge cases.
 */
describe('undo journal — deep coverage', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let undo: UndoManager

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		undo = new UndoManager(store, { debounceMs: 0 })
		dispatcher.addMiddleware(undo.createMiddleware())
	})

	// ============================================================
	// Seal — undo of a journaled create after it has been persisted
	// ============================================================
	describe('create-seal across persist', () => {
		test('standalone persisted create is removed from undo history after rekey', () => {
			store.transaction(() => {
				store.createEntity('Article', { id: 'ctemp', title: 'draft' })
			})
			expect(undo.getState().undoCount).toBe(1)

			store.commitEntity('Article', 'ctemp')
			store.setExistsOnServer('Article', 'ctemp', true)
			store.mapTempIdToPersistedId('Article', 'ctemp', 'cp')

			expect(undo.getState().undoCount).toBe(0)
			expect(undo.getState().canUndo).toBe(false)
			expect(store.getEntitySnapshot('Article', 'cp')).toBeDefined()
		})

		test('pending standalone create is cleared after persist rekey seals it', () => {
			const pendingStore = new SnapshotStore()
			const pendingUndo = new UndoManager(pendingStore, { debounceMs: 1000 })
			pendingUndo.createMiddleware()

			pendingStore.transaction(() => {
				pendingStore.createEntity('Article', { id: 'ctemp', title: 'draft' })
			})
			expect(pendingUndo.getState().undoCount).toBe(1)

			pendingStore.commitEntity('Article', 'ctemp')
			pendingStore.setExistsOnServer('Article', 'ctemp', true)
			pendingStore.mapTempIdToPersistedId('Article', 'ctemp', 'cp')

			expect(pendingUndo.getState().undoCount).toBe(0)
			expect(pendingUndo.getState().canUndo).toBe(false)
			expect(pendingStore.getEntitySnapshot('Article', 'cp')).toBeDefined()
		})

		test('default order: undo after persist keeps the created (now server) child', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', ['s'])
			store.setEntityData('Item', 's', { id: 's', name: 's-orig' }, true)

			// Gesture: create child C in P.items.
			dispatcher.dispatch({
				type: 'ADD_TO_LIST',
				entityType: 'Article',
				entityId: 'p',
				fieldName: 'items',
				targetType: 'Item',
				itemData: { id: 'ctemp', name: 'new' },
			})
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s', 'ctemp'])

			// Persist: commit list (C becomes a server member) and rekey C.
			store.commitHasMany('Article', 'p', 'items', ['s', 'ctemp'])
			store.commitEntity('Item', 'ctemp')
			store.setExistsOnServer('Item', 'ctemp', true)
			store.mapTempIdToPersistedId('Item', 'ctemp', 'cp')

			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s', 'cp'])

			// Undo must NOT delete the now server-backed row.
			undo.undo()
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('cp')
			expect(store.getEntitySnapshot('Item', 'cp')).toBeDefined()
		})

		test('falsification: create C under saved P + edit saved sibling S in one group; persist; undo reverts S and keeps C', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', ['s'])
			store.setEntityData('Item', 's', { id: 's', name: 's-orig' }, true)

			const groupId = undo.beginGroup('add C + edit S')
			dispatcher.dispatch({
				type: 'ADD_TO_LIST',
				entityType: 'Article',
				entityId: 'p',
				fieldName: 'items',
				targetType: 'Item',
				itemData: { id: 'ctemp', name: 'C' },
			})
			dispatcher.dispatch(setField('Item', 's', ['name'], 'edited'))
			undo.endGroup(groupId)

			// Persist everything: commit list + sibling, rekey C.
			store.commitHasMany('Article', 'p', 'items', ['s', 'ctemp'])
			store.commitEntity('Item', 's')
			store.commitEntity('Item', 'ctemp')
			store.setExistsOnServer('Item', 'ctemp', true)
			store.mapTempIdToPersistedId('Item', 'ctemp', 'cp')

			undo.undo()

			// S edit reverts (and re-dirties); C remains a server member.
			expect(store.getEntitySnapshot<{ name: string }>('Item', 's')?.data.name).toBe('s-orig')
			expect(store.getEntitySnapshot<{ name: string }>('Item', 's')?.serverData.name).toBe('edited')
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('cp')
			expect(store.getEntitySnapshot('Item', 'cp')).toBeDefined()
		})

		test('explicit order: a reordered list keeps the created child after persist+undo', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', ['s1', 's2'])

			// Reorder first (explicit orderedIds), in its own gesture.
			dispatcher.dispatch(moveInList('Article', 'p', 'items', 0, 1))
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s2', 's1'])

			// Then add C in another gesture.
			dispatcher.dispatch({
				type: 'ADD_TO_LIST',
				entityType: 'Article',
				entityId: 'p',
				fieldName: 'items',
				targetType: 'Item',
				itemData: { id: 'ctemp' },
			})
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s2', 's1', 'ctemp'])

			// Persist: commit + rekey C.
			store.commitHasMany('Article', 'p', 'items', ['s1', 's2', 'ctemp'])
			store.commitEntity('Item', 'ctemp')
			store.setExistsOnServer('Item', 'ctemp', true)
			store.mapTempIdToPersistedId('Item', 'ctemp', 'cp')

			// Undo the add: C is now permanent and must remain in the list.
			undo.undo()
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toContain('cp')
			expect(store.getEntitySnapshot('Item', 'cp')).toBeDefined()
		})
	})

	// ============================================================
	// Rekey — temp→persisted id remapping inside stored entries
	// ============================================================
	describe('rekey remaps embedded ids in stacked entries', () => {
		test('has-many member id is rewritten in a later gesture captured before persist', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', [])

			// gesture1: add C (temp).
			dispatcher.dispatch({
				type: 'ADD_TO_LIST', entityType: 'Article', entityId: 'p', fieldName: 'items',
				targetType: 'Item', itemData: { id: 'ctemp' },
			})
			// gesture2: add D (temp) — its has-many pre-image contains C-temp.
			dispatcher.dispatch({
				type: 'ADD_TO_LIST', entityType: 'Article', entityId: 'p', fieldName: 'items',
				targetType: 'Item', itemData: { id: 'dtemp' },
			})
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['ctemp', 'dtemp'])

			// Persist only C (rekey temp→persisted); the live list rewrites C's id too.
			store.commitEntity('Item', 'ctemp')
			store.setExistsOnServer('Item', 'ctemp', true)
			store.mapTempIdToPersistedId('Item', 'ctemp', 'cp')

			// Undo gesture2 (the D add): D is removed and the restored list references the
			// PERSISTED C id, not the dangling temp id.
			undo.undo()
			const ids = store.getHasManyOrderedIds('Article', 'p', 'items')
			expect(ids).toContain('cp')
			expect(ids).not.toContain('ctemp')
			expect(ids).not.toContain('dtemp')
		})

		test('has-one currentId is rewritten in a stored relation pre-image', () => {
			store.setEntityData('Article', 'a', { id: 'a' }, true)
			store.setRelation('Article', 'a', 'author', { currentId: null, state: 'disconnected' })

			// gesture1: create + connect C (temp) via the has-one path.
			const cTemp = store.createEntity('Author', { id: 'ctemp', name: 'C' })
			store.transaction(() => {
				dispatcher.dispatch(connectRelation('Article', 'a', 'author', cTemp, 'Author'))
			})
			expect(store.getRelation('Article', 'a', 'author')?.currentId).toBe('ctemp')

			// gesture2: disconnect — its relation pre-image holds currentId = C-temp.
			dispatcher.dispatch(disconnectRelation('Article', 'a', 'author'))
			expect(store.getRelation('Article', 'a', 'author')?.state).toBe('disconnected')

			// Persist C (rekey).
			store.commitEntity('Author', 'ctemp')
			store.setExistsOnServer('Author', 'ctemp', true)
			store.mapTempIdToPersistedId('Author', 'ctemp', 'cp')

			// Undo gesture2 (the disconnect): reconnect points at the PERSISTED id.
			undo.undo()
			expect(store.getRelation('Article', 'a', 'author')?.currentId).toBe('cp')
		})
	})

	// ============================================================
	// Has-many mutations (beyond add)
	// ============================================================
	describe('has-many mutation undo', () => {
		test('move is undone to the prior order', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', ['a', 'b', 'c'])

			dispatcher.dispatch(moveInList('Article', 'p', 'items', 0, 2))
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['b', 'c', 'a'])

			undo.undo()
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['a', 'b', 'c'])

			undo.redo()
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['b', 'c', 'a'])
		})

		test('disconnect of a server item is undone (planned removal cleared)', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', ['s1', 's2'])

			dispatcher.dispatch(removeFromList('Article', 'p', 'items', 's1', 'disconnect'))
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s2'])
			expect(store.getHasManyPlannedRemovals('Article', 'p', 'items')?.has('s1')).toBe(true)

			undo.undo()
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s1', 's2'])
			expect(store.getHasManyPlannedRemovals('Article', 'p', 'items')?.size ?? 0).toBe(0)
		})

		test('delete of a server item is undone', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', ['s1', 's2'])

			dispatcher.dispatch(removeFromList('Article', 'p', 'items', 's1', 'delete'))
			expect(store.getHasManyPlannedRemovals('Article', 'p', 'items')?.get('s1')).toBe('delete')

			undo.undo()
			expect(store.getHasManyOrderedIds('Article', 'p', 'items')).toEqual(['s1', 's2'])
			expect(store.getHasManyPlannedRemovals('Article', 'p', 'items')?.size ?? 0).toBe(0)
		})
	})

	// ============================================================
	// Multi-cell atomic gesture
	// ============================================================
	test('multi-cell gesture: one undo reverts field + relation + list together', () => {
		store.setEntityData('Article', 'a', { id: 'a', name: 'a' }, true)
		store.setEntityData('Author', 'b', { id: 'b' }, true)
		store.setRelation('Article', 'a', 'author', { currentId: null, state: 'disconnected' })
		store.setHasManyServerIds('Article', 'a', 'tags', [])

		const groupId = undo.beginGroup('bulk')
		dispatcher.dispatch(setField('Article', 'a', ['name'], 'A2'))
		dispatcher.dispatch(connectRelation('Article', 'a', 'author', 'b', 'Author'))
		dispatcher.dispatch({
			type: 'ADD_TO_LIST', entityType: 'Article', entityId: 'a', fieldName: 'tags',
			targetType: 'Tag', itemData: { id: 'c1', label: 'x' },
		})
		undo.endGroup(groupId)

		expect(undo.getState().undoCount).toBe(1)
		expect(store.getEntitySnapshot<{ name: string }>('Article', 'a')?.data.name).toBe('A2')
		expect(store.getRelation('Article', 'a', 'author')?.currentId).toBe('b')
		expect(store.getHasManyOrderedIds('Article', 'a', 'tags')).toEqual(['c1'])

		undo.undo()
		expect(store.getEntitySnapshot<{ name: string }>('Article', 'a')?.data.name).toBe('a')
		expect(store.getRelation('Article', 'a', 'author')?.currentId).toBeNull()
		expect(store.getRelation('Article', 'a', 'author')?.state).toBe('disconnected')
		expect(store.getHasManyOrderedIds('Article', 'a', 'tags')).toEqual([])
		expect(store.getEntitySnapshot('Tag', 'c1')).toBeUndefined()
	})

	test('dispatchAsync delayed by interceptor does not merge interleaved dispatch into its undo entry', async () => {
		store.setEntityData('Article', 'a', { id: 'a', title: 'A' }, true)
		store.setEntityData('Article', 'b', { id: 'b', title: 'B' }, true)

		let releaseInterceptor: (() => void) | undefined
		const interceptorGate = new Promise<void>(resolve => {
			releaseInterceptor = resolve
		})

		dispatcher.getEventEmitter().intercept('field:changing', event => {
			if (event.entityId === 'a') {
				return interceptorGate
			}
			return undefined
		})

		const pendingDispatch = dispatcher.dispatchAsync(setField('Article', 'a', ['title'], 'A async'))
		if (!releaseInterceptor) {
			throw new Error('Interceptor did not start')
		}

		dispatcher.dispatch(setField('Article', 'b', ['title'], 'B sync'))
		expect(undo.getState().undoCount).toBe(1)

		releaseInterceptor()
		expect(await pendingDispatch).toBe(true)
		expect(undo.getState().undoCount).toBe(2)

		undo.undo()
		expect(store.getEntitySnapshot<{ title: string }>('Article', 'a')?.data.title).toBe('A')
		expect(store.getEntitySnapshot<{ title: string }>('Article', 'b')?.data.title).toBe('B sync')

		undo.undo()
		expect(store.getEntitySnapshot<{ title: string }>('Article', 'b')?.data.title).toBe('B')
	})

	// ============================================================
	// Redo after a persist-surviving undo
	// ============================================================
	test('redo after persist+undo re-applies the (now clean) persisted value', () => {
		const tempId = store.createEntity('Article', { title: 'A' })
		dispatcher.dispatch(setField('Article', tempId, ['title'], 'B'))

		store.commitEntity('Article', tempId)
		store.setExistsOnServer('Article', tempId, true)
		store.mapTempIdToPersistedId('Article', tempId, 'p1')

		undo.undo()
		expect(store.getEntitySnapshot<{ title: string }>('Article', 'p1')?.data.title).toBe('A')
		expect(store.getDirtyFields('Article', 'p1')).toContain('title')

		undo.redo()
		const snap = store.getEntitySnapshot<{ title: string }>('Article', 'p1')
		expect(snap?.data.title).toBe('B')
		// 'B' is now the server value → clean again.
		expect(store.getDirtyFields('Article', 'p1')).toEqual([])
	})

	// ============================================================
	// Absent restore — a relation/list that did not exist before the gesture
	// ============================================================
	test('connect that creates the relation state is undone by dropping it', () => {
		store.setEntityData('Article', 'a', { id: 'a' }, true)
		store.setEntityData('Author', 'b', { id: 'b' }, true)
		// No relation state initialised — the connect creates it.

		dispatcher.dispatch(connectRelation('Article', 'a', 'author', 'b', 'Author'))
		expect(store.getRelation('Article', 'a', 'author')?.currentId).toBe('b')

		undo.undo()
		// The relation state did not exist before the gesture → it is removed entirely.
		expect(store.getRelation('Article', 'a', 'author')).toBeUndefined()
	})

	test('connect to existing unloaded child does not undo a later server load of that child', () => {
		store.setEntityData('Article', 'a', { id: 'a' }, true)

		dispatcher.dispatch(connectRelation('Article', 'a', 'author', 'b', 'Author'))
		store.setEntityData('Author', 'b', { id: 'b', name: 'Loaded later' }, true)

		undo.undo()

		expect(store.getRelation('Article', 'a', 'author')).toBeUndefined()
		expect(store.getEntitySnapshot<{ name: string }>('Author', 'b')?.data.name).toBe('Loaded later')
	})

	// ============================================================
	// Edge cases
	// ============================================================
	test('nested field path is restored', () => {
		store.setEntityData('Article', 'a', { id: 'a', meta: { title: 't' } }, true)

		dispatcher.dispatch(setField('Article', 'a', ['meta', 'title'], 't2'))
		expect(store.getEntitySnapshot<{ meta: { title: string } }>('Article', 'a')?.data.meta.title).toBe('t2')

		undo.undo()
		expect(store.getEntitySnapshot<{ meta: { title: string } }>('Article', 'a')?.data.meta.title).toBe('t')
	})

	test('scheduleForDeletion is undone', () => {
		store.setEntityData('Article', 'a', { id: 'a' }, true)

		store.transaction(() => store.scheduleForDeletion('Article', 'a'))
		expect(store.isScheduledForDeletion('Article', 'a')).toBe(true)

		undo.undo()
		expect(store.isScheduledForDeletion('Article', 'a')).toBe(false)
	})

	test('manual group captures each distinct cell at its pre-group value', () => {
		store.setEntityData('Article', 'a', { id: 'a', name: 'a' }, true)
		store.setEntityData('Article', 'b', { id: 'b', name: 'b' }, true)

		const groupId = undo.beginGroup()
		dispatcher.dispatch(setField('Article', 'a', ['name'], 'a2'))
		dispatcher.dispatch(setField('Article', 'b', ['name'], 'b2'))
		undo.endGroup(groupId)

		expect(undo.getState().undoCount).toBe(1)

		undo.undo()
		expect(store.getEntitySnapshot<{ name: string }>('Article', 'a')?.data.name).toBe('a')
		expect(store.getEntitySnapshot<{ name: string }>('Article', 'b')?.data.name).toBe('b')
	})
})
