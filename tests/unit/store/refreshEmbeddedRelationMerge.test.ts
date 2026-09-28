// Regression tests for https://github.com/contember/bindx/issues/123
import { describe, test, expect, beforeEach } from 'bun:test'
import type { SelectionMeta, SnapshotStore } from '@contember/bindx'
import { __internal } from '@contember/bindx-react'
import { createTestStore } from '../shared/unitTestHelpers.js'

const { createSelectionBuilder, getSelectionMeta } = __internal

interface StoredFile {
	id: string
	url: string
	size: number
}

interface Attachment {
	id: string
	name: string
	type: string
	file: StoredFile | null
}

interface Author {
	id: string
	name: string
	email: string
}

interface Article {
	id: string
	title: string
	settings: { id: string; mode: string; extra?: string } | null
	attachments: Attachment[]
	author: Author | null
}

const narrowAttachments = getSelectionMeta(createSelectionBuilder<Article>().id().attachments(a => a.id().name()))
const narrowAuthor = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()))

const wideArticle = (): Record<string, unknown> => ({
	id: 's-1',
	title: 'Article',
	attachments: [
		{ id: 'att-1', name: 'Slides', type: 'pdf' },
		{ id: 'att-2', name: 'Notes', type: 'docx' },
	],
	author: { id: 'au-1', name: 'Ann', email: 'ann@example.com' },
})

