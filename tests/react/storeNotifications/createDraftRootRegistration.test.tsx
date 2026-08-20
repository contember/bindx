// Two halves of the create-draft lifecycle, one broken and one sound.
//
// KNOWN-BROKEN PIN (first test, `test.failing`): it asserts what the user should
// see. Bun reports it as passing while the bug is present and turns it into a
// failure the moment the root registration starts notifying, which forces whoever
// fixes it to drop the `.failing` marker. The assertions are the real symptom;
// nothing was relaxed to fit the marker. `createEntity` writes in
// three steps — setEntityData (notifies), setExistsOnServer (notifies), and
// finally `roots.register()`, which is silent. A created entity only becomes a
// `create` in getAllDirtyEntities() at that third step, so both notifications
// carry the OLD value (0 dirty) and the value that matters is never announced.
// A save indicator built on a global store subscription therefore shows "no
// unsaved changes" while the store holds an unsaved draft, until some unrelated
// write happens to notify.
//
// CHARACTERIZATION (second test, PASSES): the unmount half is sound.
// `unregisterRootEntity` was investigated as a suspected staleness bug and is
// NOT one: it is equally silent, but its callers (Entity.tsx's cleanup,
// useEntityList.ts's draft cleanup) run `sweepUnreachableCreated()` on the next
// line, and the sweep notifies through `removeEntity` for everything it drops.
//
// The consumer in both is the shape every dirty/save indicator has: a global
// subscription over `getAllDirtyEntities()` (what usePersist does internally).
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React, { useCallback, useSyncExternalStore } from 'react'
import {
	BindxProvider,
	Entity,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useBindxContext,
	type BackendAdapter,
	type SnapshotStore,
} from '@contember/bindx-react'

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

function CaptureStore({ onStore }: { onStore: (store: SnapshotStore) => void }): null {
	onStore(useBindxContext().store)
	return null
}

/** An app-shell save indicator: global subscription over the dirty set. */
function DirtyCount(): React.ReactElement {
	const { store } = useBindxContext()
	const subscribe = useCallback((callback: () => void) => store.subscribe(callback), [store])
	const getSnapshot = useCallback(() => store.getAllDirtyEntities().length, [store])
	const count = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
	return <span data-testid="dirty-count">{count}</span>
}

interface HarnessProps {
	adapter: BackendAdapter
	showDraft: boolean
	onStore: (store: SnapshotStore) => void
}

function Harness({ adapter, showDraft, onStore }: HarnessProps): React.ReactElement {
	return (
		<BindxProvider adapter={adapter} schema={schema}>
			<CaptureStore onStore={onStore} />
			<DirtyCount />
			{showDraft && (
				<Entity entity={entityDefs.Author} create>
					{author => <span data-testid="draft">{author.id}</span>}
				</Entity>
			)}
		</BindxProvider>
	)
}

describe('create-draft root registration and cleanup', () => {
	test.failing('the save indicator counts the draft the store already holds (known broken)', async () => {
		const adapter = new MockAdapter({}, { delay: 0 })
		let store!: SnapshotStore

		const { getByTestId, rerender } = render(
			<Harness adapter={adapter} showDraft={false} onStore={s => { store = s }} />,
		)
		expect(getByTestId('dirty-count').textContent).toBe('0')

		rerender(<Harness adapter={adapter} showDraft={true} onStore={s => { store = s }} />)
		await waitFor(() => expect(getByTestId('draft')).toBeTruthy())

		// Truth in the store: one unsaved create.
		expect(store.getAllDirtyEntities()).toHaveLength(1)

		// What the user sees: still "0 unsaved changes", because the root
		// registration that made it a create notified nobody.
		expect(getByTestId('dirty-count').textContent).toBe('1')
	})

	test('characterization: the save indicator drops back to 0 when the draft form unmounts', async () => {
		const adapter = new MockAdapter({}, { delay: 0 })
		let store!: SnapshotStore

		const { getByTestId, rerender } = render(
			<Harness adapter={adapter} showDraft={true} onStore={s => { store = s }} />,
		)
		await waitFor(() => expect(getByTestId('draft')).toBeTruthy())

		// Sync the indicator past the missing create notification (the bug covered by
		// the test above) so this one measures the unmount path alone.
		act(() => { store.notify() })
		expect(getByTestId('dirty-count').textContent).toBe('1')

		// Unmounting the form runs unregisterRootEntity() + sweepUnreachableCreated().
		rerender(<Harness adapter={adapter} showDraft={false} onStore={s => { store = s }} />)

		expect(store.getAllDirtyEntities()).toHaveLength(0)
		expect(getByTestId('dirty-count').textContent).toBe('0')
	})
})
