// Regression test for https://github.com/contember/bindx/issues/158
import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { act, render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, Entity, Field, HasMany, createComponent } from '@contember/bindx-react'
import type { HasManyAccessor, QueryFieldSpec } from '@contember/bindx'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

function recordTagFields(adapter: MockAdapter): { current: QueryFieldSpec[] } {
	const query = adapter.query.bind(adapter)
	const tagFields: { current: QueryFieldSpec[] } = { current: [] }
	adapter.query = (queries, options) => {
		for (const entry of queries) {
			if (entry.type === 'get') {
				tagFields.current = entry.spec.fields.filter(field => field.sourcePath[0] === 'tags')
			}
		}
		return query(queries, options)
	}
	return tagFields
}

const nestedFieldNames = (field: QueryFieldSpec | undefined): string[] => field?.nested?.fields.map(nested => nested.name) ?? []

describe('<HasMany> with parameters', () => {
	test('should fetch the children fields only under the params alias', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const tagFields = recordTagFields(adapter)

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

		const filtered = tagFields.current.find(field => field.filter !== undefined)
		const plain = tagFields.current.find(field => field.name === 'tags')
		expect(filtered?.filter).toEqual({ name: { eq: 'React' } })
		expect(nestedFieldNames(filtered)).toContain('name')
		// Reading `article.tags` registers the relation with its id only; the children's
		// fields are not fetched for the whole relation.
		expect(nestedFieldNames(plain)).toEqual(['id'])
	})

	test('should render the filtered list, not the whole relation', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
			expect(getByTestId(container, 'tags').textContent).toBe('React')
		})
	})

	test('should render each sibling <HasMany> with its own parameters', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => (
						<div>
							<div data-testid="all">
								<HasMany field={article.tags}>{tag => <Field field={tag.name} />}</HasMany>
							</div>
							<div data-testid="react">
								<HasMany field={article.tags} filter={{ name: { eq: 'React' } }}>{tag => <Field field={tag.name} />}</HasMany>
							</div>
							<div data-testid="javascript">
								<HasMany field={article.tags} filter={{ name: { eq: 'JavaScript' } }}>{tag => <Field field={tag.color} />}</HasMany>
							</div>
						</div>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'all').textContent).toBe('JavaScriptReact')
		})
		expect(getByTestId(container, 'react').textContent).toBe('React')
		expect(getByTestId(container, 'javascript').textContent).toBe('#f7df1e')
	})

	test('should keep showing items added to the relation in an orderBy-only list', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let tags: HasManyAccessor<{ id: string; name: string; color: string }> | null = null

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => {
						tags = article.tags as unknown as typeof tags
						return (
							<div data-testid="tags">
								<HasMany field={article.tags} orderBy={[{ name: 'desc' }]}>{tag => <Field field={tag.name} />}</HasMany>
							</div>
						)
					}}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'tags').textContent).toBe('ReactJavaScript')
		})

		act(() => {
			tags!.add({ name: 'Zed', color: '#000' })
		})

		await waitFor(() => {
			expect(getByTestId(container, 'tags').textContent).toContain('Zed')
		})
	})

	test('should render the filtered list from a component collected implicitly', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const ReactTags = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<HasMany field={article.tags} filter={{ name: { eq: 'React' } }}>{tag => <Field field={tag.name} />}</HasMany>
			))

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => <div data-testid="tags"><ReactTags article={article} /></div>}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'tags').textContent).toBe('React')
		})
	})
})
