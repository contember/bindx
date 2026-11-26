/**
 * Type-level tests: the result types around aliased selections.
 *
 * - A has-many selected with an options object keeps a literal `as` in `$data`.
 * - `useEntityList` types its items by the entity, with the selection as `TSelected`.
 * - A nullable or optional has-one with a nested selection accepts the full `<Entity>` accessor.
 *
 * Positive cases use real JSX, so the compiler checks the props itself. Negative cases use
 * `assertFalse<...>()` (see selectionErasure.test.ts for why not a suppression comment).
 */

import { describe, expect, test } from 'bun:test'
import type { ComponentProps, ReactElement } from 'react'
import type { EntityAccessor, EntityRef, HasManyOptions } from '@contember/bindx'
import { createComponent, createFragment, Entity, entityDef, useEntityList } from '@contember/bindx-react'

type IsAssignable<TSource, TTarget> = [TSource] extends [TTarget] ? true : false
type IsEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

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
	tasks: Task[]
}

/** Hand-written types: generated ones declare a has-one without `null`. */
interface Contract {
	id: string
	owner: Person | null
	reviewer?: Person
}

const projectDef = entityDef<Project>('Project')
const taskDef = entityDef<Task>('Task')
const contractDef = entityDef<Contract>('Contract')

type DataOf<TFragment extends { __resultType: object }> = TFragment['__resultType']

// ============================================================================
// A has-many selected with an options object
// ============================================================================

const TaskHeadline = createComponent()
	.entity('task', taskDef, e => e.title({ as: 'headline' }))
	.render(({ task }) => <span>{task.$data?.headline}</span>)

const OpenTasks = createComponent()
	.entity('project', projectDef, e => e.tasks({ as: 'openTasks', filter: { done: { eq: false } } }, t => t.title()))
	.render(({ project }) => (
		<ul>
			{project.$data?.openTasks.map(task => <li key={task.title}>{task.title}</li>)}
		</ul>
	))

const LatestTaskHeadlines = createComponent()
	.entity('project', projectDef, e => e.tasks({ as: 'latest', limit: 3 }, TaskHeadline.$task))
	.render(({ project }) => <span>{project.$data?.latest.map(task => task.headline).join(', ')}</span>)

const presetOptions: HasManyOptions<Task> = { limit: 3 }
const unaliasedOptionFragments = {
	literal: createFragment<Project>()(e => e.tasks({ limit: 3 }, t => t.title())),
	preset: createFragment<Project>()(e => e.tasks(presetOptions, t => t.title())),
}

function hasManyWithOptionsFromEntity(): ReactElement {
	return (
		<Entity entity={projectDef} by={{ id: 'p1' }}>
			{project => (
				<>
					<OpenTasks project={project} />
					<LatestTaskHeadlines project={project} />
				</>
			)}
		</Entity>
	)
}

// ============================================================================
// useEntityList with a component fragment
// ============================================================================

const ProjectHeadline = createComponent()
	.entity('project', projectDef, e => e.title({ as: 'headline' }))
	.render(({ project }) => <span>{project.$data?.headline}</span>)

type ProjectHeadlineProp = ComponentProps<typeof ProjectHeadline>['project']

function TaskHeadlineList(): ReactElement | null {
	const tasks = useEntityList(taskDef, {}, TaskHeadline.$task)
	if (tasks.$status !== 'ready') return null
	type Item = (typeof tasks.items)[number]
	assertTrue<IsAssignable<Item, EntityAccessor<Task, { headline: string }>>>()
	assertFalse<IsAssignable<Item, ProjectHeadlineProp>>()
	assertFalse<IsAssignable<'title', keyof NonNullable<Item['$data']>>>()
	return <>{tasks.items.map(task => <TaskHeadline key={task.id} task={task} />)}</>
}

function TaskTitleList(): ReactElement | null {
	const tasks = useEntityList(taskDef, {}, e => e.title())
	if (tasks.$status !== 'ready') return null
	return <>{tasks.items.map(task => <span key={task.id}>{task.title.value}</span>)}</>
}

