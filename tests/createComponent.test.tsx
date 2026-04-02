import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	isBindxComponent,
	mergeFragments,
	createComponent,
	Entity,
	defineSchema,
	entityDef,
	scalar,
	hasOne,
	hasMany,
	COMPONENT_MARKER,
	COMPONENT_SELECTIONS,
	useAccessor,
} from '@contember/bindx-react'

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

const entityDefs = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
	Tag: entityDef<Tag>('Tag'),
} as const

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
// Component Definitions - New Builder API
// ============================================================================

// Simple component with one entity prop - explicit selection
const AuthorCard = createComponent()
	.entity('author', entityDefs.Author, e => e.name().email())
	.render(({ author }) => {
		const acc = useAccessor(author)
		return (
			<div data-testid="author-card">
				<span data-testid="author-name">{acc.$data?.name}</span>
				<span data-testid="author-email">{acc.$data?.email}</span>
			</div>
		)
	})

// Component with scalar props
const AuthorCardWithOptions = createComponent()
	.entity('author', entityDefs.Author, e => e.name().email().bio())
	.props<{ showEmail?: boolean; className?: string }>()
	.render(({ author, showEmail, className }) => {
		const acc = useAccessor(author)
		return (
			<div data-testid="author-card" className={className}>
				<span data-testid="author-name">{acc.$data?.name}</span>
				{showEmail && <span data-testid="author-email">{acc.$data?.email}</span>}
				<span data-testid="author-bio">{acc.$data?.bio}</span>
			</div>
		)
	})

// Component with multiple entity props
const ArticleWithAuthor = createComponent()
	.entity('article', entityDefs.Article, e => e.title().content())
	.entity('author', entityDefs.Author, e => e.name())
	.render(({ article, author }) => {
		const articleAcc = useAccessor(article)
		const authorAcc = useAccessor(author)
		return (
			<div data-testid="article-with-author">
				<h1 data-testid="article-title">{articleAcc.$data?.title}</h1>
				<p data-testid="article-content">{articleAcc.$data?.content}</p>
				<span data-testid="author-name">{authorAcc.$data?.name}</span>
			</div>
		)
	})

// Implicit mode - selection collected from JSX
const ImplicitAuthorCard = createComponent()
	.entity('author', entityDefs.Author)
	.render(({ author }) => (
		<div data-testid="implicit-author-card">
			<span data-testid="author-name">{author.name.inputProps.value}</span>
			<span data-testid="author-email">{author.email.inputProps.value}</span>
		</div>
	))

// ============================================================================
// Tests
// ============================================================================

