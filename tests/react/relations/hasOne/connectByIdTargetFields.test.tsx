// Regression test for https://github.com/contember/bindx/issues/131
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
	hasOne,
	hasMany,
	useEntity,
	useEntityList,
	usePersist,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId } from '../../../shared/helpers'

/**
 * A junction row is added to a has-many, then its has-one is connected by id to
 * an existing entity the user picked from a separate list. The parent selected
 * `label.name().kind()` through the junction, so both fields should be readable
 * on the connected entity.
 */

interface Label {
	id: string
	name: string
	kind: string
}

interface Assignment {
	id: string
	primary: boolean
	label: Label | null
}

interface Board {
	id: string
	assignments: Assignment[]
}

interface TestSchema {
	Board: Board
	Assignment: Assignment
	Label: Label
}

const schema = defineSchema<TestSchema>({
	entities: {
		Board: {
			fields: {
				id: scalar(),
				assignments: hasMany('Assignment'),
			},
		},
		Assignment: {
			fields: {
				id: scalar(),
				primary: scalar(),
				label: hasOne('Label', { nullable: true }),
			},
		},
		Label: {
			fields: {
				id: scalar(),
				name: scalar(),
				kind: scalar(),
			},
		},
	},
})

const entityDefs = {
	Board: entityDef<Board>('Board'),
	Label: entityDef<Label>('Label'),
} as const

function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Board: {
			'board-1': { id: 'board-1', assignments: [] },
		},
		Assignment: {},
		Label: {
			'label-1': { id: 'label-1', name: 'Urgent', kind: 'priority' },
		},
	}
}

afterEach(() => {
	cleanup()
})

type PickerSelection = 'name' | 'name-and-kind' | 'none'

function renderBoard(adapter: MockAdapter, picker: PickerSelection): HTMLElement {
	function NamePicker(): React.ReactElement | null {
		const list = useEntityList(entityDefs.Label, {}, e => e.id().name())
		return list.$isLoading ? null : <span data-testid="picker-ready">ready</span>
	}

	function NameAndKindPicker(): React.ReactElement | null {
		const list = useEntityList(entityDefs.Label, {}, e => e.id().name().kind())
		return list.$isLoading ? null : <span data-testid="picker-ready">ready</span>
	}

	function BoardView(): React.ReactElement {
		const board = useEntity(entityDefs.Board, { by: { id: 'board-1' } }, e =>
			e.id().assignments(a => a.id().primary().label(l => l.id().name().kind())),
		)
		const { persistAll } = usePersist()
		if (board.$isLoading || board.$isError || board.$isNotFound) return <div>Loading</div>

		const labels = board.assignments.items.map(item => ({
			id: item.label.$id ?? 'null',
			name: item.label.$entity.$fields.name.value ?? 'null',
			kind: item.label.$entity.$fields.kind.value ?? 'null',
		}))

		return (
			<div>
				<span data-testid="labels">{JSON.stringify(labels)}</span>
				<button
					data-testid="add"
					onClick={() => {
						const assignmentId = board.assignments.add({})
						const assignment = board.assignments.items.find(it => it.id === assignmentId)
						assignment?.label.$connect('label-1')
						assignment?.primary.setValue(false)
					}}
				>
					Add
				</button>
				<button data-testid="persist" onClick={() => void persistAll()}>Persist</button>
			</div>
		)
	}

	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema}>
			{picker === 'name' && <NamePicker />}
			{picker === 'name-and-kind' && <NameAndKindPicker />}
			<BoardView />
		</BindxProvider>,
	)
	return container
}

async function addAndReadLabels(container: HTMLElement, picker: PickerSelection): Promise<{ beforePersist: string; afterPersist: string }> {
	await waitFor(() => {
		expect(queryByTestId(container, 'labels')).not.toBeNull()
		if (picker !== 'none') expect(queryByTestId(container, 'picker-ready')).not.toBeNull()
	})

	act(() => {
		;(getByTestId(container, 'add') as HTMLButtonElement).click()
	})
	const beforePersist = getByTestId(container, 'labels').textContent!

	await act(async () => {
		;(getByTestId(container, 'persist') as HTMLButtonElement).click()
		await new Promise(resolve => setTimeout(resolve, 20))
	})
	const afterPersist = getByTestId(container, 'labels').textContent!
	return { beforePersist, afterPersist }
}

const expectedLabels = JSON.stringify([{ id: 'label-1', name: 'Urgent', kind: 'priority' }])

describe('HasOne $connect by id - fields of the connected entity', () => {
	test('target already loaded with every selected field: readable before and after persist', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const container = renderBoard(adapter, 'name-and-kind')

		const { beforePersist, afterPersist } = await addAndReadLabels(container, 'name-and-kind')

		expect(beforePersist).toBe(expectedLabels)
		expect(afterPersist).toBe(expectedLabels)
	})

	test('target loaded without a selected field: the missing field is fetched', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const container = renderBoard(adapter, 'name')

		const { afterPersist } = await addAndReadLabels(container, 'name')

		expect(afterPersist).toBe(expectedLabels)
	})

	test('target not in the store at all: its selected fields are fetched', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const container = renderBoard(adapter, 'none')

		const { afterPersist } = await addAndReadLabels(container, 'none')

		expect(afterPersist).toBe(expectedLabels)
	})
})
