import { describe, test, expect } from 'bun:test'
import { ContentClient, ContentOperation, buildCountSelection, qb, entityDef } from '@contember/bindx-client'

// ============================================================================
// Regression: count query must serialize with a non-empty selection set
//
// A standalone count query is the only selection set that used to be built
// outside @contember/bindx-client (directly in ContemberAdapter, against a
// separate @contember/graphql-builder copy). When a consumer resolved a
// divergent graphql-builder version for the two packages, the query printer's
// `node instanceof GraphQlField` check failed and silently dropped the fields,
// emitting `paginate<Entity> { }` — invalid GraphQL ("Expected Name, found }").
//
// Building the selection set inside bindx-client (buildCountSelection) keeps
// every GraphQlField on the same copy the printer uses.
// ============================================================================

interface Article {
	id: string
	title: string
}

const schema = {
	Article: entityDef<Article>('Article'),
} as const

function createCapturingClient(response: unknown): { client: ContentClient; getLastQuery: () => string } {
	let lastQuery = ''
	const client = new ContentClient({
		execute: async (query: string) => {
			lastQuery = query
			return response as never
		},
	})
	return { client, getLastQuery: () => lastQuery }
}

describe('buildCountSelection', () => {
	test('produces a pageInfo { totalCount } selection set', () => {
		const selection = buildCountSelection()
		expect(selection).toHaveLength(1)
		const pageInfo = selection[0] as { name: string; selectionSet?: { name: string }[] }
		expect(pageInfo.name).toBe('pageInfo')
		expect(pageInfo.selectionSet?.map(f => f.name)).toEqual(['totalCount'])
	})
})

describe('count query serialization', () => {
	test('serializes paginate<Entity> with a non-empty body', async () => {
		const { client, getLastQuery } = createCapturingClient({ value: { pageInfo: { totalCount: 7 } } })

		// parse output is irrelevant here — the test asserts on the serialized query.
		const countQuery = new ContentOperation(
			'query',
			'paginateArticle',
			{},
			buildCountSelection(),
			(): number => 0,
		)

		await client.query(countQuery)

		const printed = getLastQuery()
		expect(printed).toContain('paginateArticle')
		expect(printed).toContain('pageInfo')
		expect(printed).toContain('totalCount')
		// The bug rendered an empty body: `paginateArticle { }`
		expect(printed).not.toMatch(/paginateArticle\s*{\s*}/)
	})

	test('qb.count serializes identically (same selection shape)', async () => {
		const { client, getLastQuery } = createCapturingClient({ value: { pageInfo: { totalCount: 3 } } })

		await client.query(qb.count(schema.Article, {}))

		const printed = getLastQuery()
		expect(printed).toContain('pageInfo')
		expect(printed).toContain('totalCount')
		expect(printed).not.toMatch(/paginateArticle\s*{\s*}/)
	})
})
