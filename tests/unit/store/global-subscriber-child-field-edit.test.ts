// Regression test for <issue-url — filled in after the issue is created>
//
// A scalar field edit on a CHILD entity (one with a registered parent) must
// notify global store subscribers, not only the entity-scoped subscribers.
// `usePersist().isDirty` subscribes via `store.subscribe()` (global); when the
// global notification is skipped, a Save button gated on `isDirty` never
// re-renders after editing a field on an entity nested in a hasMany.
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { createTestStore, createMockSubscriber } from '../shared/unitTestHelpers.js'

describe('SnapshotStore — global subscriber on nested child field edit', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
	})

	test('should notify global subscribers when a child entity field changes', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
		store.setEntityData('Author', 'auth-1', { id: 'auth-1', name: 'John' }, true)
		store.registerParentChild('Article', 'a-1', 'Author', 'auth-1')

		const globalSub = createMockSubscriber()
		const entitySub = createMockSubscriber()
		store.subscribe(globalSub.fn)
		store.subscribeToEntity('Author', 'auth-1', entitySub.fn)

		store.setFieldValue('Author', 'auth-1', ['name'], 'Jane')

		// The dirty-tracking data layer is correct — the change is recorded.
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Author',
			entityId: 'auth-1',
			changeType: 'update',
		})
		// The entity-scoped subscriber fires (the input re-renders).
		expect(entitySub.callCount()).toBe(1)
		// The global subscriber MUST also fire so usePersist().isDirty updates.
		expect(globalSub.callCount()).toBe(1)
	})

	test('should notify global subscribers when a top-level entity field changes', () => {
		// Control: a parentless entity already notifies globals — this passes today.
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

		const globalSub = createMockSubscriber()
		store.subscribe(globalSub.fn)

		store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

		expect(globalSub.callCount()).toBe(1)
	})
})
