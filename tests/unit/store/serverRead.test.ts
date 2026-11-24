// Regression tests for https://github.com/contember/bindx/issues/170
import { describe, expect, spyOn, test } from 'bun:test'
import {
	SchemaRegistry,
	SnapshotStore,
	buildQueryFromSelection,
	type SchemaDefinition,
	type SelectionFieldMeta,
	type SelectionMeta,
} from '@contember/bindx'
import { normalizeServerRead } from '../../../packages/bindx/src/store/serverRead.js'

interface Parent { id: string; code: string; name: string; status: string; extra: string; owner: Owner | null; items: Item[] }
interface Owner { id: string; name: string }
interface Tag { id: string; label: string }
interface Item { id: string; title: string; meta: unknown; parent: Parent | null; tags: Tag[] }

interface TestSchema {
	Item: Item
	Parent: Parent
	Owner: Owner
	Tag: Tag
	[key: string]: object
}

const definition: SchemaDefinition<TestSchema> = {
	entities: {
		Item: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				meta: { type: 'scalar' },
				parent: { type: 'hasOne', target: 'Parent' },
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Parent: {
			fields: {
				id: { type: 'scalar' },
				code: { type: 'scalar' },
				name: { type: 'scalar' },
				status: { type: 'scalar' },
				extra: { type: 'scalar' },
				owner: { type: 'hasOne', target: 'Owner' },
				items: { type: 'hasMany', target: 'Item' },
			},
		},
		Owner: { fields: { id: { type: 'scalar' }, name: { type: 'scalar' } } },
		Tag: { fields: { id: { type: 'scalar' }, label: { type: 'scalar' } } },
	},
}

const schema = new SchemaRegistry(definition)

const scalarField = (name: string, alias = name): SelectionFieldMeta => ({ fieldName: name, alias, path: [name], isArray: false, isRelation: false })

function columns(store: SnapshotStore, entityType: string, id: string): Record<string, unknown> | undefined {
	return store.getEntitySnapshot<Record<string, unknown>>(entityType, id)?.data
}

describe('normalizeServerRead', () => {
	test('should keep each entity\'s own columns and turn relations into references', () => {
		const read = normalizeServerRead('Item', {
			id: 'item-1',
			title: 'Hello',
			meta: { id: 'not-a-relation', nested: true },
			parent: { id: 'parent-1', name: 'Root', owner: null },
			tags: [{ id: 'tag-1', label: 'A' }, { id: 'tag-2', label: 'B' }],
		}, schema)

		expect(read.entities).toEqual([
			{ entityType: 'Parent', id: 'parent-1', columns: { id: 'parent-1', name: 'Root' } },
			{ entityType: 'Tag', id: 'tag-1', columns: { id: 'tag-1', label: 'A' } },
			{ entityType: 'Tag', id: 'tag-2', columns: { id: 'tag-2', label: 'B' } },
			{ entityType: 'Item', id: 'item-1', columns: { id: 'item-1', title: 'Hello', meta: { id: 'not-a-relation', nested: true } } },
		])
		expect(read.hasOne).toEqual([
			{ parentType: 'Item', parentId: 'item-1', fieldName: 'parent', targetId: 'parent-1' },
			{ parentType: 'Parent', parentId: 'parent-1', fieldName: 'owner', targetId: null },
		])
		expect(read.hasMany).toEqual([{
			parentType: 'Item',
			parentId: 'item-1',
			fieldName: 'tags',
			alias: 'tags',
			ids: ['tag-1', 'tag-2'],
			totalCount: undefined,
			membership: undefined,
		}])
	})

	test('should read aliased fields and list views by the query, with the total count of a connection', () => {
		const selection: SelectionMeta = {
			fields: new Map([
				['id', scalarField('id')],
				['heading', scalarField('title', 'heading')],
				['tags_filtered', {
					fieldName: 'tags',
					alias: 'tags_filtered',
					path: ['tags'],
					isArray: true,
					isRelation: true,
					nested: { fields: new Map([['id', scalarField('id')], ['label', scalarField('label')]]) },
					hasManyParams: { filter: { label: { eq: 'A' } } },
				}],
			]),
		}
		const read = normalizeServerRead('Item', {
			id: 'item-1',
			heading: 'Hello',
			tags_filtered: { pageInfo: { totalCount: 7 }, edges: [{ node: { id: 'tag-1', label: 'A' } }] },
		}, schema, { spec: buildQueryFromSelection(selection) })

		expect(read.entities.find(entity => entity.id === 'item-1')?.columns).toEqual({ id: 'item-1', heading: 'Hello' })
		expect(read.hasMany).toEqual([{
			parentType: 'Item',
			parentId: 'item-1',
			fieldName: 'tags',
			alias: 'tags_filtered',
			ids: ['tag-1'],
			totalCount: 7,
			membership: 'partial',
		}])
	})

	test('should leave out a record without an id, with everything below it', () => {
		const read = normalizeServerRead('Item', [
			{ title: 'No id', parent: { id: 'parent-1', name: 'Root' } },
			{ id: 'item-2', title: 'Kept' },
		], schema)

		expect(read.entities.map(entity => entity.id)).toEqual(['item-2'])
		expect(read.hasOne).toEqual([])
	})
})

