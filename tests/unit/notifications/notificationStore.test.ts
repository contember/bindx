import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { NotificationStore } from '@contember/bindx'

describe('NotificationStore', () => {
	let store: NotificationStore

	beforeEach(() => {
		store = new NotificationStore()
	})

	test('add and getAll', () => {
		store.add({ type: 'success', message: 'Saved', source: 'persist', dismissAfter: 0 })
		store.add({ type: 'error', message: 'Failed', source: 'persist', dismissAfter: 0 })

		const all = store.getAll()
		expect(all).toHaveLength(2)
		expect(all[0]!.message).toBe('Saved')
		expect(all[1]!.message).toBe('Failed')
	})

	test('add returns unique ids', () => {
		const id1 = store.add({ type: 'success', message: 'A', source: 'persist', dismissAfter: 0 })
		const id2 = store.add({ type: 'success', message: 'B', source: 'persist', dismissAfter: 0 })
		expect(id1).not.toBe(id2)
	})

	test('dismiss removes a notification', () => {
		const id = store.add({ type: 'error', message: 'Oops', source: 'persist', dismissAfter: 0 })
		expect(store.getAll()).toHaveLength(1)

		store.dismiss(id)
		expect(store.getAll()).toHaveLength(0)
	})

	test('dismiss with unknown id is no-op', () => {
		store.add({ type: 'info', message: 'Hello', source: 'client', dismissAfter: 0 })
		store.dismiss('nonexistent')
		expect(store.getAll()).toHaveLength(1)
	})

	test('clear removes all notifications', () => {
		store.add({ type: 'success', message: 'A', source: 'persist', dismissAfter: 0 })
		store.add({ type: 'error', message: 'B', source: 'persist', dismissAfter: 0 })
		store.clear()
		expect(store.getAll()).toHaveLength(0)
	})

	test('deduplication by source + message', () => {
		const id1 = store.add({ type: 'error', message: 'Duplicate', source: 'persist', dismissAfter: 0 })
		const id2 = store.add({ type: 'error', message: 'Duplicate', source: 'persist', dismissAfter: 0 })
		expect(id1).toBe(id2)
		expect(store.getAll()).toHaveLength(1)
	})

	test('different source allows same message', () => {
		store.add({ type: 'error', message: 'Same msg', source: 'persist', dismissAfter: 0 })
		store.add({ type: 'error', message: 'Same msg', source: 'load', dismissAfter: 0 })
		expect(store.getAll()).toHaveLength(2)
	})

	test('subscribe notifies on add', () => {
		const callback = mock(() => {})
		store.subscribe(callback)

		store.add({ type: 'info', message: 'Test', source: 'client', dismissAfter: 0 })
		expect(callback).toHaveBeenCalledTimes(1)
	})

	test('subscribe notifies on dismiss', () => {
		const id = store.add({ type: 'info', message: 'Test', source: 'client', dismissAfter: 0 })

		const callback = mock(() => {})
		store.subscribe(callback)
		store.dismiss(id)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	test('unsubscribe stops notifications', () => {
		const callback = mock(() => {})
		const unsub = store.subscribe(callback)
		unsub()

		store.add({ type: 'info', message: 'Test', source: 'client', dismissAfter: 0 })
		expect(callback).not.toHaveBeenCalled()
	})

	test('getAll returns stable reference when unchanged', () => {
		store.add({ type: 'info', message: 'A', source: 'client', dismissAfter: 0 })
		const ref1 = store.getAll()
		const ref2 = store.getAll()
		expect(ref1).toBe(ref2)
	})

	test('notifications are sorted by timestamp', () => {
		store.add({ type: 'info', message: 'First', source: 'client', dismissAfter: 0 })
		store.add({ type: 'info', message: 'Second', source: 'client', dismissAfter: 0 })

		const all = store.getAll()
		expect(all[0]!.timestamp).toBeLessThanOrEqual(all[1]!.timestamp)
	})

	test('details and technicalDetail are preserved', () => {
		store.add({
			type: 'error',
			message: 'Failed',
			source: 'persist',
			dismissAfter: 0,
			details: [
				{ entityType: 'Article', fieldName: 'title', message: 'Required' },
			],
			technicalDetail: 'HTTP 400',
		})

		const notification = store.getAll()[0]!
		expect(notification.details).toHaveLength(1)
		expect(notification.details![0]!.fieldName).toBe('title')
		expect(notification.technicalDetail).toBe('HTTP 400')
	})

	test('destroy cleans up everything', () => {
		const callback = mock(() => {})
		store.subscribe(callback)
		store.add({ type: 'info', message: 'Test', source: 'client', dismissAfter: 0 })
		expect(callback).toHaveBeenCalledTimes(1)

		store.destroy()
		expect(store.getAll()).toHaveLength(0)

		// After destroy, subscribers are cleared — new adds don't notify
		const callCountAfterDestroy = callback.mock.calls.length
		store.add({ type: 'info', message: 'After destroy', source: 'client', dismissAfter: 0 })
		expect(callback.mock.calls.length).toBe(callCountAfterDestroy)
	})
})
