import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	createBindx,
	MockAdapter,
	createEntityFragment,
	mergeFragments,
	isEntityFragmentComponent,
	Field,
	HasMany,
	HasOne,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	ENTITY_FRAGMENT_COMPONENT,
	ENTITY_FRAGMENT_PROPS,
	type EntityRef,
} from '../src/index.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Test Types
// ============================================================================

interface Author {
	id: string
	name: string
	email: string
	bio: string
	articles: Article[]
}

interface Tag {
	id: string
	name: string
	color: string
}

interface Article {
	id: string
	title: string
	content: string
	author: Author
	tags: Tag[]
}

// ============================================================================
// Schema Setup
// ============================================================================

interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author'),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				bio: scalar(),
				articles: hasMany('Article'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
			},
		},
	},
})

const { useEntity, Entity } = createBindx(schema)

// ============================================================================
// Test Helpers
// ============================================================================

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Hello World',
				content: 'This is the content',
				author: {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
					bio: 'A passionate writer',
					articles: [],
				},
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
					{ id: 'tag-2', name: 'React', color: '#61dafb' },
				],
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
				bio: 'A passionate writer',
				articles: [
					{ id: 'article-1', title: 'Hello World', content: 'Content 1' },
					{ id: 'article-2', title: 'Second Post', content: 'Content 2' },
				],
			},
		},
	}
}

// ============================================================================
// Fragment Component Definitions for Tests
// ============================================================================

interface AuthorNameProps {
	author: EntityRef<Author>
}

const AuthorName = createEntityFragment<AuthorNameProps>(({ author }) => (
	<span data-testid="author-name">
		<Field field={author.fields.name} />
	</span>
))

interface AuthorInfoProps {
	author: EntityRef<Author>
	showEmail?: boolean
}

const AuthorInfo = createEntityFragment<AuthorInfoProps>(({ author, showEmail }) => (
	<div data-testid="author-info">
		<span data-testid="name">
			<Field field={author.fields.name} />
		</span>
		{showEmail && (
			<span data-testid="email">
				<Field field={author.fields.email} />
			</span>
		)}
	</div>
))

interface AuthorBioProps {
	author: EntityRef<Author>
}

const AuthorBio = createEntityFragment<AuthorBioProps>(({ author }) => (
	<div data-testid="author-bio">
		<p data-testid="bio">
			<Field field={author.fields.bio} />
		</p>
		<ul data-testid="articles">
			<HasMany field={author.fields.articles} limit={3}>
				{article => (
					<li key={article.id} data-testid={`article-${article.id}`}>
						<Field field={article.fields.title} />
					</li>
				)}
			</HasMany>
		</ul>
	</div>
))

interface ArticleTagsProps {
	article: EntityRef<Article>
	className?: string
}

const ArticleTags = createEntityFragment<ArticleTagsProps>(({ article, className }) => (
	<div data-testid="article-tags" className={className}>
		<HasMany field={article.fields.tags}>
			{tag => (
				<span key={tag.id} data-testid={`tag-${tag.id}`}>
					<Field field={tag.fields.name} />
				</span>
			)}
		</HasMany>
	</div>
))

// ============================================================================
// Tests
// ============================================================================

