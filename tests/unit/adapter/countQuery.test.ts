import '../../setup'
import { describe, test, expect } from 'bun:test'
import { MockAdapter } from '@contember/bindx'
import type { CountQuery, CountQueryResult } from '@contember/bindx'

interface Article {
	id: string
	title: string
	published: boolean
}

function createAdapter(): MockAdapter {
	return new MockAdapter(
		{
			Article: {
				a1: { id: 'a1', title: 'A', published: true },
				a2: { id: 'a2', title: 'B', published: false },
				a3: { id: 'a3', title: 'C', published: true },
				a4: { id: 'a4', title: 'D', published: true },
			},
		},
		{ delay: 0 },
	)
}

describe('MockAdapter count query', () => {
	test('counts all rows when no filter is given', async () => {
		const adapter = createAdapter()
		const query: CountQuery = { type: 'count', entityType: 'Article' }

		const [result] = await adapter.query([query])

		expect(result?.type).toBe('count')
		expect((result as CountQueryResult).count).toBe(4)
	})

	test('counts only rows matching the filter', async () => {
		const adapter = createAdapter()
		const query: CountQuery<Article> = { type: 'count', entityType: 'Article', filter: { published: { eq: true } } }

		const [result] = await adapter.query([query])

		expect((result as CountQueryResult).count).toBe(3)
	})

	test('returns 0 for an unknown entity type', async () => {
		const adapter = createAdapter()
		const query: CountQuery = { type: 'count', entityType: 'Missing' }

		const [result] = await adapter.query([query])

		expect((result as CountQueryResult).count).toBe(0)
	})

	test('count is independent of limit/offset (whole filtered set)', async () => {
		const adapter = createAdapter()
		// A list query is paginated, but a sibling count reports the full filtered size.
		const [list, count] = await adapter.query([
			{ type: 'list', entityType: 'Article', limit: 2, offset: 0, spec: { fields: [{ name: 'id', sourcePath: ['id'] }] } },
			{ type: 'count', entityType: 'Article' },
		])

		expect(list?.type).toBe('list')
		expect((count as CountQueryResult).count).toBe(4)
	})
})
