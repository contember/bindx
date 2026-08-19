import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useEntityList,
	useField,
	useSnapshotStore,
	type EntityAccessor,
} from '@contember/bindx-react'

// store.clear() is the logout / provider-teardown / schema-switch path. Accessor identity is
// stable, so a memoized row cannot learn the store was wiped from a parent re-render — the
// notification has to reach the subscription it was told to register.

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

function createMockData() {
	return {
		Author: {
			'author-1': { id: 'author-1', name: 'John Doe' },
		},
	}
}

describe('store.clear() with a subscribed list row', () => {
	test('notifies entity subscribers so a memoized row stops rendering wiped data', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let clearStore: (() => void) | null = null

		interface RowProps {
			item: EntityAccessor<{ id: string; name: string }>
		}

		const Row = React.memo(function Row({ item }: RowProps): React.ReactElement {
			const name = useField(item.name)
			return <span data-testid="row">{name.value ?? 'empty'}</span>
		})

		function List(): React.ReactElement {
			const store = useSnapshotStore()
			const authors = useEntityList(authorDef, {}, a => a.id().name())
			clearStore = () => store.clear()
			if (authors.$status !== 'ready') return <div data-testid="loading" />
			return <Row item={authors.items[0]!} />
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<List />
			</BindxProvider>,
		)

		const row = (): Element => {
			const el = container.querySelector('[data-testid="row"]')
			if (!el) throw new Error('Row not rendered')
			return el
		}

		await waitFor(() => expect(row().textContent).toBe('John Doe'))

		act(() => {
			clearStore!()
		})

		// The row subscribed exactly as the accessor contract prescribes; no consumer-side
		// subscription can compensate if clear() skips entity subscribers.
		await waitFor(() => expect(row().textContent).toBe('empty'))
	})
})