describe('SnapshotStore.writeServerRead', () => {
	test('should keep every field of a related entity across two reads with different selections', () => {
		for (const [first, second] of [['wide', 'narrow'], ['narrow', 'wide']] as const) {
			const store = new SnapshotStore()
			const reads = {
				wide: { id: 'item-1', parent: { id: 'parent-1', code: 'P1', name: 'Root', status: 'active' } },
				narrow: { id: 'item-1', title: 'Hello', parent: { id: 'parent-1', status: 'active', extra: 'more' } },
			}
			store.writeServerRead('Item', reads[first], schema)
			store.writeServerRead('Item', reads[second], schema)

			expect(columns(store, 'Parent', 'parent-1')).toEqual({ id: 'parent-1', code: 'P1', name: 'Root', status: 'active', extra: 'more' })
			expect(columns(store, 'Item', 'item-1')).toEqual({ id: 'item-1', title: 'Hello' })
			expect(store.getRelation('Item', 'item-1', 'parent')?.currentId).toBe('parent-1')
		}
	})

	test('should keep a local edit of a related entity when a later read carries it', () => {
		const store = new SnapshotStore()
		store.writeServerRead('Item', { id: 'item-1', parent: { id: 'parent-1', name: 'Root' } }, schema)
		store.setFieldValue('Parent', 'parent-1', ['name'], 'Edited')

		store.writeServerRead('Item', { id: 'item-1', parent: { id: 'parent-1', name: 'Root again', status: 'active' } }, schema)

		expect(store.getEntitySnapshot<Record<string, unknown>>('Parent', 'parent-1')).toMatchObject({
			data: { name: 'Edited', status: 'active' },
			serverData: { name: 'Root again', status: 'active' },
		})
	})

	test('should take a fresher read of an entity reached through another root', () => {
		const store = new SnapshotStore()
		store.writeServerRead('Item', { id: 'item-1', parent: { id: 'parent-1', name: 'Old' } }, schema)
		store.writeServerRead('Parent', { id: 'parent-1', name: 'New' }, schema)

		expect(columns(store, 'Parent', 'parent-1')?.['name']).toBe('New')
	})

	// Every row points at one parent. Interleaving relation writes with notifications
	// re-walks every row already written for each row: quadratic in the row count.
	const rowCount = 400
	const hubRows = (): Record<string, unknown>[] => Array.from({ length: rowCount }, (_, index) => ({
		id: `item-${index}`,
		title: `Row ${index}`,
		parent: { id: 'parent-1', name: 'Shared', owner: { id: 'owner-1', name: 'Hub' } },
	}))

	test('should walk the parents of a hub-shaped read a linear number of times', () => {
		const store = new SnapshotStore()
		const parentWalks = spyOn(store, 'bumpEntitySnapshotVersion')
		store.writeServerRead('Item', hubRows(), schema)

		expect(parentWalks.mock.calls.length).toBeLessThanOrEqual(3 * rowCount)
	})

	test('should walk the parents of a hub-shaped read linearly when the hub\'s own list is loaded', () => {
		const store = new SnapshotStore()
		store.writeServerRead('Parent', {
			id: 'parent-1',
			items: Array.from({ length: rowCount }, (_, index) => ({ id: `item-${index}` })),
		}, schema)
		const parentWalks = spyOn(store, 'bumpEntitySnapshotVersion')
		store.writeServerRead('Item', hubRows(), schema)

		expect(parentWalks.mock.calls.length).toBeLessThanOrEqual(3 * rowCount)
	})

	test('should keep the total count of a list view when a later read of it carries none', () => {
		const store = new SnapshotStore()
		const counted = Object.assign([{ id: 'tag-1', label: 'A' }], { totalCount: 5 })
		store.writeServerRead('Item', { id: 'item-1', tags: counted }, schema)
		store.writeServerRead('Item', { id: 'item-1', tags: [{ id: 'tag-1' }] }, schema)

		expect(store.getHasManyTotalCount('Item', 'item-1', 'tags')).toBe(5)
	})

	test('should advance the has-one server baseline under a local change, keeping the change', () => {
		const store = new SnapshotStore()
		store.writeServerRead('Item', { id: 'item-1', parent: { id: 'parent-a' } }, schema)
		store.setRelation('Item', 'item-1', 'parent', { currentId: 'parent-x', state: 'connected' })

		store.writeServerRead('Item', { id: 'item-1', parent: { id: 'parent-y' } }, schema)

		expect(store.getRelation('Item', 'item-1', 'parent')).toMatchObject({
			currentId: 'parent-x',
			serverId: 'parent-y',
		})
	})
})