describe('createEntityFragment', () => {
	describe('basic creation', () => {
		test('should create a valid React component', () => {
			// memo() returns an object with $$typeof, not a function
			// Check that it's a valid React element type
			expect(AuthorName).toBeDefined()
			expect((AuthorName as any).$$typeof).toBeDefined()
		})

		test('should have ENTITY_FRAGMENT_COMPONENT marker', () => {
			expect((AuthorName as any)[ENTITY_FRAGMENT_COMPONENT]).toBe(true)
		})

		test('should have ENTITY_FRAGMENT_PROPS map', () => {
			const propsMap = (AuthorName as any)[ENTITY_FRAGMENT_PROPS]
			expect(propsMap).toBeInstanceOf(Map)
		})

		test('should expose $propName for entity props', () => {
			// AuthorName has 'author' entity prop, so it should have $author
			expect(AuthorName.$author).toBeDefined()
			expect(AuthorName.$author.__isFragment).toBe(true)
		})

		test('should not expose $propName for non-entity props', () => {
			// AuthorInfo has 'showEmail' boolean prop, should not have $showEmail
			expect((AuthorInfo as any).$showEmail).toBeUndefined()
		})

		test('should have collected selection in fragment', () => {
			const fragment = AuthorName.$author
			expect(fragment.__meta).toBeDefined()
			expect(fragment.__meta.fields.size).toBeGreaterThan(0)
			expect(fragment.__meta.fields.get('name')).toBeDefined()
		})
	})

	describe('isEntityFragmentComponent type guard', () => {
		test('should return true for entity fragment components', () => {
			expect(isEntityFragmentComponent(AuthorName)).toBe(true)
			expect(isEntityFragmentComponent(AuthorInfo)).toBe(true)
			expect(isEntityFragmentComponent(AuthorBio)).toBe(true)
		})

		test('should return false for regular functions', () => {
			expect(isEntityFragmentComponent(() => null)).toBe(false)
		})

		test('should return false for regular React components', () => {
			function RegularComponent() {
				return <div>Hello</div>
			}
			expect(isEntityFragmentComponent(RegularComponent)).toBe(false)
		})

		test('should return false for non-functions', () => {
			expect(isEntityFragmentComponent({})).toBe(false)
			expect(isEntityFragmentComponent(null)).toBe(false)
			expect(isEntityFragmentComponent(undefined)).toBe(false)
			expect(isEntityFragmentComponent('string')).toBe(false)
		})
	})

	describe('selection collection', () => {
		test('should collect scalar fields', () => {
			const fragment = AuthorName.$author
			expect(fragment.__meta.fields.get('name')).toBeDefined()
			expect(fragment.__meta.fields.get('name')?.fieldName).toBe('name')
		})

		test('should collect multiple scalar fields', () => {
			// AuthorInfo accesses name and email
			const fragment = AuthorInfo.$author
			expect(fragment.__meta.fields.get('name')).toBeDefined()
			expect(fragment.__meta.fields.get('email')).toBeDefined()
		})

		test('should collect fields from conditional branches', () => {
			// AuthorInfo has conditional email display, but it should still be collected
			const fragment = AuthorInfo.$author
			expect(fragment.__meta.fields.get('email')).toBeDefined()
		})

		test('should collect nested has-many relations', () => {
			// AuthorBio has HasMany for articles
			const fragment = AuthorBio.$author
			expect(fragment.__meta.fields.get('bio')).toBeDefined()
			expect(fragment.__meta.fields.get('articles')).toBeDefined()
			expect(fragment.__meta.fields.get('articles')?.isRelation).toBe(true)
			expect(fragment.__meta.fields.get('articles')?.isArray).toBe(true)
		})

		test('should collect nested fields within has-many', () => {
			const fragment = AuthorBio.$author
			const articlesField = fragment.__meta.fields.get('articles')
			expect(articlesField?.nested).toBeDefined()
			expect(articlesField?.nested?.fields.get('title')).toBeDefined()
		})

		test('should collect has-many with nested fields', () => {
			// ArticleTags has HasMany for tags with name field
			const fragment = ArticleTags.$article
			expect(fragment.__meta.fields.get('tags')).toBeDefined()
			const tagsField = fragment.__meta.fields.get('tags')
			expect(tagsField?.nested?.fields.get('name')).toBeDefined()
		})
	})

	describe('mergeFragments', () => {
		test('should merge two fragments', () => {
			const merged = mergeFragments(AuthorName.$author, AuthorInfo.$author)
			expect(merged.__isFragment).toBe(true)
			expect(merged.__meta.fields.get('name')).toBeDefined()
			expect(merged.__meta.fields.get('email')).toBeDefined()
		})

		test('should merge multiple fragments', () => {
			const merged = mergeFragments(
				AuthorName.$author,
				AuthorInfo.$author,
				AuthorBio.$author,
			)
			expect(merged.__meta.fields.get('name')).toBeDefined()
			expect(merged.__meta.fields.get('email')).toBeDefined()
			expect(merged.__meta.fields.get('bio')).toBeDefined()
			expect(merged.__meta.fields.get('articles')).toBeDefined()
		})

		test('should return single fragment unchanged', () => {
			const merged = mergeFragments(AuthorName.$author)
			expect(merged).toBe(AuthorName.$author)
		})

		test('should throw for empty fragments array', () => {
			// @ts-expect-error - Testing runtime error for invalid usage
			expect(() => mergeFragments()).toThrow('mergeFragments requires at least one fragment')
		})

		test('should handle overlapping fields correctly', () => {
			// Both AuthorName and AuthorInfo have 'name' field
			const merged = mergeFragments(AuthorName.$author, AuthorInfo.$author)
			// Should have both fields merged without duplication
			expect(merged.__meta.fields.get('name')).toBeDefined()
			// Count should be correct (name, email)
			expect(merged.__meta.fields.size).toBe(2)
		})
	})

	describe('JSX rendering in Entity context', () => {
		test('should render fragment component correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Author" id="author-1">
						{author => <AuthorName author={author} />}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-name')).not.toBeNull()
			})

			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		test('should render fragment with boolean props', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Author" id="author-1">
						{author => <AuthorInfo author={author} showEmail />}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-info')).not.toBeNull()
			})

			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'email').textContent).toBe('john@example.com')
		})

		test('should render fragment without optional props', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Author" id="author-1">
						{author => <AuthorInfo author={author} showEmail={false} />}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-info')).not.toBeNull()
			})

			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(queryByTestId(container, 'email')).toBeNull()
		})

		test('should render fragment with has-many relation', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Author" id="author-1">
						{author => <AuthorBio author={author} />}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-bio')).not.toBeNull()
			})

			expect(getByTestId(container, 'bio').textContent).toBe('A passionate writer')
			expect(queryByTestId(container, 'article-article-1')).not.toBeNull()
		})

		test('should render nested fragment in HasOne', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Article" id="article-1">
						{article => (
							<div>
								<h1 data-testid="title">
									<Field field={article.fields.title} />
								</h1>
								<HasOne field={article.fields.author}>
									{author => <AuthorInfo author={author} showEmail />}
								</HasOne>
							</div>
						)}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'email').textContent).toBe('john@example.com')
		})

		test('should render multiple fragments for same entity', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Author" id="author-1">
						{author => (
							<div>
								<AuthorInfo author={author} showEmail />
								<AuthorBio author={author} />
							</div>
						)}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-info')).not.toBeNull()
				expect(queryByTestId(container, 'author-bio')).not.toBeNull()
			})

			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'bio').textContent).toBe('A passionate writer')
		})

		test('should pass non-entity props correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				return (
					<Entity name="Article" id="article-1">
						{article => <ArticleTags article={article} className="custom-class" />}
					</Entity>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'article-tags')).not.toBeNull()
			})

			expect(getByTestId(container, 'article-tags').className).toBe('custom-class')
		})
	})

	describe('useEntity hook integration', () => {
		test('should work with fragment in has-one relation', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ id: 'article-1' },
					e => e.title().author(AuthorName.$author),
				)

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<span data-testid="author-name">{article.data.author?.name}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		test('should work with merged fragments', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ id: 'article-1' },
					e => e.title().author(AuthorName.$author, AuthorInfo.$author),
				)

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<span data-testid="author-name">{article.data.author?.name}</span>
						<span data-testid="author-email">{article.data.author?.email}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
		})

		test('should work with mergeFragments helper', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const combinedFragment = mergeFragments(AuthorName.$author, AuthorInfo.$author)

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ id: 'article-1' },
					e => e.title().author(combinedFragment),
				)

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<span data-testid="author-name">{article.data.author?.name}</span>
						<span data-testid="author-email">{article.data.author?.email}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
		})

		test('should work with fragment in has-many relation', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			interface TagInfoProps {
				tag: EntityRef<Tag>
			}

			const TagInfo = createEntityFragment<TagInfoProps>(({ tag }) => (
				<span>
					<Field field={tag.fields.name} />
				</span>
			))

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ id: 'article-1' },
					e => e.title().tags(TagInfo.$tag),
				)

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<ul data-testid="tags">
							{article.data.tags?.map(tag => (
								<li key={tag.id} data-testid={`tag-${tag.id}`}>
									{tag.name}
								</li>
							))}
						</ul>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(queryByTestId(container, 'tag-tag-1')).not.toBeNull()
			expect(queryByTestId(container, 'tag-tag-2')).not.toBeNull()
		})
	})

	describe('TypeScript type safety', () => {
		test('$propName should have correct fragment type', () => {
			// This is a compile-time check - if types are wrong, this won't compile
			const authorFragment = AuthorName.$author
			const articleFragment = ArticleTags.$article

			// These should be FluentFragment types
			expect(authorFragment.__isFragment).toBe(true)
			expect(articleFragment.__isFragment).toBe(true)
		})

		test('component should accept correct entity ref type', () => {
			// This is mostly a compile-time check
			// The component should accept EntityRef<Author> for AuthorName
			// If wrong type is passed, TypeScript will error at compile time
			expect(AuthorName).toBeDefined()
		})
	})

	describe('edge cases', () => {
		test('should handle component with multiple entity props', () => {
			interface MultiEntityProps {
				author: EntityRef<Author>
				article: EntityRef<Article>
			}

			const MultiEntity = createEntityFragment<MultiEntityProps>(({ author, article }) => (
				<div>
					<span data-testid="author">
						<Field field={author.fields.name} />
					</span>
					<span data-testid="article">
						<Field field={article.fields.title} />
					</span>
				</div>
			))

			expect(MultiEntity.$author).toBeDefined()
			expect(MultiEntity.$article).toBeDefined()
			expect(MultiEntity.$author.__meta.fields.get('name')).toBeDefined()
			expect(MultiEntity.$article.__meta.fields.get('title')).toBeDefined()
		})

		test('should handle empty render function gracefully', () => {
			interface EmptyProps {
				author: EntityRef<Author>
			}

			const EmptyFragment = createEntityFragment<EmptyProps>(() => null)

			// Should still be valid component (memo returns object with $$typeof)
			expect(EmptyFragment).toBeDefined()
			expect((EmptyFragment as any).$$typeof).toBeDefined()
			expect(isEntityFragmentComponent(EmptyFragment)).toBe(true)
			// But $author might not exist if no fields were accessed
		})

		test('should handle deeply nested relations', () => {
			interface DeepProps {
				author: EntityRef<Author>
			}

			const DeepFragment = createEntityFragment<DeepProps>(({ author }) => (
				<div>
					<HasMany field={author.fields.articles}>
						{article => (
							<HasMany field={article.fields.tags}>
								{tag => <Field field={tag.fields.name} />}
							</HasMany>
						)}
					</HasMany>
				</div>
			))

			expect(DeepFragment.$author).toBeDefined()
			const articlesField = DeepFragment.$author.__meta.fields.get('articles')
			expect(articlesField).toBeDefined()
			expect(articlesField?.nested?.fields.get('tags')).toBeDefined()
		})
	})
})
