// Pessimistic presentation primitive (PR 3 / C1 of the store/persistence debt program).
//
// getPresentationSnapshot returns the snapshot a consumer should DISPLAY: the
// canonical snapshot, except while an entity is pessimistically in-flight, when
// it returns the server baseline (data === serverData) WITHOUT mutating the
// store. The canonical snapshot stays dirty, so dirty tracking and retry are
// unaffected. This primitive is inert until PR 4 routes display reads through it.
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'

interface Article {
	id: string
	title: string
}

describe('pessimistic presentation flag', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = new SnapshotStore()
		// Server baseline "Server", with a local dirty edit "Local edit".
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'Server' }, true)
		store.setFieldValue('Article', 'a1', ['title'], 'Local edit')
	})

	const presentedTitle = (): string | undefined =>
		store.getPresentationSnapshot<Article>('Article', 'a1')?.data.title
	const canonicalTitle = (): string | undefined =>
		store.getEntitySnapshot<Article>('Article', 'a1')?.data.title

	test('without the flag, presentation equals the canonical snapshot', () => {
		expect(presentedTitle()).toBe('Local edit')
		expect(store.getPresentationSnapshot('Article', 'a1')).toBe(store.getEntitySnapshot('Article', 'a1'))
	})

	test('while pessimistically in-flight, presentation is the server baseline', () => {
		store.setPersisting('Article', 'a1', true, true)

		expect(presentedTitle()).toBe('Server')
		const presented = store.getPresentationSnapshot<Article>('Article', 'a1')
		expect(presented?.data).toEqual(presented?.serverData)
	})

	test('the canonical snapshot stays dirty during pessimistic in-flight', () => {
		store.setPersisting('Article', 'a1', true, true)

		// Canonical data untouched — no mutate-restore.
		expect(canonicalTitle()).toBe('Local edit')
		// Still reported as a dirty update.
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Article',
			entityId: 'a1',
			changeType: 'update',
		})
	})

	test('optimistic in-flight presents the live data, not the baseline', () => {
		store.setPersisting('Article', 'a1', true, false)
		expect(presentedTitle()).toBe('Local edit')
	})

	test('clearing the persisting flag restores canonical presentation', () => {
		store.setPersisting('Article', 'a1', true, true)
		expect(presentedTitle()).toBe('Server')

		store.setPersisting('Article', 'a1', false)
		expect(presentedTitle()).toBe('Local edit')
	})

	test('pessimistic presentation toggles bump the entity snapshot version', () => {
		const currentVersion = (): number =>
			store.getEntitySnapshot('Article', 'a1')?.version ?? -1
		const observedVersions: number[] = []
		const initialVersion = currentVersion()

		store.subscribeToEntity('Article', 'a1', () => {
			observedVersions.push(currentVersion())
		})

		store.setPersisting('Article', 'a1', true, true)
		const inFlightVersion = currentVersion()
		expect(inFlightVersion).toBeGreaterThan(initialVersion)
		expect(observedVersions).toEqual([inFlightVersion])

		store.setPersisting('Article', 'a1', false)
		const restoredVersion = currentVersion()
		expect(restoredVersion).toBeGreaterThan(inFlightVersion)
		expect(observedVersions).toEqual([inFlightVersion, restoredVersion])
	})

	test('the presented baseline snapshot is frozen and does not alias the stored one', () => {
		store.setPersisting('Article', 'a1', true, true)
		const presented = store.getPresentationSnapshot<Article>('Article', 'a1')
		expect(Object.isFrozen(presented)).toBe(true)
		expect(presented).not.toBe(store.getEntitySnapshot('Article', 'a1'))
	})
})
