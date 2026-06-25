import '../../../setup'
// Regression test for https://github.com/contember/bindx/issues/53 (nested hasMany with orderBy reads empty from a single-entity accessor)
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, defineSchema, entityDef, hasMany, scalar, useEntity } from '@contember/bindx-react'

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
					{ id: 'tag-2', name: 'React', order: 1 },
					{ id: 'tag-1', name: 'JavaScript', order: 0 },
				],
			},
		},
	}
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

describe('useEntity nested hasMany with orderBy', () => {
	test('should expose nested hasMany items (ordered) when the relation is selected WITH orderBy', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, a =>
				a.id().title().tags({ orderBy: [{ order: 'asc' }] }, t => t.id().name()),
			)
			if (article.$status !== 'ready') return <div data-testid="loading">Loading...</div>
			return (
				<div>
					<span data-testid="title">{article.title.value}</span>
					<span data-testid="tag-count">{article.tags.items.length}</span>
					<span data-testid="tag-names">{article.tags.items.map(t => t.name.value).join(',')}</span>
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
		expect(container.querySelector('[data-testid="tag-count"]')?.textContent).toBe('2')
		// orderBy must be honored on the read path: order asc -> JavaScript (0) before React (1)
		expect(container.querySelector('[data-testid="tag-names"]')?.textContent).toBe('JavaScript,React')
	})

	test('control: nested hasMany WITHOUT orderBy exposes items', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, a =>
				a.id().title().tags(t => t.id().name()),
			)
			if (article.$status !== 'ready') return <div data-testid="loading">Loading...</div>
			return <span data-testid="tag-count">{article.tags.items.length}</span>
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
