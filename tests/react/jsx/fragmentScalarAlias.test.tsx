import '../../setup'
// A createComponent fragment that selects a scalar under an alias (`title({ as: 'headline' })`)
// must query that alias and see it in `$data`, also in the rows of a HasManyDataGrid.
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import {
	BindxProvider,
	Entity,
	MockAdapter,
	createComponent,
	defineSchema,
	entityDef,
	hasMany,
	scalar,
} from '@contember/bindx-react'
import { DataGridLayout, DataGridTextColumn, HasManyDataGrid, useDataViewContext } from '@contember/bindx-dataview'
import type { EntityRef, Query, QueryOptions, QueryResult, QuerySpec } from '@contember/bindx'

afterEach(cleanup)

interface Task {
	id: string
	title: string
}

interface Project {
	id: string
	title: string
	tasks: Task[]
}

const schema = defineSchema<{ Task: Task; Project: Project }>({
	entities: {
		Task: { fields: { id: scalar(), title: scalar() } },
		Project: { fields: { id: scalar(), title: scalar(), tasks: hasMany('Task') } },
	},
})
const taskDef = entityDef<Task>('Task')
const projectDef = entityDef<Project>('Project')

class RecordingAdapter extends MockAdapter {
	readonly queries: Query[] = []

	override async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		this.queries.push(...queries)
		return super.query(queries, options)
	}
}

function createAdapter(): RecordingAdapter {
	const tasks = [{ id: 't1', title: 'First' }, { id: 't2', title: 'Second' }]
	return new RecordingAdapter({
		Task: Object.fromEntries(tasks.map(task => [task.id, task])),
		Project: { p1: { id: 'p1', title: 'Project', tasks } },
	}, { delay: 0 })
}

/** Query fields as `name` or `alias:field`, nested fields in braces, sorted. */
function describeFields(spec: QuerySpec | undefined): string[] {
	return (spec?.fields ?? []).map(field => {
		const source = field.sourcePath.join('.')
		const head = source === field.name ? field.name : `${field.name}:${source}`
		return field.nested ? `${head} { ${describeFields(field.nested).join(' ')} }` : head
	}).sort()
}

/** Passes a ref to a fragment that aliases `title` as `headline`. */
function withHeadline<T>(ref: EntityRef<T>): EntityRef<T, T & { headline: string }> {
	// Type gap T1296: a fragment's props expect its aliases among the passed ref's own fields.
	return ref as EntityRef<T, T & { headline: string }>
}

const ProjectHeadline = createComponent()
	.entity('project', projectDef, e => e.title({ as: 'headline' }))
	.render(({ project }) => <span data-testid="headline">{project.$data?.headline}</span>)

const TaskHeadline = createComponent()
	.entity('task', taskDef, e => e.title({ as: 'headline' }))
	.render(({ task }) => <span data-testid="headline">{task.$data?.headline}</span>)

/** Renders every row through the grid's `tiles` layout. */
function TileRows(): ReactElement | null {
	const { layoutRenders, items, loaderState } = useDataViewContext()
	const renderTile = layoutRenders.get('tiles')
	if (loaderState !== 'loaded' || !renderTile) return null
	return <>{items.map(item => <div key={item.id}>{renderTile(item)}</div>)}</>
}

function textsOf(container: HTMLElement, testId: string): (string | null)[] {
	return Array.from(container.querySelectorAll(`[data-testid="${testId}"]`)).map(el => el.textContent)
}

describe('an aliased scalar selected by a createComponent fragment', () => {
	test('is queried under its alias and shown in $data under an <Entity>', async () => {
		const adapter = createAdapter()
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={projectDef} by={{ id: 'p1' }}>
					{project => <ProjectHeadline project={withHeadline(project)} />}
				</Entity>
			</BindxProvider>,
		)
		await waitFor(() => expect(textsOf(container, 'headline')).toEqual(['Project']))

		const [query] = adapter.queries
		if (query === undefined || query.type !== 'get') throw new Error('Expected one get query for the project')
		expect(describeFields(query.spec)).toEqual(['headline:title', 'id'])
	})

	test('is shown in $data of HasManyDataGrid rows next to a column of the plain field', async () => {
		function ProjectTasks(): ReactElement {
			return (
				<Entity entity={projectDef} by={{ id: 'p1' }}>
					{project => (
						<HasManyDataGrid field={project.tasks}>
							{it => (
								<>
									<DataGridTextColumn field={it.title} header="Title" />
									<DataGridLayout name="tiles" item={it}>
										{(task: typeof it) => (
											<>
												<TaskHeadline task={withHeadline(task)} />
												<span data-testid="title">{task.title.value}</span>
											</>
										)}
									</DataGridLayout>
									<TileRows />
								</>
							)}
						</HasManyDataGrid>
					)}
				</Entity>
			)
		}
		const adapter = createAdapter()
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<ProjectTasks />
			</BindxProvider>,
		)
		await waitFor(() => expect(textsOf(container, 'headline')).toEqual(['First', 'Second']))
		expect(textsOf(container, 'title')).toEqual(['First', 'Second'])
		const gridQuery = adapter.queries.at(-1)
		if (gridQuery === undefined || gridQuery.type !== 'get') throw new Error('Expected a get query for the grid rows')
		expect(describeFields(gridQuery.spec)).toEqual(['id', expect.stringMatching(/^tasks_\w+:tasks \{ headline:title id title \}$/)])
	})
})
