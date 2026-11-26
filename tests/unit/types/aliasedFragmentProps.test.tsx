/**
 * Type-level tests: a createComponent fragment that selects fields under aliases
 * (`e.title({ as: 'headline' })`) types its public entity prop by the source field
 * names. The ref passed in must have `title` selected, not `headline`.
 *
 * Positive cases pass the real accessors from `<Entity>` and a `HasManyDataGrid` row
 * in JSX, so they exercise the compiler's own check of the props. Negative cases use
 * `assertFalse<IsAssignable<S, T>>()` (see selectionErasure.test.ts for why not a
 * suppression comment).
 */

import { describe, expect, test } from 'bun:test'
import type { ComponentProps, ReactElement } from 'react'
import type { EntityAccessor, EntityRef } from '@contember/bindx'
import { createComponent, Entity, entityDef, mergeFragments } from '@contember/bindx-react'
import { DataGridLayout, HasManyDataGrid } from '@contember/bindx-dataview'

type IsAssignable<TSource, TTarget> = [TSource] extends [TTarget] ? true : false

function assertTrue<T extends true>(): void {}
function assertFalse<T extends false>(): void {}

interface Person {
	id: string
	name: string
}

interface Task {
	id: string
	title: string
	done: boolean
}

interface Project {
	id: string
	title: string
	owner: Person
	tasks: Task[]
}

const projectDef = entityDef<Project>('Project')
const taskDef = entityDef<Task>('Task')

const ProjectHeadline = createComponent()
	.entity('project', projectDef, e => e.title({ as: 'headline' }))
	.render(({ project }) => <span>{project.$data?.headline}</span>)

const TaskHeadline = createComponent()
	.entity('task', taskDef, e => e.title({ as: 'headline' }))
	.render(({ task }) => <span>{task.$data?.headline}</span>)

const TaskDone = createComponent()
	.entity('task', taskDef, e => e.done({ as: 'isDone' }))
	.render(({ task }) => <span>{String(task.$data?.isDone)}</span>)

const ProjectRelations = createComponent()
	.entity('project', projectDef, e => e
		.owner({ as: 'lead' }, o => o.name({ as: 'fullName' }))
		.tasks({ as: 'openTasks', filter: { done: { eq: false } } }, t => t.title({ as: 'label' })))
	.render(({ project }) => <span>{project.$data?.lead.fullName}</span>)

const ProjectTaskHeadlines = createComponent()
	.entity('project', projectDef, e => e.tasks(mergeFragments(TaskHeadline.$task, TaskDone.$task)))
	.render(({ project }) => <span>{project.$data?.tasks.map(task => task.headline).join()}</span>)

type ProjectHeadlineProp = ComponentProps<typeof ProjectHeadline>['project']
type ProjectRelationsProp = ComponentProps<typeof ProjectRelations>['project']
type ProjectTaskHeadlinesProp = ComponentProps<typeof ProjectTaskHeadlines>['project']

// ============================================================================
// Accepted: accessors that have the source fields selected
// ============================================================================

function fromEntity(): ReactElement {
	return (
		<Entity entity={projectDef} by={{ id: 'p1' }}>
			{project => (
				<>
					<ProjectHeadline project={project} />
					<ProjectRelations project={project} />
					<ProjectTaskHeadlines project={project} />
				</>
			)}
		</Entity>
	)
}

function fromHasManyDataGridRow(): ReactElement {
	return (
		<Entity entity={projectDef} by={{ id: 'p1' }}>
			{project => (
				<HasManyDataGrid field={project.tasks}>
					{it => (
						<DataGridLayout name="tiles" item={it}>
							{(task: typeof it) => (
								<>
									<TaskHeadline task={task} />
									<TaskDone task={task} />
								</>
							)}
						</DataGridLayout>
					)}
				</HasManyDataGrid>
			)}
		</Entity>
	)
}

/** A ref selected by source names only, with no alias in it. */
function fromExactSourceSelection(project: EntityRef<Project, { title: string }>): ReactElement {
	return <ProjectHeadline project={project} />
}

// ============================================================================
// Rejected: refs that lack a source field, or that point to another entity
// ============================================================================

describe('a createComponent fragment with aliases', () => {
	test('accepts an accessor from <Entity> and a HasManyDataGrid row', () => {
		expect(typeof fromEntity).toBe('function')
		expect(typeof fromHasManyDataGridRow).toBe('function')
		expect(typeof fromExactSourceSelection).toBe('function')
	})

	test('rejects a ref without the aliased source field selected', () => {
		assertFalse<IsAssignable<EntityRef<Project, { id: string }>, ProjectHeadlineProp>>()
		assertFalse<IsAssignable<EntityRef<Project, { id: string; headline: string }>, ProjectHeadlineProp>>()
		assertTrue<IsAssignable<EntityRef<Project, { id: string; title: string }>, ProjectHeadlineProp>>()
	})

	test('rejects a ref of another entity with the same source field', () => {
		assertFalse<IsAssignable<EntityRef<Task>, ProjectHeadlineProp>>()
	})

	test('requires aliased relations and their nested fields by source names', () => {
		assertTrue<IsAssignable<EntityAccessor<Project>, ProjectRelationsProp>>()
		assertTrue<IsAssignable<
			EntityRef<Project, { owner: { name: string }; tasks: { title: string }[] }>,
			ProjectRelationsProp
		>>()
		assertFalse<IsAssignable<
			EntityRef<Project, { owner: { id: string }; tasks: { title: string }[] }>,
			ProjectRelationsProp
		>>()
		assertFalse<IsAssignable<
			EntityRef<Project, { owner: { name: string }; tasks: { id: string }[] }>,
			ProjectRelationsProp
		>>()
	})

	test('requires the source fields of nested component fragments', () => {
		assertTrue<IsAssignable<EntityRef<Project, { tasks: { title: string; done: boolean }[] }>, ProjectTaskHeadlinesProp>>()
		assertFalse<IsAssignable<EntityRef<Project, { tasks: { title: string }[] }>, ProjectTaskHeadlinesProp>>()
	})

	test('exposes the selection under its aliases in the fragment', () => {
		type HeadlineFragmentResult = typeof ProjectHeadline.$project.__resultType
		assertTrue<IsAssignable<HeadlineFragmentResult, { headline: string }>>()
		assertFalse<IsAssignable<HeadlineFragmentResult, { title: string }>>()
	})
})
