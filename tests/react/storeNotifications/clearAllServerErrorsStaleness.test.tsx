// Regression: `clearAllServerErrors` (packages/bindx/src/store/SnapshotStore.ts)
// used to clear the entity's server errors without calling notifyEntitySubscribers,
// unlike its sibling `clearAllErrors`. Every React consumer of errors reaches them
// through a store subscription — `useField(...).errors` here, and the framework's
// own `useEntityErrors` hook the same way — so React never re-rendered and the
// component kept painting an error the store no longer held. The clear now
// notifies; this test guards that the error leaves the DOM.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Entity,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useBindxContext,
	useField,
	type FieldRef,
	type SnapshotStore,
} from '@contember/bindx-react'
import { createServerError } from '@contember/bindx'

afterEach(() => {
	cleanup()
})

interface Author {
	id: string
	name: string
}

interface AuthorSchema {
	Author: Author
}

const schema = defineSchema<AuthorSchema>({
	entities: {
		Author: { fields: { id: scalar(), name: scalar() } },
	},
})

const entityDefs = { Author: entityDef<Author>('Author') } as const

const mockData = {
	Author: { 'author-1': { id: 'author-1', name: 'Ada' } },
}

function CaptureStore({ onStore }: { onStore: (store: SnapshotStore) => void }): null {
	onStore(useBindxContext().store)
	return null
}

/**
 * A field-error display, written the way an app writes one: subscribe to the
 * field through the public accessor hook and render its error messages.
 */
function NameErrors({ field }: { field: FieldRef<string> }): React.ReactElement {
	const name = useField(field)
	const messages = name.errors.map(e => e.message).join('|')
	return <span data-testid="errors">{messages === '' ? 'no-errors' : messages}</span>
}

function renderAuthorForm(onStore: (store: SnapshotStore) => void): ReturnType<typeof render> {
	return render(
		<BindxProvider adapter={new MockAdapter(mockData, { delay: 0 })} schema={schema}>
			<CaptureStore onStore={onStore} />
			<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
				{author => <NameErrors field={author.name} />}
			</Entity>
		</BindxProvider>,
	)
}

describe('clearAllServerErrors leaves the rendered error stale', () => {
	test('the field error disappears from the DOM when the store clears it', async () => {
		let store!: SnapshotStore
		const { getByTestId } = renderAuthorForm(s => { store = s })

		await waitFor(() => expect(getByTestId('errors').textContent).toBe('no-errors'))

		// A failed persist put a server error on the field; the form shows it.
		act(() => {
			store.addFieldError('Author', 'author-1', 'name', createServerError('Name is already taken'))
		})
		expect(getByTestId('errors').textContent).toBe('Name is already taken')

		// The store drops every server error for the entity.
		act(() => {
			store.clearAllServerErrors('Author', 'author-1')
		})

		// Truth in the store: the error is gone.
		expect(store.getFieldErrors('Author', 'author-1', 'name')).toEqual([])
		expect(store.hasAnyErrors('Author', 'author-1')).toBe(false)

		// What the user sees: the error is gone too, because the clear notifies.
		expect(getByTestId('errors').textContent).toBe('no-errors')
	})

	// Characterization of the only in-tree caller (BatchPersister, at the top of
	// persist: setPersisting(true) immediately followed by clearAllServerErrors).
	// The preceding notification re-renders the subtree on its own, which is why the
	// framework's own persist path never showed the staleness even while the clear
	// was silent. The sequence must keep working now that the clear notifies too.
	test('characterization: a notifying write immediately before the clear hides the bug', async () => {
		let store!: SnapshotStore
		const { getByTestId } = renderAuthorForm(s => { store = s })

		await waitFor(() => expect(getByTestId('errors').textContent).toBe('no-errors'))

		act(() => {
			store.addFieldError('Author', 'author-1', 'name', createServerError('Name is already taken'))
		})
		expect(getByTestId('errors').textContent).toBe('Name is already taken')

		act(() => {
			// The BatchPersister sequence, in order.
			store.setPersisting('Author', 'author-1', true)
			store.clearAllServerErrors('Author', 'author-1')
		})

		expect(getByTestId('errors').textContent).toBe('no-errors')
	})
})
