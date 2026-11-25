import { describe, expect, test } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'

// A list create the server confirmed without a row to pair it with leaves the list, and the
// response's unclaimed rows join it (bindx#177).

function storeWithTags(): { store: SnapshotStore; created: string } {
	const store = new SnapshotStore()
	store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])
	const created = store.createEntity('Tag', { name: 'New' })
	store.addToHasMany('Article', 'a-1', 'tags', created)
	return { store, created }
}

describe('SnapshotStore.supersedeHasManyCreates', () => {
	test('the dropped item leaves the relation and the rows join its baseline', () => {
		const { store, created } = storeWithTags()

		store.supersedeHasManyCreates('Article', 'a-1', 'tags', { dropped: new Set([created]), adopted: ['row-1'] })

		const relation = store.getHasMany('Article', 'a-1', 'tags')
		expect([...relation?.serverIds ?? []]).toEqual(['t-1', 't-2', 'row-1'])
		expect(relation?.plannedAdditions.size).toBe(0)
	})

	test('the rows take the dropped item\'s place in an explicit order', () => {
		const { store, created } = storeWithTags()
		store.moveInHasMany('Article', 'a-1', 'tags', 2, 0)
		expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags')).toEqual([created, 't-1', 't-2'])

		store.supersedeHasManyCreates('Article', 'a-1', 'tags', { dropped: new Set([created]), adopted: ['row-1', 'row-2'] })

		expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags')).toEqual(['row-1', 'row-2', 't-1', 't-2'])
	})

	test('a filtered view, which may exclude the rows, does not show them', () => {
		const store = new SnapshotStore()
		store.declareHasManyViewMembership('Article', 'tags', 'redTags', 'partial')
		store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], 'redTags')
		store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])
		const created = store.createEntity('Tag', { name: 'New' })
		store.addToHasMany('Article', 'a-1', 'tags', created, 'redTags')

		store.supersedeHasManyCreates('Article', 'a-1', 'tags', { dropped: new Set([created]), adopted: ['row-1'] })

		expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', 'redTags')).toEqual(['t-1'])
		expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags')).toEqual(['t-1', 't-2', 'row-1'])
	})
})