describe('createComponent builder API', () => {
	describe('explicit mode', () => {
		test('creates a component with fragment properties', () => {
			expect(AuthorCard.$author).toBeDefined()
			expect(AuthorCard.$author.__isFragment).toBe(true)
			expect(AuthorCard.$author.__meta).toBeDefined()
			expect(AuthorCard.$author.__meta.fields.size).toBe(2) // name, email
		})

		test('creates correct selection metadata', () => {
			const meta = AuthorCard.$author.__meta
			expect(meta.fields.has('name')).toBe(true)
			expect(meta.fields.has('email')).toBe(true)

			const nameField = meta.fields.get('name')
			expect(nameField?.fieldName).toBe('name')
			expect(nameField?.isRelation).toBe(false)
		})

		test('isBindxComponent returns true for created components', () => {
			expect(isBindxComponent(AuthorCard)).toBe(true)
			expect(isBindxComponent(AuthorCardWithOptions)).toBe(true)
			expect(isBindxComponent(ArticleWithAuthor)).toBe(true)
		})

		test('component has COMPONENT_MARKER symbol', () => {
			expect((AuthorCard as any)[COMPONENT_MARKER]).toBe(true)
		})

		test('component has COMPONENT_SELECTIONS map', () => {
			const selections = (AuthorCard as any)[COMPONENT_SELECTIONS]
			expect(selections).toBeInstanceOf(Map)
			expect(selections.has('author')).toBe(true)
		})
	})

	describe('implicit mode', () => {
		test('creates component with fragment from JSX analysis', () => {
			expect(ImplicitAuthorCard.$author).toBeDefined()
			expect(ImplicitAuthorCard.$author.__isFragment).toBe(true)
		})

		test('collects fields from JSX field access', () => {
			const meta = ImplicitAuthorCard.$author.__meta
			expect(meta.fields.has('name')).toBe(true)
			expect(meta.fields.has('email')).toBe(true)
		})

		test('isBindxComponent returns true', () => {
			expect(isBindxComponent(ImplicitAuthorCard)).toBe(true)
		})
	})

	describe('scalar props', () => {
		test('component with scalar props has fragment', () => {
			expect(AuthorCardWithOptions.$author).toBeDefined()
			expect(AuthorCardWithOptions.$author.__meta.fields.has('name')).toBe(true)
			expect(AuthorCardWithOptions.$author.__meta.fields.has('bio')).toBe(true)
		})
	})

	describe('multiple entity props', () => {
		test('component with multiple props has all fragments', () => {
			expect(ArticleWithAuthor.$article).toBeDefined()
			expect(ArticleWithAuthor.$author).toBeDefined()

			expect(ArticleWithAuthor.$article.__meta.fields.has('title')).toBe(true)
			expect(ArticleWithAuthor.$author.__meta.fields.has('name')).toBe(true)
		})
	})

	describe('fragment merging', () => {
		test('can merge fragments from different components', () => {
			const AuthorName = createComponent()
				.entity('author', entityDefs.Author, e => e.name())
				.render(({ author }) => { const acc = useAccessor(author); return <span>{acc.$data?.name}</span> })

			const AuthorEmail = createComponent()
				.entity('author', entityDefs.Author, e => e.email())
				.render(({ author }) => { const acc = useAccessor(author); return <span>{acc.$data?.email}</span> })

			const merged = mergeFragments(AuthorName.$author, AuthorEmail.$author)

			expect(merged.__meta.fields.has('name')).toBe(true)
			expect(merged.__meta.fields.has('email')).toBe(true)
		})
	})

	describe('type inference', () => {
		test('author prop is correctly typed', () => {
			// This test verifies compile-time type checking
			// If types are wrong, this file won't compile
			const _testComponent = createComponent()
				.entity('author', entityDefs.Author, e => e.name().email())
				.render(({ author }) => {
					const acc = useAccessor(author)
					// These should be typed correctly
					const name: string | undefined = acc.$data?.name
					const email: string | undefined = acc.$data?.email
					return <div>{name} {email}</div>
				})

			expect(_testComponent.$author).toBeDefined()
		})
	})

	describe('mixed implicit and explicit', () => {
		test('can mix implicit and explicit entity props', () => {
			const MixedComponent = createComponent()
				.entity('author', entityDefs.Author)  // implicit
				.entity('article', entityDefs.Article, e => e.title())  // explicit
				.render(({ author, article }) => (
					<div>
						<span>{author.name.inputProps.value}</span>
						<span>{article.title?.inputProps?.value}</span>
					</div>
				))

			expect(MixedComponent.$author).toBeDefined()
			expect(MixedComponent.$article).toBeDefined()

			// Implicit should collect 'name' from JSX
			expect(MixedComponent.$author.__meta.fields.has('name')).toBe(true)

			// Explicit should have 'title'
			expect(MixedComponent.$article.__meta.fields.has('title')).toBe(true)
		})
	})
})