// ============================================================================
// A nullable or optional has-one with a nested selection
// ============================================================================

const PersonName = createComponent()
	.entity('person', entityDef<Person>('Person'), e => e.name())
	.render(({ person }) => <span>{person.$data?.name}</span>)

const ContractOwner = createComponent()
	.entity('contract', contractDef, e => e.owner(o => o.name()))
	.render(({ contract }) => <span>{contract.$data?.owner.name}</span>)

const ContractLead = createComponent()
	.entity('contract', contractDef, e => e.owner({ as: 'lead' }, o => o.name({ as: 'fullName' })))
	.render(({ contract }) => <span>{contract.$data?.lead.fullName}</span>)

const ContractOwnerFragment = createComponent()
	.entity('contract', contractDef, e => e.owner(PersonName.$person))
	.render(({ contract }) => <span>{contract.$data?.owner.name}</span>)

const ContractReviewer = createComponent()
	.entity('contract', contractDef, e => e.reviewer(r => r.name()))
	.render(({ contract }) => <span>{contract.$data?.reviewer.name}</span>)

/** Passes its own selection of the nullable relation on. */
const ContractOwnerCard = createComponent()
	.entity('contract', contractDef, e => e.id().owner(o => o.name()))
	.render(({ contract }) => <ContractOwner contract={contract} />)

function nullableHasOneFromEntity(): ReactElement {
	return (
		<Entity entity={contractDef} by={{ id: 'c1' }}>
			{contract => (
				<>
					<ContractOwner contract={contract} />
					<ContractLead contract={contract} />
					<ContractOwnerFragment contract={contract} />
					<ContractReviewer contract={contract} />
				</>
			)}
		</Entity>
	)
}

type ContractOwnerProp = ComponentProps<typeof ContractOwner>['contract']
type ContractReviewerProp = ComponentProps<typeof ContractReviewer>['contract']

// ============================================================================
// Tests
// ============================================================================

describe('a has-many selected with an options object', () => {
	test('keeps a literal alias in $data', () => {
		expect(typeof hasManyWithOptionsFromEntity).toBe('function')
		assertTrue<IsEqual<keyof DataOf<typeof OpenTasks.$project>, 'openTasks'>>()
		assertTrue<IsEqual<keyof DataOf<typeof LatestTaskHeadlines.$project>, 'latest'>>()
	})

	test('keeps the field name without an alias', () => {
		assertTrue<IsEqual<keyof DataOf<typeof unaliasedOptionFragments.literal>, 'tasks'>>()
		assertTrue<IsEqual<keyof DataOf<typeof unaliasedOptionFragments.preset>, 'tasks'>>()
	})

	test('does not expose other keys', () => {
		assertFalse<IsAssignable<'tasks', keyof DataOf<typeof OpenTasks.$project>>>()
		assertFalse<IsAssignable<'wrong', keyof DataOf<typeof OpenTasks.$project>>>()
	})
})

describe('useEntityList with a component fragment', () => {
	test('types its items by the entity, so they go back to the component', () => {
		// Item types, positive and negative, are asserted inside TaskHeadlineList.
		expect(typeof TaskHeadlineList).toBe('function')
		expect(typeof TaskTitleList).toBe('function')
	})
})

describe('a nullable or optional has-one with a nested selection', () => {
	test('accepts the full <Entity> accessor', () => {
		expect(typeof nullableHasOneFromEntity).toBe('function')
		expect(ContractOwnerCard).toBeDefined()
	})

	test('still requires the nested source fields', () => {
		assertTrue<IsAssignable<EntityRef<Contract, { owner: { name: string } | null }>, ContractOwnerProp>>()
		assertFalse<IsAssignable<EntityRef<Contract, { owner: { id: string } | null }>, ContractOwnerProp>>()
		assertFalse<IsAssignable<EntityRef<Contract, { id: string }>, ContractOwnerProp>>()
		assertFalse<IsAssignable<EntityRef<Contract, { reviewer?: { id: string } }>, ContractReviewerProp>>()
		assertFalse<IsAssignable<EntityRef<Project>, ContractOwnerProp>>()
	})
})
