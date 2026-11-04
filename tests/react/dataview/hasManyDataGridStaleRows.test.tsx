// HasManyDataGrid keeps the previous rows on screen while a refetch loads (stale-while-revalidate).
// Its loader state must describe the rows rendered with it on every render, rows of another
// parent must never show, and a refetch must not overwrite edits made to the rows meanwhile.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React, { useState, type ReactElement } from 'react'
import {
	BindxProvider,
	Entity,
	MockAdapter,
	defineSchema,
	entityDef,
	hasMany,
	scalar,
	useEntity,
} from '@contember/bindx-react'
import type { DataViewLoaderStateType } from '@contember/bindx-dataview'
import {
	DataGridTextColumn,
	DataViewEachRow,
	HasManyDataGrid,
	useDataViewContext,
	useDataViewReload,
} from '@contember/bindx-dataview'
import { TestPagination, getByTestId } from './helpers.js'

afterEach(cleanup)

interface Task {
	id: string
	title: string
}

interface Project {
	id: string
	tasks: Task[]
}

const schema = defineSchema<{ Task: Task; Project: Project }>({
	entities: {
		Task: { fields: { id: scalar(), title: scalar() } },
		Project: { fields: { id: scalar(), tasks: hasMany('Task') } },
	},
})
const taskDef = entityDef<Task>('Task')
const projectDef = entityDef<Project>('Project')

const PROJECT_TASKS: Record<string, readonly string[]> = {
	p1: ['t1', 't2', 't3'],
	p2: ['t4'],
}

function createAdapter(): MockAdapter {
	const task = (id: string): Record<string, unknown> => ({ id, title: `Task ${id}` })
	return new MockAdapter({
		Task: Object.fromEntries(['t1', 't2', 't3', 't4'].map(id => [id, task(id)])),
		Project: Object.fromEntries(Object.entries(PROJECT_TASKS).map(([id, tasks]) => [id, { id, tasks: tasks.map(task) }])),
	}, { delay: 20 })
}

interface RenderRecord {
	readonly projectId: string
	readonly pageIndex: number
	readonly loaderState: DataViewLoaderStateType
	readonly rowIds: readonly string[]
}

/** Records what every render of the grid's children shows. */
function Recorder({ projectId, records }: { projectId: string; records: RenderRecord[] }): ReactElement {
	const { loaderState, items, paging } = useDataViewContext()
	const reload = useDataViewReload()
	records.push({ projectId, pageIndex: paging.state.pageIndex, loaderState, rowIds: items.map(item => item.id) })
	return (
		<>
			<span data-testid="loader-state">{loaderState}</span>
			<button data-testid="reload" onClick={reload}>Reload</button>
		</>
	)
}

function ProjectTasks({ projectId, records, itemsPerPage }: { projectId: string; records: RenderRecord[]; itemsPerPage?: number }): ReactElement {
	return (
		<Entity entity={projectDef} by={{ id: projectId }}>
			{project => (
				<HasManyDataGrid field={project.tasks} itemsPerPage={itemsPerPage}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataViewEachRow>{item => <span key={item.id} data-testid="row" data-id={item.id} />}</DataViewEachRow>
							<TestPagination />
							<Recorder projectId={projectId} records={records} />
						</>
					)}
				</HasManyDataGrid>
			)}
		</Entity>
	)
}

const rowIds = (container: HTMLElement): (string | null)[] =>
	Array.from(container.querySelectorAll('[data-testid="row"]')).map(el => el.getAttribute('data-id'))

async function click(container: HTMLElement, testId: string): Promise<void> {
	await act(async () => {
		fireEvent.click(getByTestId(container, testId))
	})
}

describe('HasManyDataGrid stale rows', () => {
	test('every render that reads loaded shows the rows of the current page', async () => {
		const records: RenderRecord[] = []
		const { container } = render(
			<BindxProvider adapter={createAdapter()} schema={schema}>
				<ProjectTasks projectId="p1" records={records} itemsPerPage={2} />
			</BindxProvider>,
		)
		await waitFor(() => expect(rowIds(container)).toEqual(['t1', 't2']))

		await click(container, 'datagrid-pagination-next')
		await waitFor(() => expect(rowIds(container)).toEqual(['t3']))

		const pages = [['t1', 't2'], ['t3']]
		const loaded = records.filter(record => record.loaderState === 'loaded')
		expect(loaded.length).toBeGreaterThan(0)
		for (const record of loaded) {
			expect(record.rowIds).toEqual(pages[record.pageIndex] ?? [])
		}
		expect(records.some(record => record.loaderState === 'refreshing' && record.pageIndex === 1 && record.rowIds.join() === 't1,t2')).toBe(true)
	})

	test('rows of another parent are never shown', async () => {
		const records: RenderRecord[] = []

		function Switcher(): ReactElement {
			const [projectId, setProjectId] = useState('p1')
			return (
				<>
					<button data-testid="p1" onClick={() => setProjectId('p1')}>p1</button>
					<button data-testid="p2" onClick={() => setProjectId('p2')}>p2</button>
					<ProjectTasks projectId={projectId} records={records} />
				</>
			)
		}

		const { container } = render(
			<BindxProvider adapter={createAdapter()} schema={schema}>
				<Switcher />
			</BindxProvider>,
		)
		await waitFor(() => expect(rowIds(container)).toEqual(['t1', 't2', 't3']))
		await click(container, 'p2')
		await waitFor(() => expect(rowIds(container)).toEqual(['t4']))
		await click(container, 'p1')
		await waitFor(() => expect(rowIds(container)).toEqual(['t1', 't2', 't3']))
		await waitFor(() => expect(getByTestId(container, 'loader-state').textContent).toBe('loaded'))

		for (const record of records) {
			const ownTasks = PROJECT_TASKS[record.projectId] ?? []
			for (const id of record.rowIds) {
				expect(ownTasks).toContain(id)
			}
		}
	})

	test('a refetch keeps edits made to the rows', async () => {
		const records: RenderRecord[] = []

		function TitleEditor(): ReactElement {
			const task = useEntity(taskDef, { by: { id: 't1' } }, e => e.title())
			if (task.$status !== 'ready') return <span />
			return (
				<>
					<span data-testid="title">{task.title.value}</span>
					<button data-testid="edit" onClick={() => task.title.setValue('Edited')}>Edit</button>
				</>
			)
		}

		const { container } = render(
			<BindxProvider adapter={createAdapter()} schema={schema}>
				<ProjectTasks projectId="p1" records={records} />
				<TitleEditor />
			</BindxProvider>,
		)
		await waitFor(() => expect(rowIds(container)).toEqual(['t1', 't2', 't3']))
		await waitFor(() => expect(getByTestId(container, 'title').textContent).toBe('Task t1'))

		await click(container, 'edit')
		await click(container, 'reload')
		await waitFor(() => expect(getByTestId(container, 'loader-state').textContent).toBe('loaded'))

		expect(getByTestId(container, 'title').textContent).toBe('Edited')
	})
})
