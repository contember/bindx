/**
 * A has-one update whose data carries a JSON column named `data` must not be mistaken
 * for the has-many `{ update: { by, data } }` shape.
 */
import { describe, test, expect } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	type SchemaNames,
} from '@contember/bindx'
import { buildNodeSelectionFromMutationData } from '@contember/bindx-client'

const schema: SchemaNames = {
	entities: {
		Page: {
			name: 'Page',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				content: { type: 'one', entity: 'Content' },
			},
		},
		Content: {
			name: 'Content',
			// `data` is an ordinary JSON column here, not a mutation wrapper.
			scalars: ['id', 'heading', 'data'],
			fields: {
				id: { type: 'column' },
				heading: { type: 'column' },
				data: { type: 'column' },
			},
		},
	},
	enums: {},
}

interface SelectionField { readonly name: string; readonly selectionSet?: readonly unknown[] }

function fieldNames(selectionSet: readonly unknown[]): string[] {
	return selectionSet.map(item => (item as SelectionField).name)
}

function childOf(selectionSet: readonly unknown[], name: string): readonly unknown[] {
	const field = selectionSet.find(item => (item as SelectionField).name === name) as SelectionField | undefined
	if (!field?.selectionSet) throw new Error(`no nested selection for "${name}": ${fieldNames(selectionSet).join(', ')}`)
	return field.selectionSet
}

describe('node selection for a hasOne update touching a JSON column named `data`', () => {
	test('selects the related entity\'s own columns, not the JSON payload keys', () => {
		const store = new SnapshotStore()
		const collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schema))

		store.setEntityData('Page', 'p-1', { id: 'p-1', title: 'Page' }, true)
		store.setEntityData('Content', 'c-1', {
			id: 'c-1',
			heading: 'Old heading',
			data: { theme: 'light' },
		}, true)
		store.setExistsOnServer('Content', 'c-1', true)
		store.getOrCreateRelation('Page', 'p-1', 'content', {
			currentId: 'c-1',
			serverId: 'c-1',
			state: 'connected',
			serverState: 'connected',
			placeholderData: {},
		})

		store.setFieldValue('Content', 'c-1', ['heading'], 'New heading')
		store.setFieldValue('Content', 'c-1', ['data'], { theme: 'dark' })

		const mutation = collector.collectUpdateData('Page', 'p-1')
		expect(mutation).toEqual({
			content: { update: { heading: 'New heading', data: { theme: 'dark' } } },
		})

		const content = childOf(buildNodeSelectionFromMutationData(mutation!), 'content')

		// `theme` is a key of the JSON payload — Content has no such column,
		// so asking for it makes the whole mutation invalid.
		expect(fieldNames(content)).not.toContain('theme')
		expect(fieldNames(content)).toContain('heading')
	})
})
