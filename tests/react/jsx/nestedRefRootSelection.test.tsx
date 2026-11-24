import '../../setup'
// A field ref reached through a has-one (`article.author.email`) and passed to a
// selection-building component must be selected under that relation only — not
// also as a stray `email` column of the root entity.
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import {
	BindxProvider,
	Case,
	Default,
	Entity,
	Field,
	If,
	MockAdapter,
	Show,
	Switch,
	cond,
	useAccessor,
	type EntityRef,
} from '@contember/bindx-react'
import type { Query, QueryOptions, QueryResult, QuerySpec } from '@contember/bindx'
import { createMockData, queryByTestId, schema, testSchema, type Article } from '../../shared'

afterEach(() => {
	cleanup()
})

class RecordingAdapter extends MockAdapter {
	readonly queries: Query[] = []

	override async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		this.queries.push(...queries)
		return super.query(queries, options)
	}
}

interface Observed {
	rootFields: string[]
	authorFields: string[]
	rootDataKeys: string[]
}

function fieldNames(spec: QuerySpec | undefined): string[] {
	return (spec?.fields ?? []).map(field => field.name).sort()
}

/** Reads the root `$data`; a plain component, so selection collection does not render it. */
function RootData({ article, publish }: { article: EntityRef<Article>; publish: (data: object) => void }): null {
	const data = useAccessor(article).$data
	if (data !== null) {
		publish(data)
	}
	return null
}

async function observe(renderArticle: (article: EntityRef<Article>) => ReactNode): Promise<Observed> {
	const adapter = new RecordingAdapter(createMockData(), { delay: 0 })
	let rootData: object | null = null
	const { container } = render(
		<BindxProvider adapter={adapter} schema={testSchema}>
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => (
					<div data-testid="article">
						<RootData article={article} publish={data => { rootData = data }} />
						{renderArticle(article)}
					</div>
				)}
			</Entity>
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'article')).not.toBeNull())

	const [query] = adapter.queries
	if (query === undefined || query.type !== 'get') throw new Error('Expected one get query for the article')
	if (rootData === null) throw new Error('The article has not rendered with data')
	return {
		rootFields: fieldNames(query.spec),
		authorFields: fieldNames(query.spec.fields.find(field => field.name === 'author')?.nested),
		rootDataKeys: Object.keys(rootData).sort(),
	}
}

describe('a nested field ref passed to a selection-building component', () => {
	test('<Field> selects it under the relation only (reference behaviour)', async () => {
		const observed = await observe(article => <Field field={article.author.email} />)
		expect(observed).toEqual({
			rootFields: ['author', 'id'],
			authorFields: ['email', 'id'],
			rootDataKeys: ['author', 'id'],
		})
	})

	test('<Show field> selects it under the relation only', async () => {
		const observed = await observe(article => (
			<Show field={article.author.email}>{email => <span>{email}</span>}</Show>
		))
		expect(observed).toEqual({
			rootFields: ['author', 'id'],
			authorFields: ['email', 'id'],
			rootDataKeys: ['author', 'id'],
		})
	})

	test('<Show> children select a nested ref under the relation only', async () => {
		const observed = await observe(article => (
			<Show field={article.title}>
				<Field field={article.author.email} />
			</Show>
		))
		expect(observed).toEqual({
			rootFields: ['author', 'id', 'title'],
			authorFields: ['email', 'id'],
			rootDataKeys: ['author', 'id', 'title'],
		})
	})

	test('<If condition={cond…}> selects the condition field under the relation only', async () => {
		const observed = await observe(article => (
			<If condition={cond.eq(article.author.name, 'John Doe')} then={<span>John</span>} />
		))
		expect(observed).toEqual({
			rootFields: ['author', 'id'],
			authorFields: ['id', 'name'],
			rootDataKeys: ['author', 'id'],
		})
	})

	test('<If> branches select a nested ref under the relation only', async () => {
		const observed = await observe(article => (
			<If
				condition={true}
				then={<Field field={article.author.email} />}
				else={<Field field={article.author.name} />}
			/>
		))
		expect(observed).toEqual({
			rootFields: ['author', 'id'],
			authorFields: ['email', 'id', 'name'],
			rootDataKeys: ['author', 'id'],
		})
	})

	test('<Switch> cases select their nested refs under the relation only', async () => {
		const observed = await observe(article => (
			<Switch>
				<Case show={article.author.email}>{email => <span>{email}</span>}</Case>
				<Case if={cond.isNull(article.author.bio)}>
					<Field field={article.author.name} />
				</Case>
				<Default>
					<Field field={article.location.label} />
				</Default>
			</Switch>
		))
		expect(observed).toEqual({
			rootFields: ['author', 'id', 'location'],
			authorFields: ['bio', 'email', 'id', 'name'],
			rootDataKeys: ['author', 'id', 'location'],
		})
	})
})
