import { describe, test, expect } from 'bun:test'
import { createTestStore, createMockSubscriber } from '../shared/unitTestHelpers.js'

/**
 * Parent propagation is a transitive closure over live relation edges. An ancestor
 * reachable through several edges (a child listed in two has-many fields of the same
 * parent, or a hub entity every row points at) must be bumped and walked once per
 * write, not once per edge.
 */
describe('shared ancestor propagation', () => {
	test('a grandparent reached through two parents is bumped once per child write', () => {
		const store = createTestStore()
		store.setEntityData('Site', 'site-1', { id: 'site-1' }, true)
		store.setEntityData('Page', 'page-1', { id: 'page-1' }, true)
		store.setEntityData('Page', 'page-2', { id: 'page-2' }, true)
		store.setEntityData('Block', 'block-1', { id: 'block-1', title: 'A' }, true)
		store.getOrCreateHasMany('Site', 'site-1', 'pages', ['page-1', 'page-2'])
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', ['block-1'])
		store.getOrCreateHasMany('Page', 'page-2', 'blocks', ['block-1'])

		const grandparent = createMockSubscriber()
		store.subscribeToEntity('Site', 'site-1', grandparent.fn)
		const versionBefore = store.getEntitySnapshot('Site', 'site-1')?.version

		store.setFieldValue('Block', 'block-1', ['title'], 'B')

		expect(grandparent.callCount()).toBe(1)
		expect(store.getEntitySnapshot('Site', 'site-1')?.version).toBe((versionBefore ?? 0) + 1)
	})
})
