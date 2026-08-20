// Both halves of the create-draft lifecycle, at the level the user sees.
//
// REGRESSION (first test): `createEntity` used to register the create-root after
// both of its notifying writes, and that registration is what makes the entity a
// `create` in getAllDirtyEntities(). A save indicator built on a global store
// subscription therefore showed "no unsaved changes" while the store held an
// unsaved draft. The root is now registered before the final setExistsOnServer, so
// the notification that closes the create carries the right count.
//
// CHARACTERIZATION (second test): the unmount half is sound.
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
	test('the save indicator counts the draft the store already holds', async () => {
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

		// What the user sees: the same count, because the root registration now
		// lands before the notification that announces the create.
		expect(getByTestId('dirty-count').textContent).toBe('1')
	})

	test('characterization: the save indicator drops back to 0 when the draft form unmounts', async () => {
		const adapter = new MockAdapter({}, { delay: 0 })
		let store!: SnapshotStore

		const { getByTestId, rerender } = render(
			<Harness adapter={adapter} showDraft={true} onStore={s => { store = s }} />,
		)
		await waitFor(() => expect(getByTestId('draft')).toBeTruthy())

		// Redundant now that the create notifies — kept so this test measures the
		// unmount path alone, whatever the create path does.
		act(() => { store.notify() })
		expect(getByTestId('dirty-count').textContent).toBe('1')

		// Unmounting the form runs unregisterRootEntity() + sweepUnreachableCreated().
		rerender(<Harness adapter={adapter} showDraft={false} onStore={s => { store = s }} />)

		expect(store.getAllDirtyEntities()).toHaveLength(0)
		expect(getByTestId('dirty-count').textContent).toBe('0')
	})
})
