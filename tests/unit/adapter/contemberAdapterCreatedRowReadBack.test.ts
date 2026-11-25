import { describe, expect, test } from 'bun:test'
import { ContemberAdapter, SchemaRegistry, type SchemaNames } from '@contember/bindx'
import { ContentClient } from '@contember/bindx-client'
import { schemaNamesToDef } from '@contember/bindx-react'

const schemaNames: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: { id: { type: 'column' }, title: { type: 'column' }, tags: { type: 'many', entity: 'Tag' } },
		},
		Tag: {
			name: 'Tag',
			scalars: ['id', 'name', 'color', 'secret'],
			fields: { id: { type: 'column' }, name: { type: 'column' }, color: { type: 'column' }, secret: { type: 'column' } },
		},
	},
	enums: {},
}

const column = (name: string): Record<string, unknown> => ({
	__typename: '_Column', name, type: 'String', nullable: true, enumName: null, defaultValue: null,
})

/** Introspection of a role that cannot read `Tag.secret`. */
const introspection = {
	schema: {
		enums: [],
		entities: [
			{
				name: 'Article',
				customPrimaryAllowed: false,
				unique: [],
				fields: [column('id'), column('title'), {
					__typename: '_Relation', name: 'tags', type: 'ManyHasMany', nullable: null, side: 'owning', targetEntity: 'Tag',
					inversedBy: null, onDelete: null, orderBy: null, orphanRemoval: null,
				}],
			},
			{ name: 'Tag', customPrimaryAllowed: false, unique: [], fields: [column('id'), column('name'), column('color')] },
		],
	},
}

const mutationResponse = {
	mut: { ok: true, errorMessage: null, errors: [], validation: { valid: true, errors: [] }, node: { id: 'server-1' } },
}

interface Api {
	readonly adapter: ContemberAdapter
	readonly mutations: string[]
	schemaLoads: number
}

/** `failingLoads` introspection calls fail before the schema loads. */
function createApi(failingLoads = 0): Api {
	const api: Api = {
		mutations: [],
		schemaLoads: 0,
		adapter: new ContemberAdapter(
			new ContentClient({
				// Parses a response body the way a GraphQL client does.
				execute: (query: string) => {
					api.mutations.push(query)
					return new Response(JSON.stringify(mutationResponse)).json()
				},
			}),
			new SchemaRegistry(schemaNamesToDef(schemaNames)),
			{
				execute: () => {
					api.schemaLoads++
					if (api.schemaLoads <= failingLoads) return Promise.reject(new Error('introspection unavailable'))
					return new Response(JSON.stringify(introspection)).json()
				},
			},
		),
	}
	return api
}

/** The field names printed inside a `{ ... }` block that follows `name`. */
function selectedUnder(query: string, name: string): string[] {
	const start = query.indexOf(`${name} {`)
	if (start < 0) return []
	let depth = 0
	let body = ''
	for (const char of query.slice(start + name.length + 1)) {
		if (char === '{') depth++
		if (char === '}') depth--
		if (depth === 0) break
		if (depth === 1 && char !== '{' && char !== '}') body += char
	}
	return body.split(/\s+/).filter(Boolean)
}

describe('ContemberAdapter reads a created row back', () => {
	test('a create asks for every column the role can read, loading the schema once', async () => {
		const api = createApi()

		await api.adapter.create('Tag', { name: 'A' })
		await api.adapter.create('Tag', { name: 'B' })

		expect(api.schemaLoads).toBe(1)
		expect(selectedUnder(api.mutations[0]!, 'node')).toEqual(['id', 'name', 'color'])
	})

	test('a create fails without sending the mutation when the schema cannot load, and the next create loads it again', async () => {
		const api = createApi(1)

		await expect(api.adapter.create('Tag', { name: 'A' })).rejects.toThrow('introspection unavailable')
		expect(api.mutations).toEqual([])

		await api.adapter.create('Tag', { name: 'A' })
		expect(api.schemaLoads).toBe(2)
		expect(selectedUnder(api.mutations[0]!, 'node')).toEqual(['id', 'name', 'color'])
	})

	test('an update that creates nothing does not load the schema', async () => {
		const api = createApi()

		await api.adapter.persist('Article', 'article-1', { title: 'New title' })

		expect(api.schemaLoads).toBe(0)
		expect(selectedUnder(api.mutations[0]!, 'node')).toEqual(['id', 'title'])
	})

	test('an update with a nested create asks for the created rows\' columns', async () => {
		const api = createApi()

		await api.adapter.persist('Article', 'article-1', { tags: [{ create: { name: 'A' }, alias: 'temp-1' }] })

		expect(api.schemaLoads).toBe(1)
		expect(selectedUnder(api.mutations[0]!, 'node')).toEqual(['id', 'tags'])
		expect(selectedUnder(api.mutations[0]!, 'tags')).toEqual(['id', 'name', 'color'])
	})
})
