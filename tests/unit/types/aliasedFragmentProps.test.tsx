/**
 * Type-level tests: a createComponent fragment that selects fields under aliases
 * (`e.title({ as: 'headline' })`) accepts a ref that has the source fields selected
 * (`title`), or one built from the fragment's own aliased selection (`headline`).
 *
 * Positive cases pass the real accessors from `<Entity>` and a `HasManyDataGrid` row
 * in JSX, so they exercise the compiler's own check of the props. Negative cases use
 * `assertFalse<IsAssignable<S, T>>()` (see selectionErasure.test.ts for why not a
 * suppression comment).
 */

import { describe, expect, test } from 'bun:test'
import type { ComponentProps, ReactElement } from 'react'
import type { EntityAccessor, EntityRef, FluentDefiner, FluentFragment } from '@contember/bindx'
import { createComponent, createFragment, Entity, entityDef, mergeFragments, useEntity } from '@contember/bindx-react'
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
	.render(({ project }) => project.tasks.map(task => (
		<span key={task.id}>
			<TaskHeadline task={task} />
			<TaskDone task={task} />
		</span>
	)))

/** Passes its own aliased selection on to a fragment with the same alias. */
const ProjectHeadlineCard = createComponent()
	.entity('project', projectDef, e => e.id().title({ as: 'headline' }))
	.render(({ project }) => <ProjectHeadline project={project} />)

/** Selections typed without their source fields. */
const titleDefiner: FluentDefiner<Project, { title: string }> = e => e.title()
const taskTitle: FluentFragment<Task, { title: string }> = createFragment<Task>()(e => e.title())

const ProjectTitleFromDefiner = createComponent()
	.entity('project', projectDef, titleDefiner)
	.render(() => null)

const ProjectTaskTitles = createComponent()
	.entity('project', projectDef, e => e.tasks(taskTitle))
	.render(() => null)

const taskTitleDefiner: FluentDefiner<Task, { title: string }> = e => e.title()

const ProjectTaskTitlesFromDefiner = createComponent()
	.entity('project', projectDef, e => e.tasks(createFragment<Task>()(taskTitleDefiner)))
	.render(() => null)

/** A result type given explicitly, without the source. */
const explicitResultFragment = createFragment<Task>()<{ title: string }>(e => e.title())

/** Fragments named by their result type only, as helpers around fragments do. */
const annotatedHeadline: FluentFragment<Task, { headline: string }> = createFragment<Task>()(e => e.title({ as: 'headline' }))
const annotatedComponentFragment: FluentFragment<Task, { headline: string }> = TaskHeadline.$task

function resultOf<TResult extends object>(fragment: FluentFragment<Task, TResult>): TResult {
	return fragment.__resultType
}

const resultOfComponentFragment: { headline: string } = resultOf(TaskHeadline.$task)

/** A hand-written entity whose only selected field is optional. */
interface Draft {
	id: string
	title?: string
}

const draftDef = entityDef<Draft>('Draft')

const DraftHeadline = createComponent()
	.entity('draft', draftDef, e => e.title({ as: 'headline' }))
	.render(({ draft }) => <span>{draft.$data?.headline}</span>)

type ProjectHeadlineProp = ComponentProps<typeof ProjectHeadline>['project']
type DraftHeadlineProp = ComponentProps<typeof DraftHeadline>['draft']
type ProjectRelationsProp = ComponentProps<typeof ProjectRelations>['project']
type ProjectTaskHeadlinesProp = ComponentProps<typeof ProjectTaskHeadlines>['project']
type ProjectTitleFromDefinerProp = ComponentProps<typeof ProjectTitleFromDefiner>['project']
type ProjectTaskTitlesProp = ComponentProps<typeof ProjectTaskTitles>['project']
type ProjectTaskTitlesFromDefinerProp = ComponentProps<typeof ProjectTaskTitlesFromDefiner>['project']

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

/** The usual way to fetch data for a component: its own fragment. */
function FromUseEntity(): ReactElement | null {
	const project = useEntity(projectDef, { by: { id: 'p1' } }, ProjectHeadline.$project)
	return project.$status === 'ready' ? <ProjectHeadline project={project} /> : null
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

	test('accepts accessors built from its own aliased selection', () => {
		expect(typeof FromUseEntity).toBe('function')
		expect(ProjectHeadlineCard).toBeDefined()
		expect(ProjectTaskHeadlines).toBeDefined()
		assertTrue<IsAssignable<EntityRef<Project, { id: string; headline: string }>, ProjectHeadlineProp>>()
	})

	test('rejects a ref without the aliased source field selected', () => {
		assertFalse<IsAssignable<EntityRef<Project, { id: string }>, ProjectHeadlineProp>>()
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

	test('falls back to the result type when a selection is typed without its source', () => {
		assertTrue<IsAssignable<EntityRef<Project, { title: string }>, ProjectTitleFromDefinerProp>>()
		assertFalse<IsAssignable<EntityRef<Project, { id: string }>, ProjectTitleFromDefinerProp>>()
		assertTrue<IsAssignable<EntityRef<Project, { tasks: { title: string }[] }>, ProjectTaskTitlesProp>>()
		assertFalse<IsAssignable<EntityRef<Project, { tasks: { id: string }[] }>, ProjectTaskTitlesProp>>()
		assertTrue<IsAssignable<EntityRef<Project, { tasks: { title: string }[] }>, ProjectTaskTitlesFromDefinerProp>>()
		assertFalse<IsAssignable<EntityRef<Project, { tasks: { id: string }[] }>, ProjectTaskTitlesFromDefinerProp>>()
	})

	test('can be named by its result type alone', () => {
		expect(annotatedHeadline.__isFragment).toBe(true)
		expect(annotatedComponentFragment.__isFragment).toBe(true)
		expect(resultOfComponentFragment).toBe(TaskHeadline.$task.__resultType)
		expect(explicitResultFragment.__isFragment).toBe(true)
	})

	test('accepts an accessor when the source field is optional', () => {
		// An optional field cannot be required by type, the same as for `e.title()` without an alias.
		assertTrue<IsAssignable<EntityRef<Draft>, DraftHeadlineProp>>()
	})

	test('exposes the selection under its aliases in the fragment', () => {
		type HeadlineFragmentResult = typeof ProjectHeadline.$project.__resultType
		assertTrue<IsAssignable<HeadlineFragmentResult, { headline: string }>>()
		assertFalse<IsAssignable<HeadlineFragmentResult, { title: string }>>()
	})
})
