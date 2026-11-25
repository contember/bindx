import '../../setup'
// A relation ref reached through a has-one (`article.author.avatar`, `article.author.posts`)
// and fed to <HasOne>/<HasMany> must put the relation and its children's selection under
// the ref's own entity (`author`), not as a stray relation of the root entity.
// A has-many read from the schema stays selected as `posts { id }` next to a params alias:
// collection cannot see every consumer of the ref, and one may read it only at runtime.
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import {
	BindxProvider,
	Entity,
	Field,
	HasMany,
	HasOne,
	MockAdapter,
	createComponent,
	defineSchema,
	entityDef,
	hasMany,
	hasOne,
	scalar,
	useHasMany,
	type EntityRef,
	type HasManyRef,
} from '@contember/bindx-react'
import type { Query, QueryOptions, QueryResult, QuerySpec, QueryFieldSpec } from '@contember/bindx'
import { queryByTestId } from '../../shared'

afterEach(() => {
	cleanup()
})

interface Image {
	id: string
	url: string
}

interface Post {
	id: string
	title: string
	rank: number
}

interface Author {
	id: string
	name: string
	avatar: Image | null
	posts: Post[]
}

interface Article {
	id: string
	title: string
	author: Author | null
}

interface NestedSchema {
	Article: Article
	Author: Author
	Image: Image
	Post: Post
}

const nestedSchema = defineSchema<NestedSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author', { nullable: true }),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				avatar: hasOne('Image', { nullable: true }),
				posts: hasMany('Post'),
			},
		},
		Image: {
			fields: {
				id: scalar(),
				url: scalar(),
			},
		},
		Post: {
			fields: {
				id: scalar(),
				title: scalar(),
				rank: scalar(),
			},
		},
	},
})

const entities = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
}

/** Reads the relation only at runtime; a plain component, so selection collection does not see it. */
function PostCount({ posts }: { posts: HasManyRef<Post> }): ReactNode {
	return <span>{useHasMany(posts).length}</span>
}

const TopPosts = createComponent()
	.entity('author', entities.Author)
	.render(({ author }) => (
		<HasMany field={author.posts} orderBy={[{ rank: 'asc' }]} limit={1}>
			{post => <Field field={post.title} />}
		</HasMany>
	))

function createData(): Record<string, Record<string, Record<string, unknown>>> {
	const avatar = { id: 'image-1', url: 'https://example.com/a.png' }
	const posts = [
		{ id: 'post-1', title: 'First', rank: 3 },
		{ id: 'post-2', title: 'Second', rank: 1 },
		{ id: 'post-3', title: 'Third', rank: 2 },
	]
	const author = { id: 'author-1', name: 'John', avatar, posts }
	return {
		Article: { 'article-1': { id: 'article-1', title: 'Hello', author } },
		Author: { 'author-1': author },
		Image: { 'image-1': avatar },
		Post: Object.fromEntries(posts.map(post => [post.id, post])),
	}
}

class RecordingAdapter extends MockAdapter {
	readonly queries: Query[] = []

	override async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		this.queries.push(...queries)
		return super.query(queries, options)
	}
}

/** Query fields as `name` or `name(params)`, nested fields in braces, sorted. */
function describeFields(spec: QuerySpec | undefined): string[] {
	return (spec?.fields ?? []).map(describeField).sort()
}

function describeField(field: QueryFieldSpec): string {
	const params = [
		field.filter !== undefined ? `filter=${JSON.stringify(field.filter)}` : null,
		field.orderBy !== undefined ? `orderBy=${JSON.stringify(field.orderBy)}` : null,
		field.limit !== undefined ? `limit=${field.limit}` : null,
	].filter(param => param !== null)
	const sourceName = field.sourcePath.join('.')
	const head = sourceName !== field.name ? `${field.name}:${sourceName}` : field.name
	const withParams = params.length > 0 ? `${head}(${params.join(',')})` : head
	return field.nested ? `${withParams} { ${describeFields(field.nested).join(' ')} }` : withParams
}

