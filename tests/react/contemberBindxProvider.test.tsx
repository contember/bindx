import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import type { SchemaNames } from '@contember/bindx'
import { ContemberBindxProvider, entityDef, useEntity, type BindxGraphQlClient } from '@contember/bindx-react'
import { getByTestId, queryByTestId } from '../shared'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
}

const schema = { Article: entityDef<Article>('Article') }

const schemaNames: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: { id: { type: 'column' }, title: { type: 'column' } },
		},
	},
	enums: {},
}

interface RecordingClient extends BindxGraphQlClient {
	readonly queries: string[]
}

/** Answers every query with one Article row whose title names the client. */
function createClient(title: string): RecordingClient {
	const queries: string[] = []
	return {
		queries,
		execute: <T,>(query: string): Promise<T> => {
			queries.push(query)
			const alias = /(\w+)\s*:\s*getArticle\b/.exec(query)?.[1] ?? 'getArticle'
			return new Response(JSON.stringify({ [alias]: { id: 'article-1', title } })).json()
		},
	}
}

function ArticleTitle(): React.ReactElement {
	const article = useEntity(schema.Article, { by: { id: 'article-1' } }, e => e.title())
	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div data-testid="loading">Loading...</div>
	}
	return <div data-testid="title">{article.title.value}</div>
}

describe('ContemberBindxProvider', () => {
	test('queries through the new client after the client prop changes', async () => {
		const first = createClient('from first client')
		const second = createClient('from second client')

		const { container, rerender } = render(
			<ContemberBindxProvider schema={schemaNames} client={first}>
				<ArticleTitle />
			</ContemberBindxProvider>,
		)
		await waitFor(() => {
			expect(queryByTestId(container, 'title')?.textContent).toBe('from first client')
		})
		const firstQueryCount = first.queries.length
		expect(firstQueryCount).toBeGreaterThan(0)

		rerender(
			<ContemberBindxProvider schema={schemaNames} client={second}>
				<ArticleTitle />
			</ContemberBindxProvider>,
		)
		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('from second client')
		})
		expect(second.queries.length).toBeGreaterThan(0)
		expect(first.queries.length).toBe(firstQueryCount)
	})
})
