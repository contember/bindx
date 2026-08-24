import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Case,
	cond,
	Default,
	MockAdapter,
	Switch,
	useEntity,
} from '@contember/bindx-react'
import { createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function getByTestId(container: Element, testId: string): Element {
	const el = queryByTestId(container, testId)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

type ArticleAccessor = any

function renderWithArticle(
	mockData: ReturnType<typeof createMockData>,
	body: (article: ArticleAccessor) => React.ReactNode,
): HTMLElement {
	const adapter = new MockAdapter(mockData, { delay: 0 })

	function TestComponent(): React.ReactElement {
		const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
			a.id().title().published().status().publishedAt(),
		)
		if (article.$isLoading) return <div data-testid="loading">Loading</div>
		if (article.$isError || article.$isNotFound) return <div data-testid="error">Error</div>
		return <div data-testid="wrapper">{body(article)}</div>
	}

	const { container } = render(
		<BindxProvider adapter={adapter} schema={testSchema}>
			<TestComponent />
		</BindxProvider>,
	)
	return container as HTMLElement
}

describe('Switch component', () => {
	test('renders first matching <Case show> branch', async () => {
		const container = renderWithArticle(createMockData(), article => (
			<Switch>
				<Case show={article.publishedAt}>
					<span data-testid="published">Published</span>
				</Case>
				<Case show={article.title}>
					<span data-testid="has-title">Has title</span>
				</Case>
				<Default>
					<span data-testid="draft">Draft</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'published')).not.toBeNull()
		expect(queryByTestId(container, 'has-title')).toBeNull()
		expect(queryByTestId(container, 'draft')).toBeNull()
	})

	test('falls through to later <Case> when first show field is null', async () => {
		const data = createMockData()
		;(data.Article['article-1'] as { publishedAt: string | null }).publishedAt = null
		const container = renderWithArticle(data, article => (
			<Switch>
				<Case show={article.publishedAt}>
					<span data-testid="published">Published</span>
				</Case>
				<Case show={article.title}>
					<span data-testid="has-title">Has title</span>
				</Case>
				<Default>
					<span data-testid="draft">Draft</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'published')).toBeNull()
		expect(queryByTestId(container, 'has-title')).not.toBeNull()
		expect(queryByTestId(container, 'draft')).toBeNull()
	})

	test('renders <Default> when no case matches', async () => {
		const data = createMockData()
		;(data.Article['article-1'] as { publishedAt: string | null }).publishedAt = null
		;(data.Article['article-1'] as { title: string | null }).title = null
		const container = renderWithArticle(data, article => (
			<Switch>
				<Case show={article.publishedAt}>
					<span data-testid="published">Published</span>
				</Case>
				<Case show={article.title}>
					<span data-testid="has-title">Has title</span>
				</Case>
				<Default>
					<span data-testid="draft">Draft</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'draft')).not.toBeNull()
	})

	test('renders nothing when no case matches and no <Default>', async () => {
		const data = createMockData()
		;(data.Article['article-1'] as { publishedAt: string | null }).publishedAt = null
		;(data.Article['article-1'] as { title: string | null }).title = null
		const container = renderWithArticle(data, article => (
			<div data-testid="inner">
				<Switch>
					<Case show={article.publishedAt}>
						<span data-testid="published">Published</span>
					</Case>
				</Switch>
			</div>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(getByTestId(container, 'inner').textContent).toBe('')
	})

	test('<Case show> callback children receive non-null value', async () => {
		const container = renderWithArticle(createMockData(), article => (
			<Switch>
				<Case show={article.publishedAt}>
					{value => <time data-testid="time">{String(value)}</time>}
				</Case>
				<Default>
					<span data-testid="draft">Draft</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(getByTestId(container, 'time').textContent).toBe('2024-01-15')
	})

	test('<Case if> with boolean true matches', async () => {
		const container = renderWithArticle(createMockData(), _article => (
			<Switch>
				<Case if={true}>
					<span data-testid="always">Always</span>
				</Case>
				<Default>
					<span data-testid="never">Never</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'always')).not.toBeNull()
		expect(queryByTestId(container, 'never')).toBeNull()
	})

	test('<Case if> with FieldRef<boolean> reads field value', async () => {
		const container = renderWithArticle(createMockData(), article => (
			<Switch>
				<Case if={article.published}>
					<span data-testid="is-published">Published</span>
				</Case>
				<Default>
					<span data-testid="not-published">Not published</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'is-published')).not.toBeNull()
	})

	test('<Case if> with cond DSL evaluates condition', async () => {
		const container = renderWithArticle(createMockData(), article => (
			<Switch>
				<Case if={cond.eq(article.status, 'published')}>
					<span data-testid="published-state">Published state</span>
				</Case>
				<Case if={cond.eq(article.status, 'draft')}>
					<span data-testid="draft-state">Draft state</span>
				</Case>
				<Default>
					<span data-testid="unknown">Unknown</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'draft-state')).not.toBeNull()
		expect(queryByTestId(container, 'published-state')).toBeNull()
	})

	test('throws when <Switch> contains a non-<Case>/<Default> child', () => {
		class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
			override state = { error: null as Error | null }
			static getDerivedStateFromError(error: Error): { error: Error } {
				return { error }
			}
			override render(): React.ReactNode {
				if (this.state.error) return <div data-testid="err">{this.state.error.message}</div>
				return this.props.children
			}
		}

		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Boundary>
					<Switch>
						<div data-testid="bad">nope</div>
					</Switch>
				</Boundary>
			</BindxProvider>,
		)

		expect(getByTestId(container, 'err').textContent).toMatch(/<Switch> children must be/)
	})

	test('throws when <Switch> contains multiple <Default>', () => {
		class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
			override state = { error: null as Error | null }
			static getDerivedStateFromError(error: Error): { error: Error } {
				return { error }
			}
			override render(): React.ReactNode {
				if (this.state.error) return <div data-testid="err">{this.state.error.message}</div>
				return this.props.children
			}
		}

		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Boundary>
					<Switch>
						<Default>
							<span>one</span>
						</Default>
						<Default>
							<span>two</span>
						</Default>
					</Switch>
				</Boundary>
			</BindxProvider>,
		)

		expect(getByTestId(container, 'err').textContent).toMatch(/at most one <Default>/)
	})

	test('fragments in children are transparent', async () => {
		const container = renderWithArticle(createMockData(), article => (
			<Switch>
				<>
					<Case show={article.publishedAt}>
						<span data-testid="fragment-hit">Hit</span>
					</Case>
				</>
				<Default>
					<span data-testid="fragment-default">Default</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		expect(queryByTestId(container, 'fragment-hit')).not.toBeNull()
	})

	test('collection phase selects fields from all branches', async () => {
		// If a branch's field were not selected, the accessor would throw UnfetchedFieldError
		// when the <Case> runtime tries to read it. This test verifies Switch aggregates
		// trigger fields across all cases even when only the first case renders.
		const container = renderWithArticle(createMockData(), article => (
			<Switch>
				<Case show={article.publishedAt}>
					<span data-testid="pub">pub</span>
				</Case>
				<Case if={cond.eq(article.status, 'draft')}>
					<span data-testid="draft">draft</span>
				</Case>
				<Case if={article.published}>
					<span data-testid="bool">bool</span>
				</Case>
				<Default>
					<span data-testid="def">def</span>
				</Default>
			</Switch>
		))

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())

		// No throw and first case wins
		expect(queryByTestId(container, 'pub')).not.toBeNull()
	})
})
