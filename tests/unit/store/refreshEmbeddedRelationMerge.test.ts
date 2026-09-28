// Regression tests for https://github.com/contember/bindx/issues/123
import { describe, test, expect, beforeEach } from 'bun:test'
import type { SelectionMeta, SnapshotStore } from '@contember/bindx'
import { __internal } from '@contember/bindx-react'
import { createTestStore } from '../shared/unitTestHelpers.js'

const { createSelectionBuilder, getSelectionMeta } = __internal

interface Attachment {
	id: string
	name: string
	type: string
}

interface Author {
	id: string
	name: string
	email: string
}

interface Session {
	id: string
	title: string
	settings: { id: string; mode: string; extra?: string } | null
	attachments: Attachment[]
	author: Author | null
}

const narrowAttachments = getSelectionMeta(createSelectionBuilder<Session>().id().attachments(a => a.id().name()))
const narrowAuthor = getSelectionMeta(createSelectionBuilder<Session>().id().author(a => a.id().name()))

const wideSession = (): Record<string, unknown> => ({
	id: 's-1',
	title: 'Session',
	attachments: [
		{ id: 'att-1', name: 'Slides', type: 'learningMaterial' },
		{ id: 'att-2', name: 'Notes', type: 'internal' },
	],
	author: { id: 'au-1', name: 'Ann', email: 'ann@example.com' },
})

describe('SnapshotStore.refreshServerData — embedded relations read with a narrower selection', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
		store.setEntityData('Session', 's-1', wideSession(), true)
	})

	test('keeps has-many item fields the narrower selection did not ask for', () => {
		store.refreshServerData('Session', 's-1', {
			id: 's-1',
			attachments: [
				{ id: 'att-1', name: 'Slides v2' },
				{ id: 'att-2', name: 'Notes' },
			],
		}, false, narrowAttachments)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		const expected = [
			{ id: 'att-1', name: 'Slides v2', type: 'learningMaterial' },
			{ id: 'att-2', name: 'Notes', type: 'internal' },
		]
		expect(snapshot?.serverData?.['attachments']).toEqual(expected)
		expect(snapshot?.data['attachments']).toEqual(expected)
		expect(snapshot?.data['title']).toBe('Session')
	})

	test('takes has-many membership and order from the server read', () => {
		store.refreshServerData('Session', 's-1', {
			id: 's-1',
			attachments: [
				{ id: 'att-3', name: 'Handout' },
				{ id: 'att-1', name: 'Slides' },
			],
		}, false, narrowAttachments)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['attachments']).toEqual([
			{ id: 'att-3', name: 'Handout' },
			{ id: 'att-1', name: 'Slides', type: 'learningMaterial' },
		])
	})

	test('keeps has-one fields the narrower selection did not ask for while the target is the same', () => {
		store.refreshServerData('Session', 's-1', { id: 's-1', author: { id: 'au-1', name: 'Anna' } }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['author']).toEqual({ id: 'au-1', name: 'Anna', email: 'ann@example.com' })
	})

	test('replaces a has-one that points to another entity', () => {
		store.refreshServerData('Session', 's-1', { id: 's-1', author: { id: 'au-2', name: 'Bob' } }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['author']).toEqual({ id: 'au-2', name: 'Bob' })
	})

	test('replaces a has-one the server read disconnected', () => {
		store.refreshServerData('Session', 's-1', { id: 's-1', author: null }, false, narrowAuthor)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['author']).toBeNull()
	})

	test('replaces an object-valued scalar even when it carries an id', () => {
		store.setEntityData('Session', 's-1', { ...wideSession(), settings: { id: 'x', mode: 'a', extra: 'stale' } }, true)
		// A JSON column: selected as a scalar, although its value is an object with an `id`.
		const withSettings: SelectionMeta = {
			fields: new Map([
				['id', { fieldName: 'id', alias: 'id', path: ['id'], isRelation: false, isArray: false }],
				['settings', { fieldName: 'settings', alias: 'settings', path: ['settings'], isRelation: false, isArray: false }],
			]),
		}

		store.refreshServerData('Session', 's-1', { id: 's-1', settings: { id: 'x', mode: 'b' } }, false, withSettings)

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['settings']).toEqual({ id: 'x', mode: 'b' })
	})

	test('replaces relation data wholesale when no selection is given', () => {
		store.refreshServerData('Session', 's-1', { id: 's-1', attachments: [{ id: 'att-1', name: 'Slides' }] })

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['attachments']).toEqual([{ id: 'att-1', name: 'Slides' }])
	})

	test('leaves the entity clean and keeps a dirty scalar edit', () => {
		store.setFieldValue('Session', 's-1', ['title'], 'Local edit')

		store.refreshServerData('Session', 's-1', {
			id: 's-1',
			title: 'Server title',
			attachments: [{ id: 'att-1', name: 'Slides' }],
		}, false, getSelectionMeta(createSelectionBuilder<Session>().id().title().attachments(a => a.id().name())))

		const snapshot = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(snapshot?.data['title']).toBe('Local edit')
		expect(snapshot?.serverData?.['title']).toBe('Server title')
		expect(snapshot?.data['attachments']).toBe(snapshot?.serverData?.['attachments'])

		store.resetEntity('Session', 's-1')
		const reset = store.getEntitySnapshot<Record<string, unknown>>('Session', 's-1')
		expect(reset?.data['title']).toBe('Server title')
		expect(reset?.data['attachments']).toEqual([{ id: 'att-1', name: 'Slides', type: 'learningMaterial' }])
	})
})