async function observe(renderArticle: (article: EntityRef<Article>) => ReactNode): Promise<{ query: string[]; text: string }> {
	const adapter = new RecordingAdapter(createData(), { delay: 0 })
	const { container } = render(
		<BindxProvider adapter={adapter} schema={nestedSchema}>
			<Entity entity={entities.Article} by={{ id: 'article-1' }}>
				{article => <div data-testid="article">{renderArticle(article)}</div>}
			</Entity>
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'article')).not.toBeNull())

	const [query] = adapter.queries
	if (query === undefined || query.type !== 'get') throw new Error('Expected one get query for the article')
	return {
		query: describeFields(query.spec),
		text: queryByTestId(container, 'article')?.textContent ?? '',
	}
}

describe('a nested relation ref fed to <HasOne>/<HasMany>', () => {
	test('<HasOne field={article.author.avatar}> selects avatar under author', async () => {
		const observed = await observe(article => (
			<HasOne field={article.author.avatar}>
				{avatar => <Field field={avatar.url} />}
			</HasOne>
		))
		expect(observed).toEqual({
			query: ['author { avatar { id url } id }', 'id'],
			text: 'https://example.com/a.png',
		})
	})

	test('<HasMany field={article.author.posts}> selects posts under author', async () => {
		const observed = await observe(article => (
			<HasMany field={article.author.posts}>
				{post => <Field field={post.title} />}
			</HasMany>
		))
		expect(observed).toEqual({
			query: ['author { id posts { id title } }', 'id'],
			text: 'FirstSecondThird',
		})
	})

	test('<HasMany> with orderBy/limit selects its aliased posts under author', async () => {
		const observed = await observe(article => (
			<HasMany field={article.author.posts} orderBy={[{ rank: 'asc' }]} limit={2}>
				{post => <Field field={post.title} />}
			</HasMany>
		))
		expect(observed.query).toHaveLength(2)
		expect(observed.query[1]).toBe('id')
		expect(observed.query[0]).toMatch(/^author \{ id posts \{ id \} posts_\w+:posts\(orderBy=\[\{"rank":"asc"\}\],limit=2\) \{ id title \} \}$/)
		expect(observed.text).toBe('SecondThird')
	})

	test('two <HasMany> of one nested field with different params keep separate aliases', async () => {
		const observed = await observe(article => (
			<>
				<HasMany field={article.author.posts} filter={{ rank: { eq: 1 } }}>
					{post => <Field field={post.title} />}
				</HasMany>
				<HasMany field={article.author.posts} filter={{ rank: { eq: 3 } }}>
					{post => <Field field={post.rank} />}
				</HasMany>
			</>
		))
		const author = observed.query[0] ?? ''
		expect(author).toMatch(/posts_\w+:posts\(filter=\{"rank":\{"eq":1\}\}\) \{ id title \}/)
		expect(author).toMatch(/posts_\w+:posts\(filter=\{"rank":\{"eq":3\}\}\) \{ id rank \}/)
		expect(author).toMatch(/ posts \{ id \} /)
		expect(observed.query[1]).toBe('id')
		// Each list renders the rows of its own params.
		expect(observed.text).toBe('Second3')
	})

	test('<HasMany> of a has-one\'s relation with a limit renders its aliased rows', async () => {
		const observed = await observe(article => (
			<HasOne field={article.author}>
				{author => (
					<HasMany field={author.posts} limit={1}>
						{post => <Field field={post.title} />}
					</HasMany>
				)}
			</HasOne>
		))
		expect(observed.query[0]).toMatch(/^author \{ id posts \{ id \} posts_\w+:posts\(limit=1\) \{ id title \} \}$/)
		expect(observed.text).toBe('First')
	})

	test('<HasMany> with params inside a component selects its aliased relation in the fragment', async () => {
		const observed = await observe(article => (
			<HasOne field={article.author}>
				{author => <TopPosts author={author} />}
			</HasOne>
		))
		expect(observed.query[0]).toMatch(/^author \{ id posts_\w+:posts\(orderBy=\[\{"rank":"asc"\}\],limit=1\) \{ id title \} \}$/)
		expect(observed.text).toBe('Second')
	})

	test('a ref shared by a runtime-only reader and a <HasMany> with params keeps the whole relation', async () => {
		const observed = await observe(article => {
			const posts = article.author.posts
			return (
				<>
					<PostCount posts={posts} />
					<HasMany field={posts} limit={1}>
						{post => <Field field={post.title} />}
					</HasMany>
				</>
			)
		})
		expect(observed.query[0]).toMatch(/^author \{ id posts \{ id \} posts_\w+:posts\(limit=1\) \{ id title \} \}$/)
		expect(observed.text).toBe('3First')
	})
})
