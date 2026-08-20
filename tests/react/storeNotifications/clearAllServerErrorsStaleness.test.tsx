// KNOWN-BROKEN PIN — the `test.failing` case below asserts what the user should
// see. Bun reports it as passing while `SnapshotStore.clearAllServerErrors` stays
// silent, and turns it into a failure the moment it notifies, which forces
// whoever fixes it to drop the `.failing` marker. The assertions are the real
// symptom; nothing was relaxed to fit the marker.
//
// `clearAllServerErrors` (packages/bindx/src/store/SnapshotStore.ts) clears the
// entity's server errors without calling notifyEntitySubscribers, unlike its
// sibling `clearAllErrors`. Every React consumer of errors reaches them through a
// store subscription — `useField(...).errors` here, and the framework's own
// `useEntityErrors` hook the same way — so with no notification React never
// re-renders and the component keeps painting an error the store no longer holds.
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
	test.failing('the field error disappears from the DOM when the store clears it (known broken)', async () => {
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

		// What the user sees: still "Name is already taken", because nothing notified.
		expect(getByTestId('errors').textContent).toBe('no-errors')
	})

	// Characterization of the only in-tree caller (BatchPersister, at the top of
	// persist: setPersisting(true) immediately followed by clearAllServerErrors).
	// The preceding notification is what re-renders the subtree; React re-reads the
	// errors at render time, by which point the silent clear has already happened.
	// This is why the framework's own persist path does not show the staleness.
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
