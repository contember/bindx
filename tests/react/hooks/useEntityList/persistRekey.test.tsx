/**
 * After $add() + persist, list item accessors report the server id, not the dead temp id.
 */
import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { ActionDispatcher, EntityHandle, SchemaRegistry, SnapshotStore } from '@contember/bindx'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	isTempId,
	scalar,
	useEntityList,
	usePersist,
	useSnapshotStore,
	type EntityAccessor,
} from '@contember/bindx-react'
import { ItemAccessorCache } from '../../../../packages/bindx-react/src/hooks/ItemAccessorCache.js'

afterEach(() => {
	cleanup()
})

interface Author {
	id: string
	name: string
}

interface TestSchema {
	Author: Author
}

const schema = defineSchema<TestSchema>({
	entities: {
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const authorDef = entityDef<Author>('Author')

describe('useEntityList item accessor across temp -> persisted rekey', () => {
	test('prefers an existing persisted-key accessor when cache keys collide', () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schemaRegistry = new SchemaRegistry(schema)
		let redirectFrom = ''
		let redirectTo = ''
		const cache = new ItemAccessorCache(
			id => EntityHandle.createRaw(id, 'Author', store, dispatcher, schemaRegistry),
			id => id === redirectFrom ? redirectTo : id,
		)
		const initial = cache.build([{ id: 'temp' }, { id: 'persisted' }])
		const tempAccessor = initial[0]
		const persistedAccessor = initial[1]
		if (!tempAccessor || !persistedAccessor) throw new Error('Expected both cached accessors')

		redirectFrom = 'temp'
		redirectTo = 'persisted'
		const after = cache.build([{ id: 'temp' }])

		expect(after).toEqual([persistedAccessor])
		expect(after[0]).not.toBe(tempAccessor)
	})

	test('reports the persisted id after $add + persist', async () => {
		const adapter = new MockAdapter({
			Author: {
				'author-1': { id: 'author-1', name: 'John Doe' },
			},
		}, { delay: 0 })

		let addAuthor: (() => string) | null = null
		let persistAll: (() => Promise<unknown>) | null = null
		let renderedIds: string[] = []
		let renderedItems: Array<EntityAccessor<Author>> = []
		let removeAuthor: ((id: string) => void) | null = null
		let readPersistedId: ((tempId: string) => string | null) | null = null

		function List(): React.ReactElement {
			const store = useSnapshotStore()
			const persist = usePersist()
			readPersistedId = (id) => store.getPersistedId('Author', id)
			const authors = useEntityList(authorDef, {}, a => a.id().name())
			persistAll = () => persist.persistAll()
			if (authors.$status !== 'ready') return <div data-testid="loading" />
			addAuthor = () => authors.$add({ name: 'Fresh' })
			removeAuthor = id => authors.$remove(id)
			renderedItems = authors.items
			renderedIds = authors.items.map(item => item.id)
			return (
				<ul>
					{authors.items.map(item => (
						<li key={item.id} data-testid="row">{String(item.name.value)}</li>
					))}
				</ul>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<List />
			</BindxProvider>,
		)

		await waitFor(() => expect(container.querySelectorAll('[data-testid="row"]').length).toBe(1))

		let tempId = ''
		act(() => {
			tempId = addAuthor!()
		})
		await waitFor(() => expect(container.querySelectorAll('[data-testid="row"]').length).toBe(2))
		expect(renderedIds[1]).toBe(tempId)
		const draftAccessor = renderedItems[1]
		if (!draftAccessor) throw new Error('Expected the added draft accessor')

		await act(async () => {
			await persistAll!()
		})

		// The store rekeyed the draft to a server id...
		const persistedId = readPersistedId!(tempId)
		expect(persistedId).not.toBeNull()
		expect(persistedId).not.toBe(tempId)

		// ...and the accessor the list hands out must address the persisted entity.
		await waitFor(() => {
			expect(renderedIds[1]).toBe(persistedId!)
		})
		// The id is user-facing: React keys, routing, `useEntity({ by: { id } })` on a detail view.
		expect(isTempId(renderedIds[1]!)).toBe(false)
		expect(renderedItems[1]).toBe(draftAccessor)
		expect(container.querySelectorAll('[data-testid="row"]')[1]!.textContent).toBe('Fresh')

		act(() => {
			removeAuthor!(tempId)
		})
		await waitFor(() => expect(container.querySelectorAll('[data-testid="row"]').length).toBe(1))
	})
})
