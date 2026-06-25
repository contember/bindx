import '../../../setup'
// Regression test for https://github.com/contember/bindx/issues/53 (nested hasMany with orderBy reads empty from a list-loaded accessor)
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, defineSchema, entityDef, hasMany, scalar, useEntityList } from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Tag {
	id: string
	name: string
	order: number
}

interface Article {
	id: string
	title: string
	tags: Tag[]
}

interface TestSchema {
	Article: Article
	Tag: Tag
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				tags: hasMany('Tag'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				order: scalar(),
			},
		},
	},
})

const entityDefs = {
	Article: entityDef<Article>('Article'),
	Tag: entityDef<Tag>('Tag'),
} as const

function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				tags: [
					{ id: 'tag-1', name: 'JavaScript', order: 0 },
					{ id: 'tag-2', name: 'React', order: 1 },
				],
			},
		},
	}
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

// The nested hasMany `tags` is selected with an `orderBy` argument. The adapter returns the two tags
// (verifiable by logging the raw query result), but reading `list.items[0].tags.items` yields an empty
// array — the relation's scalar siblings (title) load fine, only the ordered hasMany comes back empty.
describe('useEntityList nested hasMany with orderBy', () => {
	test('should expose nested hasMany items when the relation is selected WITH orderBy', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const list = useEntityList(entityDefs.Article, { filter: { id: { eq: 'article-1' } } }, a =>
				a.id().title().tags({ orderBy: [{ order: 'asc' }] }, t => t.id().name()),
			)
			if (list.$status !== 'ready') return <div data-testid="loading">Loading...</div>
			const article = list.items[0]
			return (
				<div>
					<span data-testid="title">{article?.title.value}</span>
					<span data-testid="tag-count">{article ? article.tags.items.length : -1}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(container.querySelector('[data-testid="title"]')?.textContent).toBe('Test Article')
		// Bug: reads '0'. The two ordered tags are dropped from the accessor.
		expect(container.querySelector('[data-testid="tag-count"]')?.textContent).toBe('2')
	})

	test('control: nested hasMany WITHOUT orderBy exposes items', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const list = useEntityList(entityDefs.Article, { filter: { id: { eq: 'article-1' } } }, a =>
				a.id().title().tags(t => t.id().name()),
			)
			if (list.$status !== 'ready') return <div data-testid="loading">Loading...</div>
			const article = list.items[0]
			return <span data-testid="tag-count">{article ? article.tags.items.length : -1}</span>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-count')).not.toBeNull()
		})

		expect(container.querySelector('[data-testid="tag-count"]')?.textContent).toBe('2')
	})
})
