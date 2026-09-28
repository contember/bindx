import { describe, expect, spyOn, test } from 'bun:test'
import { HasOneStore, type StoredRelationState } from '../../../packages/bindx/src/store/HasOneStore.js'
import { HasManyStore } from '../../../packages/bindx/src/store/HasManyStore.js'
import type { StoredHasManyState } from '../../../packages/bindx/src/store/hasManyState.js'

function hasOneState(): StoredRelationState {
	return {
		currentId: null,
		serverId: 'child',
		state: 'disconnected',
		serverState: 'connected',
		placeholderData: {},
		version: 0,
	}
}

function hasManyState(): StoredHasManyState {
	return {
		views: new Map([['articles', { serverIds: new Set(['child']), orderedIds: null, membership: 'total' }]]),
		plannedRemovals: new Map([['child', 'disconnect']]),
		plannedAdditions: new Map(),
		version: 0,
	}
}

interface Harness {
	store: HasOneStore | HasManyStore
	seed: (key: string) => void
	remove: (key: string) => void
}

function createHasOneHarness(): Harness {
	const store = new HasOneStore()
	return {
		store,
		seed: key => { store.getOrCreateRelation(key, hasOneState()) },
		remove: key => store.removeRelation(key),
	}
}

function createHasManyHarness(): Harness {
	const store = new HasManyStore()
	return {
		store,
		seed: key => { store.importHasManyStates(new Map([[key, hasManyState()]])) },
		remove: key => store.removeHasMany(key),
	}
}

function dirty(store: HasOneStore | HasManyStore, owner: string): string[] {
	const fields: string[] = []
	store.collectDirtyRelations(`${owner}:`, fields)
	return fields
}

for (const createHarness of [createHasOneHarness, createHasManyHarness]) {
	describe(createHarness.name, () => {
		test('finds dirty relations without live children and isolates owners', () => {
			const { store, seed } = createHarness()
			seed('Article:1:relation')
			seed('Article:10:other')
			seed('Author:1:other')
			expect(dirty(store, 'Article:1')).toEqual(['relation'])
			expect(dirty(store, 'Article:missing')).toEqual([])
		})

		test('tracks reset, reimport, commit, rekey, removal and clear', () => {
			const { store, seed, remove } = createHarness()
			const key = 'Article:temp:relation'
			seed(key)
			const saved = store instanceof HasOneStore
				? () => { store.importRelationStates(new Map([[key, hasOneState()]])) }
				: () => { store.importHasManyStates(new Map([[key, hasManyState()]])) }
			store.resetAllRelations('Article:temp:')
			expect(dirty(store, 'Article:temp')).toEqual([])
			saved()
			expect(dirty(store, 'Article:temp')).toEqual(['relation'])
			store.commitAllRelations('Article:temp:')
			expect(dirty(store, 'Article:temp')).toEqual([])
			saved()
			store.rekeyOwner('Article:temp:', 'Article:real:')
			expect(dirty(store, 'Article:temp')).toEqual([])
			expect(dirty(store, 'Article:real')).toEqual(['relation'])
			remove('Article:real:relation')
			expect(dirty(store, 'Article:real')).toEqual([])
			seed('Article:real:relation')
			expect(dirty(store, 'Article:real')).toEqual(['relation'])
			store.removeOwnedRelations('Article:real:')
			expect(dirty(store, 'Article:real')).toEqual([])
			seed(key)
			store.clear()
			expect(dirty(store, 'Article:temp')).toEqual([])
			seed(key)
			expect(dirty(store, 'Article:temp')).toEqual(['relation'])
		})

		test('does not perform a full-store prefix scan for each owner', () => {
			const { store, seed } = createHarness()
			const count = 200
			for (let i = 0; i < count; i++) seed(`Article:${i}:relation`)
			// Count work rather than wall time so concurrent workloads cannot hide a regression.
			const prefixes = spyOn(String.prototype, 'startsWith')
			let checks: number
			let found = 0
			try {
				for (let i = 0; i < count; i++) found += dirty(store, `Article:${i}`).length
				checks = prefixes.mock.calls.length
			} finally {
				prefixes.mockRestore()
			}
			expect(found).toBe(count)
			expect(checks).toBeLessThanOrEqual(count * 2)
		})
	})
}

test('includes placeholder-only has-one changes', () => {
	const store = new HasOneStore()
	store.getOrCreateRelation('Article:1:author', {
		currentId: null,
		serverId: null,
		state: 'disconnected',
		serverState: 'disconnected',
		placeholderData: { name: 'New author' },
	})
	expect(dirty(store, 'Article:1')).toEqual(['author'])
})
