import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EntityHandle,
	SchemaRegistry,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	type SchemaDefinition,
	type SchemaNames,
} from '@contember/bindx'
import { createTestDispatcher } from './unit/shared/unitTestHelpers.js'

// NPI shape: Post → content (hasOne Content) → references (hasMany ContentReference)
interface TestPost { id: string; title: string; content: TestContent }
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

describe('placeholder has-many → persist round-trip', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let schema: SchemaRegistry<S>
	let collector: MutationCollector

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		schema = new SchemaRegistry(schemaDef)
		collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schemaNames))
	})

	// Editing the scalar data of a not-yet-connected content already round-trips today.
	test('typing into a placeholder content nests content.create.data', () => {
		store.setEntityData('Post', 'post-1', { id: 'post-1', title: 'Hello', content: null }, true)
		store.setExistsOnServer('Post', 'post-1', true)

		const post = EntityHandle.create<TestPost>('post-1', 'Post', store, dispatcher, schema)
		;(post.content as any).data.setValue('{"children":[]}')

		const mutation = collector.collectUpdateData('Post', 'post-1') as any
		expect(mutation.content.create.data).toBe('{"children":[]}')
	})

	// Adding a has-many child to a placeholder parent promotes it into a real "creating" entity
	// (PlaceholderHandle.materializeIntoParent), so both the content and its reference round-trip.
	test('inserting a reference block into a placeholder content nests content.create.references', () => {
		store.setEntityData('Post', 'post-1', { id: 'post-1', title: 'Hello', content: null }, true)
		store.setExistsOnServer('Post', 'post-1', true)

		const post = EntityHandle.create<TestPost>('post-1', 'Post', store, dispatcher, schema)
		const content = post.content as any
		content.data.setValue('{"children":[]}')
		const refId = content.references.add({ id: 'ref-1' })
		content.references.getById(refId).type.setValue('testimonial')

		const mutation = collector.collectUpdateData('Post', 'post-1') as any
		expect(mutation.content.create.data).toBe('{"children":[]}')
		expect(mutation.content.create.references).toEqual([
			{ create: { id: 'ref-1', type: 'testimonial' }, alias: 'ref-1' },
		])
	})

	// Reverse order: insert the block first, then type — same round-trip.
	test('adding a reference before typing still nests both', () => {
		store.setEntityData('Post', 'post-1', { id: 'post-1', title: 'Hello', content: null }, true)
		store.setExistsOnServer('Post', 'post-1', true)

		const post = EntityHandle.create<TestPost>('post-1', 'Post', store, dispatcher, schema)
		const content = post.content as any
		const refId = content.references.add({ id: 'ref-1' })
		content.references.getById(refId).type.setValue('testimonial')
		// content re-resolves to the real (now connected) entity after promotion
		post.content.data.setValue('typed after')

		const mutation = collector.collectUpdateData('Post', 'post-1') as any
		expect(mutation.content.create.data).toBe('typed after')
		expect(mutation.content.create.references).toEqual([
			{ create: { id: 'ref-1', type: 'testimonial' }, alias: 'ref-1' },
		])
	})
})
