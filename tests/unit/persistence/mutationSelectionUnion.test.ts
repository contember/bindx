import { describe, test, expect } from 'bun:test'
import { buildNodeSelectionFromMutationData } from '@contember/bindx-client'

// Lives under tests/unit/ rather than tests/bindx-client/ because only tests/unit,
// tests/react and tests/cases are in the CI `test` script.

interface SelectionField {
	readonly name: string
	readonly selectionSet?: readonly unknown[]
}

interface FieldNames {
	name: string
	children?: FieldNames[]
}

function isSelectionField(value: unknown): value is SelectionField {
	return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
}

function readFieldNames(selectionSet: readonly unknown[]): FieldNames[] {
	return selectionSet.map(item => {
		if (!isSelectionField(item)) {
			throw new Error('selection entry is not a GraphQL field')
		}
		return {
			name: item.name,
			children: item.selectionSet ? readFieldNames(item.selectionSet) : undefined,
		}
	})
}

function findField(fields: FieldNames[], name: string): FieldNames | undefined {
	return fields.find(field => field.name === name)
}

describe('Node selection across sibling create operations', () => {
	test('unions the nested relation shapes of every sibling, not just the last one', () => {
		const selection = readFieldNames(buildNodeSelectionFromMutationData({
			title: 'Contacts',
			blocks: [
				{ alias: 'a', create: { order: 1, button: { create: { label: 'A', modalTitle: 'Modal' } } } },
				{ alias: 'b', create: { order: 2, button: { create: { label: 'B', link: { create: { type: 'external' } } } } } },
			],
		}))

		const button = findField(findField(selection, 'blocks')?.children ?? [], 'button')
		const buttonFields = (button?.children ?? []).map(field => field.name)

		expect(buttonFields).toContain('id')
		expect(buttonFields).toContain('label')
		expect(buttonFields).toContain('modalTitle')
		expect(buttonFields).toContain('link')
	})

	test('unions nested shapes recursively, across siblings of a nested hasMany', () => {
		const selection = readFieldNames(buildNodeSelectionFromMutationData({
			blocks: [
				{ alias: 'a', create: { items: [{ alias: 'a1', create: { label: 'A' } }] } },
				{ alias: 'b', create: { items: [{ alias: 'b1', create: { note: 'B' } }] } },
			],
		}))

		const items = findField(findField(selection, 'blocks')?.children ?? [], 'items')

		expect((items?.children ?? []).map(field => field.name)).toEqual(['id', 'label', 'note'])
	})

	test('requests each field once, even when the data already carries an id', () => {
		const selection = readFieldNames(buildNodeSelectionFromMutationData({ id: 'page-1', title: 'Contacts' }))

		expect(selection.map(field => field.name)).toEqual(['id', 'title'])
	})
})
