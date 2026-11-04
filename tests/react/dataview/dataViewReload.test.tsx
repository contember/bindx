// Issue #124: reload() from the data view context never refetched the list or its count.
// A row changed by a mutation outside the view must leave (or join) it after reload().
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import {
	BindxProvider,
	Entity,
	MockAdapter,
	defineSchema,
	entityDef,
	hasMany,
	hasOne,
	scalar,
	useEntity,
} from '@contember/bindx-react'
import {
	DataGrid,
	DataGridTextColumn,
	DataViewEachRow,
	HasManyDataGrid,
	Select,
	SelectDataView,
	useDataViewContext,
	useDataViewReload,
} from '@contember/bindx-dataview'
import { TestPagination, TestTable, getByTestId, getRowCount, queryByTestId } from './helpers.js'

afterEach(cleanup)

interface Task {
	id: string
	title: string
	finished: boolean
}

interface Project {
	id: string
	tasks: Task[]
	lead: Task | null
}

const schema = defineSchema<{ Task: Task; Project: Project }>({
	entities: {
		Task: { fields: { id: scalar(), title: scalar(), finished: scalar() } },
		Project: { fields: { id: scalar(), tasks: hasMany('Task'), lead: hasOne('Task') } },
	},
})
const taskDef = entityDef<Task>('Task')
const projectDef = entityDef<Project>('Project')

function createAdapter(): MockAdapter {
	const tasks = [1, 2, 3].map(i => ({ id: `t${i}`, title: `Task ${i}`, finished: false }))
	return new MockAdapter({
		Task: Object.fromEntries(tasks.map(task => [task.id, { ...task }])),
		Project: { p1: { id: 'p1', tasks, lead: null } },
	}, { delay: 20 })
}

/** Finishes a task behind the view's back, as a separate mutation would. */
function finishTaskOnServer(adapter: MockAdapter, id: string): void {
	const store = adapter.getStore()
	const task = store['Task']?.[id]
	if (!task) throw new Error(`no task ${id}`)
	task['finished'] = true
	const project = store['Project']?.['p1']
	const projectTasks = project?.['tasks']
	if (project && Array.isArray(projectTasks)) {
		project['tasks'] = projectTasks.filter(it => it.id !== id)
	}
}

function ReloadProbe(): ReactElement {
	const reload = useDataViewReload()
	const { loaderState } = useDataViewContext()
	return (
		<>
			<button data-testid="reload" onClick={reload}>Reload</button>
			<span data-testid="loader-state">{loaderState}</span>
		</>
	)
}

async function clickReload(container: HTMLElement): Promise<void> {
	await act(async () => {
		fireEvent.click(getByTestId(container, 'reload'))
	})
}

const openTasks = { finished: { eq: false } }

describe('data view reload()', () => {
	test('DataGrid refetches the rows and the total, keeping the rows while it loads', async () => {
		const adapter = createAdapter()
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<DataGrid entity={taskDef} filter={openTasks}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<TestTable />
							<TestPagination />
							<ReloadProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)
		await waitFor(() => expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('3 total'))
		expect(getRowCount(container)).toBe(3)

		finishTaskOnServer(adapter, 't1')
		await clickReload(container)

		expect(getByTestId(container, 'loader-state').textContent).toBe('refreshing')
		expect(getRowCount(container)).toBe(3)
		await waitFor(() => expect(getRowCount(container)).toBe(2))
		await waitFor(() => expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('2 total'))
		expect(getByTestId(container, 'loader-state').textContent).toBe('loaded')
	})

	test('HasManyDataGrid refetches the relation rows and the total, keeping the rows while it loads', async () => {
		const adapter = createAdapter()
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={projectDef} by={{ id: 'p1' }}>
					{project => (
						<HasManyDataGrid field={project.tasks}>
							{it => (
								<>
									<DataGridTextColumn field={it.title} header="Title" />
									<TestTable />
									<TestPagination />
									<ReloadProbe />
								</>
							)}
						</HasManyDataGrid>
					)}
				</Entity>
			</BindxProvider>,
		)
		await waitFor(() => expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('3 total'))
		expect(getRowCount(container)).toBe(3)

		finishTaskOnServer(adapter, 't1')
		await clickReload(container)

		expect(getByTestId(container, 'loader-state').textContent).toBe('refreshing')
		expect(getRowCount(container)).toBe(3)
		await waitFor(() => expect(getRowCount(container)).toBe(2))
		await waitFor(() => expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('2 total'))
		expect(getByTestId(container, 'loader-state').textContent).toBe('loaded')
	})

	test('SelectDataView refetches the options and the total', async () => {
		const adapter = createAdapter()

		function Picker(): ReactElement {
			const project = useEntity(projectDef, { by: { id: 'p1' } }, e => e.id().lead(t => t.id().title()))
			if (project.$status !== 'ready') return <span data-testid="loading" />
			return (
				<Select relation={project.lead} options={taskDef}>
					<SelectDataView filter={openTasks}>
						<DataViewEachRow>
							{item => <span data-testid="option" key={item.id} />}
						</DataViewEachRow>
						<TestPagination />
						<ReloadProbe />
					</SelectDataView>
				</Select>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Picker />
			</BindxProvider>,
		)
		const optionCount = (): number => container.querySelectorAll('[data-testid="option"]').length
		await waitFor(() => expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('3 total'))
		expect(optionCount()).toBe(3)

		finishTaskOnServer(adapter, 't1')
		await clickReload(container)

		expect(getByTestId(container, 'loader-state').textContent).toBe('refreshing')
		expect(optionCount()).toBe(3)
		await waitFor(() => expect(optionCount()).toBe(2))
		await waitFor(() => expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('2 total'))
	})
})
