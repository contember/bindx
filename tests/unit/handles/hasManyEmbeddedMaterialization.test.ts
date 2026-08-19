import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EntityHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type HasManyAccessor,
} from '@contember/bindx'

/**
 * A has-many loaded as embedded data on its parent has no state in the store until
 * something materializes it. `items` and `getById` do that; every other entry point
 * used to read and write around it, so a consumer that never iterated the list saw
 * `isDirty === false` and had its mutations land on a state nobody reads.
 */

interface TestTag {
	id: string
	name: string
}

interface TestArticle {
	id: string
	title: string
	tags: TestTag[]
}

interface TestSchema {
	Article: TestArticle
	Tag: TestTag
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Tag: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
			},
		},
	},
}

describe('has-many with embedded parent data, never iterated', () => {
	let store: SnapshotStore
	let tags: HasManyAccessor<TestTag>

	beforeEach(() => {
		store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)

		// Embedded shape: the list arrives inside the parent's snapshot and nothing calls
		// getOrCreateHasMany — exactly what a query with a nested selection produces.
		store.setEntityData('Article', 'article-1', {
			id: 'article-1',
			title: 'T',
			tags: [{ id: 'tag-1', name: 'A' }, { id: 'tag-2', name: 'B' }],
		}, true)
		store.setExistsOnServer('Article', 'article-1', true)

		const schema = new SchemaRegistry(testSchemaDefinition)
		const article = EntityHandle.create<TestArticle>(
			'article-1',
			'Article',
			store,
			dispatcher,
			schema,
		)
		tags = article.tags
	})

	test('disconnect marks the relation dirty without reading items first', () => {
		expect(tags.isDirty).toBe(false)

		tags.disconnect('tag-1')

		expect(tags.isDirty).toBe(true)
	})

	test('the disconnect is visible to a later items read', () => {
		tags.disconnect('tag-1')

		expect(tags.items).toHaveLength(1)
	})

	test('connect marks the relation dirty without reading items first', () => {
		store.setEntityData('Tag', 'tag-3', { id: 'tag-3', name: 'C' }, true)
		store.setExistsOnServer('Tag', 'tag-3', true)

		tags.connect('tag-3')

		expect(tags.isDirty).toBe(true)
		expect(tags.items).toHaveLength(3)
	})

	test('reading items first still works — the guard is idempotent', () => {
		expect(tags.items).toHaveLength(2)

		tags.disconnect('tag-1')

		expect(tags.isDirty).toBe(true)
		expect(tags.items).toHaveLength(1)
	})
})