describe('createComponent rendering', () => {
	test('renders component with data', async () => {
		const adapter = new MockAdapter(createMockData())

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
					{author => <AuthorCard author={author} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
	})

	test('renders component with scalar props', async () => {
		const adapter = new MockAdapter(createMockData())

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
					{author => (
						<AuthorCardWithOptions
							author={author}
							showEmail={true}
							className="custom-class"
						/>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
		expect(getByTestId(container, 'author-bio').textContent).toBe('A passionate writer')
		expect(getByTestId(container, 'author-card').className).toBe('custom-class')
	})

	test('scalar prop controls conditional rendering', async () => {
		const adapter = new MockAdapter(createMockData())

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
					{author => <AuthorCardWithOptions author={author} showEmail={false} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		// Email should NOT be rendered when showEmail=false
		expect(queryByTestId(container, 'author-email')).toBeNull()
	})

	test('renders implicit mode component', async () => {
		const adapter = new MockAdapter(createMockData())

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
					{author => <ImplicitAuthorCard author={author} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
	})
})

// ============================================================================
// entityInterface Tests
// ============================================================================

describe('createComponent.entityInterface', () => {
	// Interface for entities that have a 'name' field
	interface HasName {
		name: string
	}

	// Interface for entities with title
	interface HasTitle {
		title: string
	}

	describe('selection collection', () => {
		test('creates component with fragment from JSX analysis', () => {
			const NameCard = createComponent()
				.interfaces<{ item: HasName }>()
				.render(({ item }) => (
					<div data-testid="name-card">
						<span data-testid="name">{item.name.inputProps.value}</span>
					</div>
				))

			expect(NameCard.$item).toBeDefined()
			expect(NameCard.$item.__isFragment).toBe(true)
		})

		test('collects fields from JSX field access', () => {
			const NameCard = createComponent()
				.interfaces<{ item: HasName }>()
				.render(({ item }) => (
					<div>{item.name.inputProps.value}</div>
				))

			const meta = NameCard.$item.__meta
			expect(meta.fields.has('name')).toBe(true)
		})

		test('isBindxComponent returns true', () => {
			const NameCard = createComponent()
				.interfaces<{ item: HasName }>()
				.render(({ item }) => <span>{item.name.inputProps.value}</span>)

			expect(isBindxComponent(NameCard)).toBe(true)
		})
	})

	describe('rendering with different entity types', () => {
		test('accepts Author entity that has name field', async () => {
			const NameCard = createComponent()
				.interfaces<{ item: HasName }>()
				.render(({ item }) => (
					<div data-testid="name-card">
						<span data-testid="name">{item.name.inputProps.value}</span>
					</div>
				))

			const adapter = new MockAdapter(createMockData())

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
						{author => <NameCard item={author} />}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			})
		})

		test('accepts Tag entity that has name field', async () => {
			const NameCard = createComponent()
				.interfaces<{ item: HasName }>()
				.render(({ item }) => (
					<div data-testid="name-card">
						<span data-testid="name">{item.name.inputProps.value}</span>
					</div>
				))

			const adapter = new MockAdapter({
				Tag: {
					'tag-1': { id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
				},
			})

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Tag} by={{ id: 'tag-1' }}>
						{tag => <NameCard item={tag} />}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'name').textContent).toBe('JavaScript')
			})
		})

		test('accepts Article entity with title interface', async () => {
			const TitleCard = createComponent()
				.interfaces<{ item: HasTitle }>()
				.render(({ item }) => (
					<div data-testid="title-card">
						<span data-testid="title">{item.title.inputProps.value}</span>
					</div>
				))

			const adapter = new MockAdapter(createMockData())

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Article} by={{ id: 'article-1' }}>
						{article => <TitleCard item={article} />}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			})
		})
	})

	describe('mixed with regular entity props', () => {
		test('can combine interfaces with regular entity', () => {
			const MixedComponent = createComponent()
				.interfaces<{ item: HasName }>()
				.entity('article', entityDefs.Article, e => e.title())
				.render(({ item, article }) => (
					<div>
						<span data-testid="name">{item.name.inputProps.value}</span>
						<span data-testid="title">{article.title?.inputProps?.value}</span>
					</div>
				))

			expect(MixedComponent.$item).toBeDefined()
			expect(MixedComponent.$article).toBeDefined()

			expect(MixedComponent.$item.__meta.fields.has('name')).toBe(true)
			expect(MixedComponent.$article.__meta.fields.has('title')).toBe(true)
		})
	})

	describe('type inference', () => {
		test('interface prop is correctly typed', () => {
			// This test verifies compile-time type checking
			// If types are wrong, this file won't compile
			const _testComponent = createComponent()
				.interfaces<{ item: HasName }>()
				.render(({ item }) => {
					// These should be typed correctly
					const name: string | null | undefined = item.name.inputProps.value
					return <div>{name}</div>
				})

			expect(_testComponent.$item).toBeDefined()
		})
	})

	describe('explicit mode with selectors', () => {
		test('supports explicit selectors for interface props', () => {
			interface HasEmail { email: string }

			const EmailCard = createComponent()
				.interfaces<{ item: HasEmail }>({
					item: e => e.email(),
				})
				.render(({ item }) => <div>{item.email.inputProps.value}</div>)

			expect(EmailCard.$item).toBeDefined()
			expect(EmailCard.$item.__meta.fields.has('email')).toBe(true)
		})

		test('supports mixed implicit and explicit interface props', () => {
			interface HasArchivedAt { archivedAt: string | null }

			const StatusCard = createComponent()
				.interfaces<{ item: HasName; status: HasArchivedAt }>({
					status: e => e.archivedAt(), // explicit
					// item has no selector -> implicit from JSX
				})
				.render(({ item, status }) => (
					<div>
						<span>{item.name.inputProps.value}</span>
						<span>{status.archivedAt?.inputProps?.value ? 'Archived' : 'Active'}</span>
					</div>
				))

			expect(StatusCard.$item).toBeDefined()
			expect(StatusCard.$status).toBeDefined()
			expect(StatusCard.$item.__meta.fields.has('name')).toBe(true)
			expect(StatusCard.$status.__meta.fields.has('archivedAt')).toBe(true)
		})
	})
})

