/**
 * After $add() + persist, list item accessors report the server id, not the dead temp id.
 */
import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
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
} from '@contember/bindx-react'

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
	test('reports the persisted id after $add + persist', async () => {
		const adapter = new MockAdapter({
			Author: {
				'author-1': { id: 'author-1', name: 'John Doe' },
			},
		}, { delay: 0 })

		let addAuthor: (() => string) | null = null
		let persistAll: (() => Promise<unknown>) | null = null
		let renderedIds: string[] = []
		let readPersistedId: ((tempId: string) => string | null) | null = null

		function List(): React.ReactElement {
			const store = useSnapshotStore()
			const persist = usePersist()
			readPersistedId = (id) => store.getPersistedId('Author', id)
			const authors = useEntityList(authorDef, {}, a => a.id().name())
			persistAll = () => persist.persistAll()
			if (authors.$status !== 'ready') return <div data-testid="loading" />
			addAuthor = () => authors.$add({ name: 'Fresh' })
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
		expect(container.querySelectorAll('[data-testid="row"]')[1]!.textContent).toBe('Fresh')
	})
})
