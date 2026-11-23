import { describe, expect, test } from 'bun:test'
import type { TransactionMutation } from '@contember/bindx'
import { ClientPrimaryOrderError, orderClientPrimaryCreates } from '../../../packages/bindx/src/persistence/orderClientPrimaryCreates.js'

const keys = new Set(['key-root', 'key-other'])

describe('orderClientPrimaryCreates', () => {
	test('should move a list element after the element that creates the row it connects', () => {
		const ordered = orderClientPrimaryCreates([{
			entityType: 'Website',
			entityId: 'website-1',
			operation: 'update',
			data: {
				sections: [
					{ create: { name: 'A', parent: { connect: { id: 'key-root' } } }, alias: 'a' },
					{ create: { id: 'key-root', name: 'Root' }, alias: 'root' },
				],
			},
		}], keys)

		expect(ordered[0]?.data?.['sections']).toEqual([
			{ create: { id: 'key-root', name: 'Root' }, alias: 'root' },
			{ create: { name: 'A', parent: { connect: { id: 'key-root' } } }, alias: 'a' },
		])
	})

	test('should move a top-level mutation after the one creating the row it connects', () => {
		const ordered = orderClientPrimaryCreates([
			{ entityType: 'Article', entityId: 'article-2', operation: 'update', data: { tags: [{ connect: { id: 'key-root' } }] } },
			{ entityType: 'Article', entityId: 'article-1', operation: 'update', data: { tags: [{ create: { id: 'key-root', name: 'New' } }] } },
		], keys)

		expect(ordered.map(mutation => mutation.entityId)).toEqual(['article-1', 'article-2'])
	})

	test('should keep the order of mutations without client keys', () => {
		const mutations: TransactionMutation[] = [
			{ entityType: 'Article', entityId: 'b', operation: 'update', data: { title: 'b' } },
			{ entityType: 'Article', entityId: 'a', operation: 'update', data: { title: 'a' } },
		]

		expect(orderClientPrimaryCreates(mutations, keys)).toEqual(mutations)
	})

	test('should refuse elements that create and connect each other\'s rows in a cycle', () => {
		expect(() => orderClientPrimaryCreates([{
			entityType: 'Website',
			entityId: 'website-1',
			operation: 'update',
			data: {
				sections: [
					{ create: { id: 'key-root', parent: { connect: { id: 'key-other' } } } },
					{ create: { id: 'key-other', parent: { connect: { id: 'key-root' } } } },
				],
			},
		}], keys)).toThrow(ClientPrimaryOrderError)
	})

	test('should refuse a has-one of the owner connecting a row its own list creates', () => {
		// The owner's has-one runs before its row is written, its has-many after.
		expect(() => orderClientPrimaryCreates([{
			entityType: 'Website',
			entityId: 'website-1',
			operation: 'update',
			data: {
				homepage: { connect: { id: 'key-root' } },
				sections: [{ create: { id: 'key-root', name: 'Root' } }],
			},
		}], keys)).toThrow(ClientPrimaryOrderError)
	})
})