describe('SnapshotStore.refreshServerData — embedded relations read with a narrower selection', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
		store.setEntityData('Article', 's-1', wideArticle(), true)
	})

	test('keeps has-many item fields the narrower selection did not ask for', () => {
		store.refreshServerData('Article', 's-1', {
			id: 's-1',
			attachments: [
				{ id: 'att-1', name: 'Slides v2' },
				{ id: 'att-2', name: 'Notes' },
			],
		}, false, narrowAttachments)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		const expected = [
			{ id: 'att-1', name: 'Slides v2', type: 'pdf' },
			{ id: 'att-2', name: 'Notes', type: 'docx' },
		]
		expect(snapshot?.serverData?.['attachments']).toEqual(expected)
		expect(snapshot?.data['attachments']).toEqual(expected)
		expect(snapshot?.data['title']).toBe('Article')
	})

	test('takes has-many membership and order from the server read', () => {
		store.refreshServerData('Article', 's-1', {
			id: 's-1',
			attachments: [
				{ id: 'att-3', name: 'Handout' },
				{ id: 'att-1', name: 'Slides' },
			],
		}, false, narrowAttachments)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['attachments']).toEqual([
			{ id: 'att-3', name: 'Handout' },
			{ id: 'att-1', name: 'Slides', type: 'pdf' },
		])
	})

	test('keeps has-one fields the narrower selection did not ask for while the target is the same', () => {
		store.refreshServerData('Article', 's-1', { id: 's-1', author: { id: 'au-1', name: 'Anna' } }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['author']).toEqual({ id: 'au-1', name: 'Anna', email: 'ann@example.com' })
	})

	test('replaces a has-one that points to another entity', () => {
		store.refreshServerData('Article', 's-1', { id: 's-1', author: { id: 'au-2', name: 'Bob' } }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['author']).toEqual({ id: 'au-2', name: 'Bob' })
	})

	test('replaces a has-one the server read disconnected', () => {
		store.refreshServerData('Article', 's-1', { id: 's-1', author: null }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['author']).toBeNull()
	})

	test('replaces an object-valued scalar even when it carries an id', () => {
		store.setEntityData('Article', 's-1', { ...wideArticle(), settings: { id: 'x', mode: 'a', extra: 'stale' } }, true)
		// A JSON column: selected as a scalar, although its value is an object with an `id`.
		const withSettings: SelectionMeta = {
			fields: new Map([
				['id', { fieldName: 'id', alias: 'id', path: ['id'], isRelation: false, isArray: false }],
				['settings', { fieldName: 'settings', alias: 'settings', path: ['settings'], isRelation: false, isArray: false }],
			]),
		}

		store.refreshServerData('Article', 's-1', { id: 's-1', settings: { id: 'x', mode: 'b' } }, false, withSettings)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['settings']).toEqual({ id: 'x', mode: 'b' })
	})

	test('replaces relation data wholesale when no selection is given', () => {
		store.refreshServerData('Article', 's-1', { id: 's-1', attachments: [{ id: 'att-1', name: 'Slides' }] })

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['attachments']).toEqual([{ id: 'att-1', name: 'Slides' }])
	})

	test('leaves the entity clean and keeps a dirty scalar edit', () => {
		store.setFieldValue('Article', 's-1', ['title'], 'Local edit')

		store.refreshServerData('Article', 's-1', {
			id: 's-1',
			title: 'Server title',
			attachments: [{ id: 'att-1', name: 'Slides' }],
		}, false, getSelectionMeta(createSelectionBuilder<Article>().id().title().attachments(a => a.id().name())))

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['title']).toBe('Local edit')
		expect(snapshot?.serverData?.['title']).toBe('Server title')
		expect(snapshot?.data['attachments']).toBe(snapshot?.serverData?.['attachments'])

		store.resetEntity('Article', 's-1')
		const reset = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(reset?.data['title']).toBe('Server title')
		expect(reset?.data['attachments']).toEqual([{ id: 'att-1', name: 'Slides', type: 'pdf' }])
	})

	test('prefers the related entity\'s own snapshot over the embedded copy for keys it did not read', () => {
		// The attachment moved on after the article was read: persisted, or read through another path.
		store.setEntityData('Attachment', 'att-1', { id: 'att-1', name: 'Slides', type: 'xlsx' }, true)

		store.refreshServerData('Article', 's-1', {
			id: 's-1',
			attachments: [{ id: 'att-1', name: 'Slides' }, { id: 'att-2', name: 'Notes' }],
		}, false, narrowAttachments)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['attachments']).toEqual([
			{ id: 'att-1', name: 'Slides', type: 'xlsx' },
			{ id: 'att-2', name: 'Notes', type: 'docx' },
		])
	})

	test('prefers the related has-one entity\'s own snapshot over the embedded copy', () => {
		store.setEntityData('Author', 'au-1', { id: 'au-1', name: 'Ann', email: 'ann@example.org' }, true)

		store.refreshServerData('Article', 's-1', { id: 's-1', author: { id: 'au-1', name: 'Ann' } }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['author']).toEqual({ id: 'au-1', name: 'Ann', email: 'ann@example.org' })
	})

	test('merges a relation inside a relation', () => {
		store.setEntityData('Article', 's-1', {
			id: 's-1',
			attachments: [{ id: 'att-1', name: 'Slides', file: { id: 'f-1', url: '/a.pdf', size: 42 } }],
		}, true)

		store.refreshServerData('Article', 's-1', {
			id: 's-1',
			attachments: [{ id: 'att-1', file: { id: 'f-1', url: '/b.pdf' } }],
		}, false, getSelectionMeta(createSelectionBuilder<Article>().id().attachments(a => a.id().file(f => f.id().url()))))

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['attachments']).toEqual([{ id: 'att-1', name: 'Slides', file: { id: 'f-1', url: '/b.pdf', size: 42 } }])
	})

	test('merges an aliased has-many selected with params and keeps its total count', () => {
		const withParams = getSelectionMeta(
			createSelectionBuilder<Article>().id().attachments({ orderBy: [{ name: 'asc' }], limit: 1, totalCount: true }, a => a.id().name()),
		)
		const alias = [...withParams.fields.values()].find(field => field.fieldName === 'attachments')?.alias
		if (!alias || alias === 'attachments') throw new Error('Expected an aliased has-many')
		store.setEntityData('Article', 's-1', { id: 's-1', [alias]: [{ id: 'att-1', name: 'Slides', type: 'pdf' }] }, true)

		const incomingItems = [{ id: 'att-1', name: 'Slides v2' }]
		Object.defineProperty(incomingItems, 'totalCount', { value: 2, enumerable: false, writable: false })
		store.refreshServerData('Article', 's-1', { id: 's-1', [alias]: incomingItems }, false, withParams)

		const merged = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')?.data[alias]
		expect(merged).toEqual([{ id: 'att-1', name: 'Slides v2', type: 'pdf' }])
		expect(Object.getOwnPropertyDescriptor(merged, 'totalCount')).toEqual({ value: 2, enumerable: false, writable: false, configurable: false })
	})

	test('merges the nodes of a connection by id', () => {
		store.setEntityData('Article', 's-1', {
			id: 's-1',
			attachments: { pageInfo: { totalCount: 1 }, edges: [{ node: { id: 'att-1', name: 'Slides', type: 'pdf' } }] },
		}, true)

		store.refreshServerData('Article', 's-1', {
			id: 's-1',
			attachments: { pageInfo: { totalCount: 2 }, edges: [{ node: { id: 'att-2', name: 'Notes' } }, { node: { id: 'att-1', name: 'Slides' } }] },
		}, false, narrowAttachments)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')
		expect(snapshot?.data['attachments']).toEqual({
			pageInfo: { totalCount: 2 },
			edges: [{ node: { id: 'att-2', name: 'Notes' } }, { node: { id: 'att-1', name: 'Slides', type: 'pdf' } }],
		})
	})

	test('stores the incoming relation value itself when it leaves nothing to keep', () => {
		const incoming = [
			{ id: 'att-1', name: 'Slides', type: 'pdf' },
			{ id: 'att-2', name: 'Notes', type: 'docx' },
		]

		store.refreshServerData('Article', 's-1', { id: 's-1', attachments: incoming }, false,
			getSelectionMeta(createSelectionBuilder<Article>().id().attachments(a => a.id().name().type())))

		expect(store.getEntitySnapshot<Record<string, unknown>>('Article', 's-1')?.serverData['attachments']).toBe(incoming)
	})
})
