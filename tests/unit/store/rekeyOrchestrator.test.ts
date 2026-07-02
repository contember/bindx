// RekeyOrchestrator (PR 2 of the store/persistence debt program).
//
// The orchestrator is the single owner of temp→persisted identity and the one
// place the rekey fan-out is sequenced. These tests pin its resolution logic
// (resolveKey/resolveId/getPersistedId/isNewEntity, formerly split between
// SnapshotStore.rekeyedEntities and EntityMetaStore.tempToPersistedId) and its
// ordering contract (each participant visited exactly once, in order, with a
// fully-derived context). The end-to-end fan-out across the real sub-stores is
// covered by tests/subscriptionRekey.test.ts.
import { describe, test, expect } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { RekeyOrchestrator, type RekeyContext, type Rekeyable } from '../../../packages/bindx/src/store/RekeyOrchestrator.js'

const TEMP = '__temp_1'
const PLACEHOLDER = '__placeholder_1'
const SERVER = 'srv-1'

describe('RekeyOrchestrator', () => {
	test('resolveKey/resolveId redirect a temp id to its persisted id after rekey', () => {
		const o = new RekeyOrchestrator([])

		// Before rekey: identity.
		expect(o.resolveKey('Article', TEMP)).toBe(`Article:${TEMP}`)
		expect(o.resolveId('Article', TEMP)).toBe(TEMP)

		o.rekey('Article', TEMP, SERVER)

		expect(o.resolveKey('Article', TEMP)).toBe(`Article:${SERVER}`)
		expect(o.resolveId('Article', TEMP)).toBe(SERVER)
		// A persisted id (or an unrelated type) is never redirected.
		expect(o.resolveKey('Article', SERVER)).toBe(`Article:${SERVER}`)
		expect(o.resolveKey('Comment', TEMP)).toBe(`Comment:${TEMP}`)
	})

	test('getPersistedId/isNewEntity reflect placeholder, temp, and persisted ids', () => {
		const o = new RekeyOrchestrator([])

		// Placeholder is always "new" and has no persisted id.
		expect(o.getPersistedId('Article', PLACEHOLDER)).toBeNull()
		expect(o.isNewEntity('Article', PLACEHOLDER)).toBe(true)

		// A persisted-looking id is itself the persisted id and is not new.
		expect(o.getPersistedId('Article', SERVER)).toBe(SERVER)
		expect(o.isNewEntity('Article', SERVER)).toBe(false)

		// A temp id has no persisted id until it is rekeyed.
		expect(o.getPersistedId('Article', TEMP)).toBeNull()
		expect(o.isNewEntity('Article', TEMP)).toBe(true)

		o.rekey('Article', TEMP, SERVER)

		expect(o.getPersistedId('Article', TEMP)).toBe(SERVER)
		expect(o.isNewEntity('Article', TEMP)).toBe(false)
	})

	test('rekey visits every participant exactly once, in order', () => {
		const calls: string[] = []
		const spy = (name: string): Rekeyable => ({ rekey: () => calls.push(name) })

		const o = new RekeyOrchestrator([spy('a'), spy('b'), spy('c')])
		o.rekey('Article', TEMP, SERVER)

		expect(calls).toEqual(['a', 'b', 'c'])
	})

	test('rekey passes a fully-derived context to participants', () => {
		let captured: RekeyContext | undefined
		const o = new RekeyOrchestrator([{ rekey: ctx => { captured = ctx } }])

		o.rekey('Article', TEMP, SERVER)

		expect(captured).toEqual({
			oldKey: `Article:${TEMP}`,
			newKey: `Article:${SERVER}`,
			oldKeyPrefix: `Article:${TEMP}:`,
			newKeyPrefix: `Article:${SERVER}:`,
			oldId: TEMP,
			newId: SERVER,
		})
	})

	test('clear forgets all redirects', () => {
		const o = new RekeyOrchestrator([])
		o.rekey('Article', TEMP, SERVER)
		expect(o.resolveId('Article', TEMP)).toBe(SERVER)

		o.clear()
		expect(o.resolveId('Article', TEMP)).toBe(TEMP)
		expect(o.getPersistedId('Article', TEMP)).toBeNull()
	})

	test('end-to-end: SnapshotStore resolves a created entity after persist via the orchestrator', () => {
		const store = new SnapshotStore()
		const tempId = store.createEntity('Article', { title: 'Draft' })
		expect(store.isNewEntity('Article', tempId)).toBe(true)
		expect(store.getPersistedId('Article', tempId)).toBeNull()

		store.mapTempIdToPersistedId('Article', tempId, 'server-99')

		// The handle still references the temp id; lookups transparently resolve.
		expect(store.getPersistedId('Article', tempId)).toBe('server-99')
		expect(store.isNewEntity('Article', tempId)).toBe(false)
		expect(store.existsOnServer('Article', tempId)).toBe(true)
		// The snapshot moved to the persisted key (id field rewritten).
		expect(store.getEntitySnapshot('Article', 'server-99')?.data).toMatchObject({ id: 'server-99', title: 'Draft' })
	})
})
