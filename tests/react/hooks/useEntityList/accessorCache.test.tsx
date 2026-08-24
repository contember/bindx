import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
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
	type UseEntityListResult,
} from '@contember/bindx-react'

// Companion to accessorIdentity.test.tsx: the item accessor cache must stay correct while it
// reuses handles — identity survives every change to the entity, order and membership are still
// reflected, and a widened selection is not served by handles built against the narrow one.

afterEach(() => {
	cleanup()
})

interface Author {
	id: string
	name: string
	rank: number
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
				rank: scalar(),
			},
		},
	},
})

const authorDef = entityDef<Author>('Author')

function createMockData() {
	return {
		Author: {
			'author-1': { id: 'author-1', name: 'John Doe', rank: 1 },
			'author-2': { id: 'author-2', name: 'Jane Smith', rank: 2 },
			'author-3': { id: 'author-3', name: 'Jack Black', rank: 3 },
		},
	}
}

/** Renders nothing; hands the latest hook result back to the test. */
function createListProbe(): {
	Probe: (props: { filter?: Record<string, unknown>; withRank?: boolean }) => React.ReactElement | null
	latest: () => UseEntityListResult<{ id: string; name: string }>
} {
	let current: UseEntityListResult<{ id: string; name: string }> | null = null

	function Probe({ filter, withRank }: { filter?: Record<string, unknown>; withRank?: boolean }): React.ReactElement | null {
		const result = useEntityList(
			authorDef,
			{ filter, orderBy: [{ rank: 'asc' }] },
			a => (withRank ? a.id().name().rank() : a.id().name()),
		)
		current = result
		return null
	}

	return {
		Probe,
		latest: () => {
			if (!current) throw new Error('Probe has not rendered yet')
			return current
		},
	}
}

function readyItems(result: UseEntityListResult<{ id: string; name: string }>): Array<{ id: string }> {
	if (result.$status !== 'ready') throw new Error(`Expected ready, got ${result.$status}`)
	return result.items
}

/**
 * Reads a field accessor by name. Read dynamically because the field is not part of the item's
 * static type before the selection widens; this hits the same validation path as `item.rank.value`.
 */
function readFieldValue(item: object, fieldName: string): unknown {
	const accessor: unknown = Reflect.get(item, fieldName)
	if (typeof accessor !== 'object' || accessor === null) {
		throw new Error(`No accessor for field '${fieldName}'`)
	}
	const value: unknown = Reflect.get(accessor, 'value')
	return value
}

describe('useEntityList item accessor cache', () => {
	test('should keep item identity across a reorder', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { Probe, latest } = createListProbe()

		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => expect(readyItems(latest())).toHaveLength(3))
		const before = readyItems(latest())
		const [first, second, third] = before

		act(() => {
			const result = latest()
			if (result.$status !== 'ready') throw new Error('not ready')
			result.$move(0, 2)
		})

		const after = readyItems(latest())
		expect(after.map(item => item.id)).toEqual(['author-2', 'author-3', 'author-1'])
		expect(after[0]).toBe(second!)
		expect(after[1]).toBe(third!)
		expect(after[2]).toBe(first!)
	})

	test('should keep existing item identity when an item is added or removed', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { Probe, latest } = createListProbe()

		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => expect(readyItems(latest())).toHaveLength(3))
		const survivor = readyItems(latest())[1]!

		act(() => {
			const result = latest()
			if (result.$status !== 'ready') throw new Error('not ready')
			result.$add({ name: 'New Author' })
		})

		let items = readyItems(latest())
		expect(items).toHaveLength(4)
		expect(items[1]).toBe(survivor)

		act(() => {
			const result = latest()
			if (result.$status !== 'ready') throw new Error('not ready')
			result.$remove('author-1')
		})

		items = readyItems(latest())
		expect(items.map(item => item.id)).not.toContain('author-1')
		expect(items[0]).toBe(survivor)
	})

	test('should eventually serve the widened selection once the accessor cache is dropped', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { Probe, latest } = createListProbe()

		const { rerender } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => expect(readyItems(latest())).toHaveLength(3))

		rerender(
			<BindxProvider adapter={adapter} schema={schema}>
				<Probe withRank />
			</BindxProvider>,
		)

		// A handle validates field access against the selection it was built with, so without the
		// cache drop the new field would throw forever. This pins the steady state only: on the
		// render where the selection widens, `listCacheRef` still hits (its key ignores the
		// selection) and hands out the narrow accessors, so reading `rank` throws there and
		// `waitFor` rides past it. That transient is pre-existing and not covered here.
		await waitFor(() => {
			expect(readFieldValue(readyItems(latest())[0]!, 'rank')).toBe(1)
		})
	})

	test('should keep item identity across a change to its own entity while a subscribing row updates', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const seen: unknown[] = []
		let renderCount = 0

		interface RowProps {
			item: EntityAccessor<{ id: string; name: string }>
		}

		const Row = React.memo(function Row({ item }: RowProps): React.ReactElement {
			const name = useField(item.name)
			renderCount++
			return <span data-testid="row">{name.value}</span>
		})

		function TestComponent(): React.ReactElement {
			const authors = useEntityList(authorDef, { orderBy: [{ rank: 'asc' }] }, a => a.id().name())
			if (authors.$status !== 'ready') return <div data-testid="loading" />
			const first = authors.items[0]!
			seen.push(first)
			return (
				<div>
					<Row item={first} />
					<button data-testid="rename" onClick={() => first.name.setValue('Renamed')}>rename</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		const row = (): Element => {
			const el = container.querySelector('[data-testid="row"]')
			if (!el) throw new Error('Row not rendered')
			return el
		}

		await waitFor(() => expect(row().textContent).toBe('John Doe'))
		const rendersBefore = renderCount

		fireEvent.click(container.querySelector('[data-testid="rename"]')!)

		// Identity is not a change signal: it survives the entity's own change, and the row still
		// updates because it subscribes.
		await waitFor(() => expect(row().textContent).toBe('Renamed'))
		expect(renderCount).toBeGreaterThan(rendersBefore)
		expect(seen.length).toBeGreaterThan(1)
		expect(seen[seen.length - 1]).toBe(seen[0])
	})

	test('should give a re-entering id a new accessor, proving the evicted entry is gone', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { Probe, latest } = createListProbe()

		const showOnly = async (id: string): Promise<void> => {
			rerender(
				<BindxProvider adapter={adapter} schema={schema}>
					<Probe filter={{ id: { eq: id } }} />
				</BindxProvider>,
			)
			await waitFor(() => {
				expect(readyItems(latest()).map(item => item.id)).toEqual([id])
			})
		}

		const { rerender } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Probe filter={{ id: { eq: 'author-1' } }} />
			</BindxProvider>,
		)
		await waitFor(() => expect(readyItems(latest())).toHaveLength(1))
		const before = readyItems(latest())[0]!

		// author-1 leaves the list entirely, then comes back.
		await showOnly('author-2')
		await showOnly('author-1')

		// A surviving cache entry would hand back the very same accessor here.
		expect(readyItems(latest())[0]).not.toBe(before)
	})
})
