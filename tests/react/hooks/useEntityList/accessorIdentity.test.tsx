import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useEntityList,
	useField,
	type EntityAccessor,
} from '@contember/bindx-react'

// Regression test for https://github.com/contember/bindx/issues/64
//
// useEntityList's getSnapshot invalidates its list cache on every store version bump and then
// rebuilds each item via EntityHandle.create(...). A brand-new handle (and proxy) per item per
// store change means accessor identity is unstable even for entities whose data did not change,
// which defeats React.memo (and any identity-based caching) in list consumers: editing one
// item's field re-renders every sibling's subtree.
//
// Identity is stable and is NOT a change signal — a memoized row subscribes to observe its own
// entity, which is the repo-wide contract for accessors.

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

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function createMockData() {
	return {
		Author: {
			'author-1': { id: 'author-1', name: 'John Doe' },
			'author-2': { id: 'author-2', name: 'Jane Smith' },
		},
	}
}

describe('useEntityList accessor identity', () => {
	test('should return identity-stable accessors for unchanged entities when a sibling entity field changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const seenById: Record<string, unknown[]> = {}

		function TestComponent(): React.ReactElement {
			const authors = useEntityList(authorDef, {}, a => a.id().name())
			if (authors.$status !== 'ready') {
				return <div data-testid="loading">Loading...</div>
			}
			for (const item of authors.items) {
				;(seenById[item.id] ??= []).push(item)
			}
			return (
				<div>
					<span data-testid="first-name">{authors.items[0]!.name.value}</span>
					<button
						data-testid="rename"
						onClick={() => authors.items[0]!.name.setValue('Renamed')}
					>
						rename
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'first-name').textContent).toBe('John Doe')
		})

		// Change ONE entity's field — author-2 is untouched.
		fireEvent.click(getByTestId(container, 'rename'))
		await waitFor(() => {
			expect(getByTestId(container, 'first-name').textContent).toBe('Renamed')
		})

		const untouched = seenById['author-2']!
		expect(untouched.length).toBeGreaterThan(1)
		// The accessor for the UNCHANGED entity must keep its identity across renders —
		// this is what allows React.memo / useMemo consumers to skip unchanged items.
		expect(untouched[untouched.length - 1]).toBe(untouched[0])
	})

	test('should allow React.memo list children to bail out when a sibling entity changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const renderCounts: Record<string, number> = {}

		interface RowProps {
			// Matches what authors.items hands out.
			item: EntityAccessor<{ id: string; name: string }>
		}

		// Item accessor identity is stable by design, so a memoized row no longer re-renders from
		// the parent — it subscribes to its own entity to observe changes.
		const Row = React.memo(function Row({ item }: RowProps): React.ReactElement {
			const name = useField(item.name)
			renderCounts[item.id] = (renderCounts[item.id] ?? 0) + 1
			return <span data-testid={`row-${item.id}`}>{name.value}</span>
		})

		function TestComponent(): React.ReactElement {
			const authors = useEntityList(authorDef, {}, a => a.id().name())
			if (authors.$status !== 'ready') {
				return <div data-testid="loading">Loading...</div>
			}
			return (
				<div>
					{authors.items.map(item => (
						<Row key={item.id} item={item} />
					))}
					<button
						data-testid="rename"
						onClick={() => authors.items[0]!.name.setValue('Renamed')}
					>
						rename
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'row-author-1').textContent).toBe('John Doe')
		})

		const countAfterMount = renderCounts['author-2']!

		fireEvent.click(getByTestId(container, 'rename'))
		await waitFor(() => {
			expect(getByTestId(container, 'row-author-1').textContent).toBe('Renamed')
		})

		// author-2 did not change — its memoized row must not re-render.
		expect(renderCounts['author-2']).toBe(countAfterMount)
	})
})