// ============================================================================
// Nested createComponent Tests
// ============================================================================

describe('nested createComponent with relation entity', () => {
	// This tests the scenario where a component receives an entity from a relation
	// e.g., <AuthorBreadcrumbs author={article.author.$entity} />

	test('correctly tracks entity scope when passing relation entity to nested component', () => {
		// AuthorBreadcrumbs expects an Author entity with explicit name selection
		const AuthorBreadcrumbs = createComponent()
			.entity('author', entityDefs.Author, e => e.name())
			.render(({ author }) => (
				<div data-testid="author-breadcrumbs">
					<span data-testid="author-name">{author.name.inputProps.value}</span>
				</div>
			))

		// ArticlePage has an Article entity with explicit selection, so article.author.$entity is available
		const ArticlePage = createComponent()
			.entity('article', entityDefs.Article, e => e.title().author(a => a.name()))
			.render(({ article }) => {
				const articleAcc = useAccessor(article)
				return (
					<div data-testid="article-page">
						<h1>{article.title.inputProps.value}</h1>
						<AuthorBreadcrumbs author={articleAcc.author.$entity} />
					</div>
				)
			})

		// Verify the selection was collected correctly
		const articleMeta = ArticlePage.$article.__meta
		expect(articleMeta.fields.has('title')).toBe(true)
		expect(articleMeta.fields.has('author')).toBe(true)

		// The author field should be a relation with nested selection
		const authorField = articleMeta.fields.get('author')
		expect(authorField?.isRelation).toBe(true)
		expect(authorField?.nested).toBeDefined()

		// The nested selection should have 'name' from AuthorBreadcrumbs
		expect(authorField?.nested?.fields.has('name')).toBe(true)
	})

	test('renders nested component with relation entity data', async () => {
		const AuthorBreadcrumbs = createComponent()
			.entity('author', entityDefs.Author, e => e.name())
			.render(({ author }) => (
				<div data-testid="author-breadcrumbs">
					<span data-testid="breadcrumb-author-name">{author.name.inputProps.value}</span>
				</div>
			))

		const ArticlePage = createComponent()
			.entity('article', entityDefs.Article, e => e.title().author(a => a.name()))
			.render(({ article }) => {
				const articleAcc = useAccessor(article)
				return (
					<div data-testid="article-page">
						<h1 data-testid="article-title">{article.title.inputProps.value}</h1>
						<AuthorBreadcrumbs author={articleAcc.author.$entity} />
					</div>
				)
			})

		const adapter = new MockAdapter(createMockData())

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={entityDefs.Article} by={{ id: 'article-1' }}>
					{article => <ArticlePage article={article} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'article-title').textContent).toBe('Hello World')
		})

		expect(getByTestId(container, 'breadcrumb-author-name').textContent).toBe('John Doe')
	})

	test('correctly tracks scope with multiple levels of nesting', () => {
		// AuthorName is a simple component showing author name (explicit selection)
		const AuthorName = createComponent()
			.entity('author', entityDefs.Author, e => e.name())
			.render(({ author }) => (
				<span data-testid="author-name">{author.name.inputProps.value}</span>
			))

		// AuthorCard uses AuthorName internally (explicit selection for name + email)
		const AuthorCard = createComponent()
			.entity('author', entityDefs.Author, e => e.name().email())
			.render(({ author }) => (
				<div data-testid="author-card">
					<AuthorName author={author} />
					<span data-testid="author-email">{author.email.inputProps.value}</span>
				</div>
			))

		// ArticleWithAuthor uses explicit selection so article.author.$entity is available
		const ArticleWithAuthor = createComponent()
			.entity('article', entityDefs.Article, e => e.title().author(a => a.name().email()))
			.render(({ article }) => {
				const articleAcc = useAccessor(article)
				return (
					<div data-testid="article-with-author">
						<h1>{article.title.inputProps.value}</h1>
						<AuthorCard author={articleAcc.author.$entity} />
					</div>
				)
			})

		// Verify the selection was collected correctly
		const articleMeta = ArticleWithAuthor.$article.__meta
		expect(articleMeta.fields.has('title')).toBe(true)
		expect(articleMeta.fields.has('author')).toBe(true)

		const authorField = articleMeta.fields.get('author')
		expect(authorField?.isRelation).toBe(true)
		expect(authorField?.nested).toBeDefined()

		// Nested selection should have both name and email from AuthorCard
		expect(authorField?.nested?.fields.has('name')).toBe(true)
		expect(authorField?.nested?.fields.has('email')).toBe(true)
	})
})
