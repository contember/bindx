// Regression test for https://github.com/contember/bindx/issues/170
import '../../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	entityDef,
	hasOne,
	MockAdapter,
	scalar,
	useEntity,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId } from '../../../shared/helpers'

afterEach(() => {
	cleanup()
})

interface Parent {
	id: string
	code: string
	name: string
	status: string
	extra: string
}

interface Item {
	id: string
	title: string
	parent: Parent | null
}

interface TwoReadsSchema {
	Record: Item
	Parent: Parent
}

const schema = defineSchema<TwoReadsSchema>({
	entities: {
		Record: {
			fields: {
				id: scalar(),
				title: scalar(),
				parent: hasOne('Parent', { nullable: true }),
			},
		},
		Parent: {
			fields: {
				id: scalar(),
				code: scalar(),
				name: scalar(),
				status: scalar(),
				extra: scalar(),
			},
		},
	},
})

const RecordDef = entityDef<Item>('Record')
const by = { by: { id: 'record-1' } }

function createMockData(): ConstructorParameters<typeof MockAdapter>[0] {
	const parent = { id: 'parent-1', code: 'P1', name: 'Root', status: 'active', extra: 'more' }
	return {
		Record: { 'record-1': { id: 'record-1', title: 'Hello', parent } },
		Parent: { 'parent-1': { ...parent } },
	}
}

/** A: the wider selection of `parent`, as a component that renders its name and code. */
function WideReader(): React.ReactElement {
	const record = useEntity(RecordDef, by, e => e.id().parent(p => p.id().code().name().status()))
	if (record.$isLoading || record.$isError || record.$isNotFound) return <div>Loading...</div>
	return <span data-testid="wide">{`${String(record.parent.$isConnected)}:${String(record.parent.code.value)}:${String(record.parent.name.value)}`}</span>
}

/** B: a narrower selection of the same `parent`, with one field A does not read. */
function NarrowReader(): React.ReactElement {
	const record = useEntity(RecordDef, by, e => e.id().title().parent(p => p.id().status().extra()))
	if (record.$isLoading || record.$isError || record.$isNotFound) return <div>Loading...</div>
	return <span data-testid="narrow">{`${String(record.parent.status.value)}:${String(record.parent.extra.value)}`}</span>
}

describe('two reads of one entity with different selections of a has-one (#170)', () => {
	// One batch answers both reads; they are written in render order, both before the next render.
	for (const order of ['wider first', 'narrower first'] as const) {
		test(`should keep every field of the related entity when both land before a render (${order})`, async () => {
			const readers = order === 'wider first'
				? [<WideReader key="wide" />, <NarrowReader key="narrow" />]
				: [<NarrowReader key="narrow" />, <WideReader key="wide" />]
			const { container } = render(
				<BindxProvider adapter={new MockAdapter(createMockData(), { delay: 0 })} schema={schema}>
					{readers}
				</BindxProvider>,
			)
			await waitFor(() => {
				expect(queryByTestId(container, 'wide')).not.toBeNull()
				expect(queryByTestId(container, 'narrow')).not.toBeNull()
			})

			expect(getByTestId(container, 'wide').textContent).toBe('true:P1:Root')
			expect(getByTestId(container, 'narrow').textContent).toBe('active:more')
		})
	}
})
