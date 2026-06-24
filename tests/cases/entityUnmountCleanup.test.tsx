import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React, { StrictMode } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	hasOne,
	hasMany,
	Entity,
	useBindxContext,
	useEntityList,
	type SnapshotStore,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Author { id: string; name: string }
interface Article { id: string; title: string; author: Author; tags: Tag[] }
interface Tag { id: string; label: string }

interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author'),
				tags: hasMany('Tag'),
			},
		},
		Author: { fields: { id: scalar(), name: scalar() } },
		Tag: { fields: { id: scalar(), label: scalar() } },
	},
})

const entityDefs = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
	Tag: entityDef<Tag>('Tag'),
} as const

function CaptureStore({ onStore }: { onStore: (s: SnapshotStore) => void }): null {
	onStore(useBindxContext().store)
	return null
}

const isCreate = (store: SnapshotStore, type: string, id: string): boolean =>
	store.getAllDirtyEntities().some(e => e.entityType === type && e.entityId === id && e.changeType === 'create')

describe('Entity create-mode unmount cleanup', () => {
	test('discards a never-persisted draft on unmount', async () => {
		const adapter = new MockAdapter({})
		let store!: SnapshotStore
		let draftId!: string

		const { unmount } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<CaptureStore onStore={s => { store = s }} />
				<Entity entity={entityDefs.Author} create>
					{author => { draftId = author.id; return <span data-testid="a">{author.id}</span> }}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => expect(store.hasEntity('Author', draftId)).toBe(true))
		expect(isCreate(store, 'Author', draftId)).toBe(true)

		act(() => { unmount() })

		// The draft (a top-level root referenced by nothing) is reclaimed.
		expect(store.hasEntity('Author', draftId)).toBe(false)
		expect(isCreate(store, 'Author', draftId)).toBe(false)
	})

	test('leaves a persisted (rekeyed) entity untouched on unmount', async () => {
		const adapter = new MockAdapter({})
		let store!: SnapshotStore
		let draftId!: string

		const { unmount } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<CaptureStore onStore={s => { store = s }} />
				<Entity entity={entityDefs.Author} create>
					{author => { draftId = author.id; return <span data-testid="a">{author.id}</span> }}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => expect(store.hasEntity('Author', draftId)).toBe(true))

		// Simulate a successful persist: temp id rekeyed to a server id.
		act(() => { store.mapTempIdToPersistedId('Author', draftId, 'author-server-1') })

		act(() => { unmount() })

		// The now-persisted entity must survive the unmount.
		expect(store.hasEntity('Author', 'author-server-1')).toBe(true)
	})

	test('preserves a draft still referenced by another live parent (diamond)', async () => {
		const adapter = new MockAdapter({})
		let store!: SnapshotStore
		let draftId!: string

		const { unmount } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<CaptureStore onStore={s => { store = s }} />
				<Entity entity={entityDefs.Author} create>
					{author => { draftId = author.id; return <span data-testid="a">{author.id}</span> }}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => expect(store.hasEntity('Author', draftId)).toBe(true))

		// Meanwhile the draft is connected into a live server parent (un-roots it).
		act(() => {
			store.setEntityData('Article', 'art-1', { id: 'art-1', title: 'T' }, true)
			store.setRelation('Article', 'art-1', 'author', { currentId: draftId, state: 'connected' })
			store.registerParentChild('Article', 'art-1', 'Author', draftId)
		})

		act(() => { unmount() })

		// The form unmounted, but the draft is still reachable through art-1 — it must
		// survive and remain a pending create (the diamond / shared-create case).
		expect(store.hasEntity('Author', draftId)).toBe(true)
		expect(isCreate(store, 'Author', draftId)).toBe(true)
	})

	test('survives a React StrictMode mount cycle (re-seeds the draft)', async () => {
		const adapter = new MockAdapter({})
		let store!: SnapshotStore
		let draftId!: string

		render(
			<StrictMode>
				<BindxProvider adapter={adapter} schema={schema}>
					<CaptureStore onStore={s => { store = s }} />
					<Entity entity={entityDefs.Author} create>
						{author => { draftId = author.id; return <span data-testid="a">{author.id}</span> }}
					</Entity>
				</BindxProvider>
			</StrictMode>,
		)

		// StrictMode runs mount→cleanup→mount; the cleanup removes the draft, so the
		// re-seed must re-establish it under the same id or the form is bound to a
		// phantom entity.
		await waitFor(() => expect(store.hasEntity('Author', draftId)).toBe(true))
		expect(isCreate(store, 'Author', draftId)).toBe(true)
	})
})

describe('useEntityList unmount cleanup', () => {
	test('discards a never-persisted list draft on unmount', async () => {
		const adapter = new MockAdapter({})
		let store!: SnapshotStore
		let draftId: string | undefined

		function List(): React.ReactElement {
			const list = useEntityList(entityDefs.Author, {}, a => a.name())
			return (
				<button
					data-testid="add"
					data-status={list.$status}
					onClick={() => { draftId = list.$add({ name: 'draft' }) }}
				>
					add
				</button>
			)
		}

		const { container, unmount } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<CaptureStore onStore={s => { store = s }} />
				<List />
			</BindxProvider>,
		)

		// Wait until the list has loaded (its empty server page) before adding.
		await waitFor(() =>
			expect(container.querySelector('[data-testid="add"]')?.getAttribute('data-status')).toBe('ready'),
		)

		act(() => { (container.querySelector('[data-testid="add"]') as HTMLButtonElement).click() })
		expect(draftId).toBeDefined()
		expect(store.hasEntity('Author', draftId!)).toBe(true)

		act(() => { unmount() })

		expect(store.hasEntity('Author', draftId!)).toBe(false)
		expect(isCreate(store, 'Author', draftId!)).toBe(false)
	})
})
