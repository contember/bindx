// Regression test for <issue-url — filled in after the issue is filed>
import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, Entity, Field, HasMany } from '@contember/bindx-react'
import type { QueryFieldSpec } from '@contember/bindx'
import { queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('<HasMany> with parameters', () => {
	test('should fetch only the filtered relation when the children read it only through a filtered <HasMany>', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		let tagFields: QueryFieldSpec[] = []
		adapter.query = (queries, options) => {
			for (const entry of queries) {
				if (entry.type === 'get') {
					tagFields = entry.spec.fields.filter(field => field.sourcePath[0] === 'tags')
				}
			}
			return query(queries, options)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => (
						<div data-testid="tags">
							<HasMany field={article.tags} filter={{ name: { eq: 'React' } }}>
								{tag => <Field field={tag.name} />}
							</HasMany>
						</div>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tags')).not.toBeNull()
		})

		// Only the aliased, filtered subquery; no plain `tags` next to it.
		expect(tagFields.map(field => ({ name: field.name, filter: field.filter }))).toEqual([
			{ name: expect.not.stringMatching(/^tags$/), filter: { name: { eq: 'React' } } },
		])
	})
})
