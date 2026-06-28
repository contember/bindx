import '../setup'
import { describe, test, expect, afterEach, spyOn } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React, { useEffect } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	Entity,
	useBindxContext,
	type SnapshotStore,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Author { id: string; name: string }
interface TestSchema { Author: Author }

const schema = defineSchema<TestSchema>({
	entities: {
		Author: { fields: { id: scalar(), name: scalar() } },
	},
})

const entityDefs = { Author: entityDef<Author>('Author') } as const

function CaptureStore({ onStore }: { onStore: (s: SnapshotStore) => void }): null {
	onStore(useBindxContext().store)
	return null
}

/**
 * Subscribes to the whole store the way an app-shell aggregate subscriber does
 * (e.g. `usePersist`'s dirty tracking, which calls `store.subscribe`). Counts the
 * raw notifications it receives.
 */
function GlobalSubscriber({ onNotify }: { onNotify: () => void }): null {
	const { store } = useBindxContext()
	useEffect(() => store.subscribe(onNotify), [store, onNotify])
	return null
}

function Harness({ showCreate, onNotify, onStore }: { showCreate: boolean; onNotify: () => void; onStore: (s: SnapshotStore) => void }) {
	const adapter = React.useMemo(() => new MockAdapter({}), [])
	return (
		<BindxProvider adapter={adapter} schema={schema}>
			<CaptureStore onStore={onStore} />
			<GlobalSubscriber onNotify={onNotify} />
			{showCreate && (
				<Entity entity={entityDefs.Author} create>
					{author => <span data-testid="create-form">{author.id}</span>}
				</Entity>
			)}
		</BindxProvider>
	)
}

describe('Entity create-mode beside a global store subscriber', () => {
	// Regression: <Entity create> must mint its draft AFTER commit (in a layout
	// effect), never during render. A render-phase store mutation force-updates an
	// already-mounted aggregate subscriber (e.g. usePersist in the app shell)
	// mid-render — React rejects it ("Cannot update a component while rendering a
	// different component") and the create form renders blank. Deferring to a layout
	// effect keeps render pure; the draft is still created (before paint) and its
	// creation notifies subscribers normally, so dirty/save state never goes stale.
	test('renders beside a global subscriber and keeps its dirty state consistent', async () => {
		let store!: SnapshotStore
		let notifications = 0
		const onNotify = () => { notifications++ }

		// The subscriber is mounted + subscribed BEFORE the create form appears — the
		// app-shell condition that triggers the bug.
		const { rerender, getByTestId } = render(
			<Harness showCreate={false} onNotify={onNotify} onStore={s => { store = s }} />,
		)
		await waitFor(() => expect(store).toBeDefined())

		const errorSpy = spyOn(console, 'error')
		try {
			// Count only what mounting the create form causes.
			notifications = 0
			rerender(<Harness showCreate={true} onNotify={onNotify} onStore={s => { store = s }} />)

			// 1. The form body renders (the bug's symptom is an empty form).
			await waitFor(() => expect(getByTestId('create-form')).toBeTruthy())

			// 2. React never logged a cross-component update during render.
			const setStateDuringRender = errorSpy.mock.calls.find(call =>
				call.some(arg => typeof arg === 'string' && arg.includes('while rendering a different component')),
			)
			expect(setStateDuringRender).toBeUndefined()
		} finally {
			errorSpy.mockRestore()
		}

		// 3. The draft really exists as a pending create AND the pre-existing global
		//    subscriber was notified of it — no stale dirty/save state. (This fails if
		//    the creation is made silent, e.g. a `skipNotify` shortcut, or never
		//    happens, e.g. a blank form.)
		expect(store.getAllDirtyEntities().some(e => e.entityType === 'Author' && e.changeType === 'create')).toBe(true)
		expect(notifications).toBeGreaterThan(0)
	})
})
