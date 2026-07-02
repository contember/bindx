import './setup'
import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	UndoManager,
	UnrecordedWriteError,
	BatchPersister,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	setField,
	connectRelation,
	removeFromList,
	type BackendAdapter,
	type TransactionMutation,
	type SchemaNames,
} from '@contember/bindx'
import {
	UndoJournal,
	type JournalTarget,
	type JournalCellImage,
	type EntityCellImage,
	type RelationCellImage,
	type HasManyCellImage,
	type EditableWriteCounters,
} from '../packages/bindx/src/undo/UndoJournal.js'

/**
 * The undo write-guard turns the "record before you write" convention into a
 * checked invariant. At each transaction boundary the journal reads the
 * sub-stores' editable-write counters; if a kind's counter advanced but the
 * transaction recorded no cell of that kind, {@link UnrecordedWriteError} is
 * thrown naming the offending kind — catching a mutating method that forgot to
 * record (which would otherwise corrupt undo silently).
 *
 * Coverage: a real forgotten-record path (positive), the guard logic per kind via
 * a rigged {@link JournalTarget}, and a battery of legitimately-unjournaled paths
 * that must stay silent (server ingestion, undo/redo apply, persist + baseline
 * commit, and no-transaction writes).
 */
describe('undo journal write-guard', () => {
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
	// Positive — a real editable write that skips its record call
	// ============================================================
	describe('unrecorded editable write throws', () => {
		test('meta write on a snapshotless entity (recordExistingEntity no-ops) is caught', () => {
			// scheduleForDeletion writes meta unconditionally, but recordExistingEntity
			// only records when a snapshot exists — so a snapshotless target is an
			// editable write with no pre-image: exactly the corruption the guard exists
			// to catch. (A real load always creates the snapshot first, so this cannot
			// happen through the normal UI flow.)
			let caught: unknown
			try {
				store.transaction(() => store.scheduleForDeletion('Article', 'ghost'))
			} catch (error) {
				caught = error
			}

			expect(caught).toBeInstanceOf(UnrecordedWriteError)
			if (!(caught instanceof UnrecordedWriteError)) throw new Error('expected UnrecordedWriteError')
			expect(caught.kinds).toEqual(['entity'])
			expect(caught.message).toContain('entity')
		})
	})

	// ============================================================
	// Guard logic per kind — driven through a rigged JournalTarget
	// ============================================================
	describe('guard logic (rigged target)', () => {
		class RiggedTarget implements JournalTarget {
			readonly counters: { entity: number; relation: number; hasMany: number } = {
				entity: 0,
				relation: 0,
				hasMany: 0,
			}

			getEditableWriteCounters(): EditableWriteCounters {
				return { ...this.counters }
			}

			exportEntityCell(key: string): EntityCellImage {
				return { kind: 'entity', key, present: false }
			}

			exportRelationCell(key: string): RelationCellImage {
				return { kind: 'relation', key, present: false }
			}

			exportHasManyCell(key: string): HasManyCellImage {
				return { kind: 'hasMany', key, present: false }
			}

			exportUnreachableCreatedSubgraph(): JournalCellImage[] {
				return []
			}

			applyJournalImages(): void {}
		}

		const makeJournal = (target: JournalTarget): UndoJournal => {
			return new UndoJournal(target, () => {})
		}

		test.each(['entity', 'relation', 'hasMany'] as const)(
			'an unrecorded %s write throws naming that kind',
			kind => {
			const target = new RiggedTarget()
			const journal = makeJournal(target)

			journal.begin()
			target.counters[kind]++ // an editable write with no matching record call
			let caught: unknown
			try {
				journal.commit()
			} catch (error) {
				caught = error
			}

			expect(caught).toBeInstanceOf(UnrecordedWriteError)
			if (!(caught instanceof UnrecordedWriteError)) throw new Error('expected UnrecordedWriteError')
			expect(caught.kinds).toEqual([kind])
			expect(caught.message).toContain(kind)
		})

		test('a write preceded by its record call does not throw', () => {
			const target = new RiggedTarget()
			const journal = makeJournal(target)

			journal.begin()
			target.counters.relation++
			journal.recordRelation('Article:a:author') // the matching record call
			expect(() => journal.commit()).not.toThrow()
		})

		test('multiple unrecorded kinds are all named', () => {
			const target = new RiggedTarget()
			const journal = makeJournal(target)

			journal.begin()
			target.counters.entity++
			target.counters.hasMany++
			let caught: unknown
			try {
				journal.commit()
			} catch (error) {
				caught = error
			}

			expect(caught).toBeInstanceOf(UnrecordedWriteError)
			if (!(caught instanceof UnrecordedWriteError)) throw new Error('expected UnrecordedWriteError')
			expect(caught.kinds).toEqual(['entity', 'hasMany'])
		})

		test('a no-op transaction (no writes) does not throw', () => {
			const target = new RiggedTarget()
			const journal = makeJournal(target)
			journal.begin()
			expect(() => journal.commit()).not.toThrow()
		})

		test('only the outermost transaction is checked (nested writes fold up)', () => {
			const target = new RiggedTarget()
			const journal = makeJournal(target)

			journal.begin() // outer
			journal.begin() // inner
			target.counters.entity++
			journal.recordEntity('Article:a')
			expect(() => journal.commit()).not.toThrow() // inner commit: no check yet
			expect(() => journal.commit()).not.toThrow() // outer commit: recorded, silent
		})
	})

	// ============================================================
	// Negative — legitimate journaled gestures stay silent
	// ============================================================
	describe('journaled gestures do not throw', () => {
		test('a normal field edit', () => {
			store.setEntityData('Article', 'a', { id: 'a', title: 'A' }, true)
			expect(() => dispatcher.dispatch(setField('Article', 'a', ['title'], 'B'))).not.toThrow()
		})

		test('a has-many add (create + list write in one gesture)', () => {
			store.setEntityData('Article', 'p', { id: 'p' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', [])
			expect(() =>
				dispatcher.dispatch({
					type: 'ADD_TO_LIST',
					entityType: 'Article',
					entityId: 'p',
					fieldName: 'items',
					targetType: 'Item',
					itemData: { id: 'c1', name: 'x' },
				}),
			).not.toThrow()
		})

		test('a has-one connect', () => {
			store.setEntityData('Article', 'a', { id: 'a' }, true)
			store.setEntityData('Author', 'b', { id: 'b' }, true)
			expect(() =>
				dispatcher.dispatch(connectRelation('Article', 'a', 'author', 'b', 'Author')),
			).not.toThrow()
		})

		test('scheduleForDeletion of a loaded entity (snapshot present)', () => {
			store.setEntityData('Article', 'a', { id: 'a' }, true)
			expect(() => store.transaction(() => store.scheduleForDeletion('Article', 'a'))).not.toThrow()
		})
	})

	// ============================================================
	// Negative — legitimately-unjournaled writes stay silent
	// ============================================================
	describe('unjournaled writes do not throw', () => {
		test('server-data ingestion inside a transaction (isServerData does not count)', () => {
			expect(() =>
				store.transaction(() => {
					store.setEntityData('Article', 'a', { id: 'a', title: 'srv' }, true)
					store.setHasManyServerIds('Article', 'a', 'items', ['x'])
				}),
			).not.toThrow()
		})

		test('baseline commit (commitEntity / commitFields) inside a transaction', () => {
			store.setEntityData('Article', 'a', { id: 'a', title: 'A' }, true)
			store.setFieldValue('Article', 'a', ['title'], 'B')
			expect(() =>
				store.transaction(() => {
					store.commitEntity('Article', 'a')
					store.commitFields('Article', 'a', ['title'])
				}),
			).not.toThrow()
		})

		test('undo then redo apply do not throw', () => {
			store.setEntityData('Article', 'a', { id: 'a', title: 'A' }, true)
			dispatcher.dispatch(setField('Article', 'a', ['title'], 'B'))
			expect(() => undo.undo()).not.toThrow()
			expect(() => undo.redo()).not.toThrow()
		})

		test('a write with no transaction open is never checked', () => {
			store.setEntityData('Article', 'a', { id: 'a', title: 'A' }, true)
			// Direct editable write, no begin/commit around it: the guard cannot run and
			// no journal recording is expected by design.
			expect(() => store.setFieldValue('Article', 'a', ['title'], 'B')).not.toThrow()
		})

		test('a full persist flow (with post-settle sweep) does not throw', async () => {
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

			const adapter: BackendAdapter = {
				query: mock(() => Promise.resolve([])),
				persist: mock(() => Promise.resolve({ ok: true })),
				create: mock((_entityType: string, data: Record<string, unknown>) =>
					Promise.resolve({ ok: true, data: { id: 'srv', ...data } }),
				),
				delete: mock(() => Promise.resolve({ ok: true })),
				persistTransaction: mock((mutations: readonly TransactionMutation[]) =>
					Promise.resolve({
						ok: true,
						results: mutations.map(m => ({ entityType: m.entityType, entityId: m.entityId, ok: true })),
					}),
				),
			}

			const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
			const mutationCollector = new MutationCollector(store, schemaAdapter)
			const persister = new BatchPersister(adapter, store, dispatcher, { mutationCollector, undoManager: undo })

			store.setEntityData('Article', 'p', { id: 'p', title: 'orig' }, true)
			store.setHasManyServerIds('Article', 'p', 'items', [])

			dispatcher.dispatch(setField('Article', 'p', ['title'], 'edited'))
			dispatcher.dispatch({
				type: 'ADD_TO_LIST',
				entityType: 'Article',
				entityId: 'p',
				fieldName: 'items',
				targetType: 'Item',
				itemData: { id: 'c1', name: 'child' },
			})
			dispatcher.dispatch(removeFromList('Article', 'p', 'items', 'c1', 'disconnect'))

			const result = await persister.persistAll()
			expect(result.success).toBe(true)
		})
	})
})
