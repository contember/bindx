// Regression test for https://github.com/contember/bindx/issues/140
import '../../setup'
import { describe, expect, test } from 'bun:test'
import { unwrapPaginateFields, unwrapPaginateResult } from '@contember/bindx'
import type { QuerySpec } from '@contember/bindx'

/**
 * A has-many selected with `{ totalCount: true }` asks the server for
 * `pageInfo { totalCount }`. `unwrapPaginateResult` attaches that count to the
 * unwrapped array as a non-enumerable `totalCount`, which is what
 * `HasManyListHandle.totalCount` reads. `unwrapPaginateFields` then recurses
 * into the items with `items.map(...)`, and a mapped array is a new array
 * without the property — the count the server sent never reaches the handle.
 */
describe('unwrapPaginateFields with totalCount', () => {

	const spec: QuerySpec = {
		fields: [
			{ name: 'id', sourcePath: ['id'] },
			{
				name: 'sessions_abc123',
				sourcePath: ['sessions'],
				isArray: true,
				totalCount: true,
				nested: {
					fields: [
						{ name: 'id', sourcePath: ['id'] },
						{ name: 'startDate', sourcePath: ['startDate'] },
					],
				},
			},
		],
	}

	const data = {
		id: 'p1',
		sessions_abc123: {
			pageInfo: { totalCount: 36 },
			edges: [{ node: { id: 's1', startDate: '2027-01-04T07:30:00.000Z' } }],
		},
	}

	test('unwrapPaginateResult attaches the total count to the unwrapped array', () => {
		const items = unwrapPaginateResult(data.sessions_abc123, true)
		expect((items as unknown[] & { totalCount?: number }).totalCount).toBe(36)
	})

	test('should keep the total count on the has-many array when the items are unwrapped recursively', () => {
		const result = unwrapPaginateFields(data, spec)
		const sessions = result['sessions_abc123'] as Record<string, unknown>[] & { totalCount?: number }

		expect(sessions).toEqual([{ id: 's1', startDate: '2027-01-04T07:30:00.000Z' }])
		expect(sessions.totalCount).toBe(36)
	})
})
