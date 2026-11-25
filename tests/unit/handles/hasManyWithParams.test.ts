import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EntityHandle,
	SchemaRegistry,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	SelectionScope,
	type SchemaDefinition,
	type SchemaNames,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

interface TestPost { id: string; title: string; content: TestContent | null }
interface TestContent { id: string; data: string; references: TestRef[] }
interface TestRef { id: string; type: string }
interface S { Post: TestPost; Content: TestContent; ContentReference: TestRef; [k: string]: object }

const schemaDef: SchemaDefinition<S> = {
	entities: {
		Post: { fields: { id: { type: 'scalar' }, title: { type: 'scalar' }, content: { type: 'hasOne', target: 'Content', nullable: true } } },
		Content: { fields: { id: { type: 'scalar' }, data: { type: 'scalar' }, references: { type: 'hasMany', target: 'ContentReference' } } },
		ContentReference: { fields: { id: { type: 'scalar' }, type: { type: 'scalar' } } },
	},
}

const schemaNames: SchemaNames = {
	entities: {
		Post: { name: 'Post', scalars: ['id', 'title'], fields: { id: { type: 'column' }, title: { type: 'column' }, content: { type: 'one', entity: 'Content', nullable: true } } },
		Content: { name: 'Content', scalars: ['id', 'data'], fields: { id: { type: 'column' }, data: { type: 'column' }, references: { type: 'many', entity: 'ContentReference' } } },
		ContentReference: { name: 'ContentReference', scalars: ['id', 'type'], fields: { id: { type: 'column' }, type: { type: 'column' } } },
	},
	enums: {},
}

const LIMIT_ONE = { limit: 1 }

describe('HasManyRef.withParams', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let schema: SchemaRegistry<S>

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		schema = new SchemaRegistry(schemaDef)
		store.setEntityData('Content', 'content-1', { id: 'content-1', data: '', references: [] }, true)
		store.setExistsOnServer('Content', 'content-1', true)
	})

	function createContent(): ReturnType<typeof EntityHandle.create<TestContent>> {
		const scope = new SelectionScope()
		scope.child('references').addScalar('type')
		scope.markAsArray('references')
		scope.hasManyChild('references', LIMIT_ONE).addScalar('type')
		return EntityHandle.create<TestContent>('content-1', 'Content', store, dispatcher, schema, undefined, scope.toSelectionMeta())
	}

	test('returns the same public handle for params the relation is read with', () => {
		const content = createContent()
		expect(content.references.withParams({})).toBe(content.references)
	})

	test('returns the same public handle when the parent selects no alias for the params', () => {
		const content = createContent()
		expect(content.references.withParams({ limit: 5 })).toBe(content.references)
	})

	test('returns one stable handle per selected params alias', () => {
		const content = createContent()
		const view = content.references.withParams(LIMIT_ONE)
		expect(view).not.toBe(content.references)
		expect(content.references.withParams(LIMIT_ONE)).toBe(view)
	})

	test('add() through withParams of a placeholder relation still materializes the parent', () => {
		store.setEntityData('Post', 'post-1', { id: 'post-1', title: 'Hello', content: null }, true)
		store.setExistsOnServer('Post', 'post-1', true)
		const post = EntityHandle.create<TestPost>('post-1', 'Post', store, dispatcher, schema)

		post.content.references.withParams({}).add({ id: 'ref-1' })

		const collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schemaNames))
		const mutation = collector.collectUpdateData('Post', 'post-1')
		expect(mutation).toMatchObject({ content: { create: { references: [{ create: { id: 'ref-1' } }] } } })
	})
})
