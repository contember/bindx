// Runtime side of Phase 3 — compiled <Entity> root selection. The compiler injects
// `compiledSelection={{ v: 2, props: { entity: {...} }, holes: [...] }}`; here those literals
// are hand-written to simulate the emit. See docs/compiler-plan.md (Phase 3).
import '../../setup'
import { describe, test, expect, afterEach, spyOn } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import {
	createComponent,
	withCollector,
	Entity,
	Field,
	HasOne,
	SCOPE_REF,
	setStaticSelectionValidation,
	type EntityRef,
	type CompiledSelection,
} from '@contember/bindx-react'
import {
	renderWithBindx,
	getByTestId,
	queryByTestId,
	schema,
	createMockData,
	type Article,
} from '../../shared'

afterEach(() => {
	cleanup()
	// Validate mode is a module-level flag — never leak it into other tests.
	setStaticSelectionValidation(false)
})

/** True when `children` was handed a collector proxy (collection pass), not a real handle. */
function isCollector(value: unknown): boolean {
	return typeof value === 'object' && value !== null && SCOPE_REF in value
}

describe('compiled <Entity> — collection is skipped', () => {
	test('renders WITHOUT ever invoking children with a collector', async () => {
		let collectorCalls = 0
		const compiledSelection: CompiledSelection = { v: 2, props: { entity: { title: true } } }

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={compiledSelection}>
				{article => {
					if (isCollector(article)) {
						collectorCalls++
					}
					return <span data-testid="title"><Field field={article.title} /></span>
				}}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(collectorCalls).toBe(0)
	})

	test('without compiledSelection the collector pass runs (relative baseline)', async () => {
		let collectorCalls = 0

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => {
					if (isCollector(article)) {
						collectorCalls++
					}
					return <span data-testid="title"><Field field={article.title} /></span>
				}}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		// The runtime path collects via at least one collector invocation — the exact
		// pass the compiled path elides (see the assertion above: 0).
		expect(collectorCalls).toBeGreaterThan(0)
	})
})

describe('compiled <Entity> — fetch + render under MockAdapter', () => {
	test('scalar fields', async () => {
		const compiledSelection: CompiledSelection = { v: 2, props: { entity: { title: true, content: true } } }

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={compiledSelection}>
				{article => (
					<>
						<span data-testid="title"><Field field={article.title} /></span>
						<span data-testid="content"><Field field={article.content} /></span>
					</>
				)}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(getByTestId(container, 'content').textContent).toBe('This is the content')
	})

	test('nested has-one', async () => {
		const compiledSelection: CompiledSelection = {
			v: 2,
			props: { entity: { title: true, author: { fields: { name: true } } } },
		}

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={compiledSelection}>
				{article => (
					<HasOne field={article.author}>
						{author => <span data-testid="author-name"><Field field={author.name} /></span>}
					</HasOne>
				)}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})
	})

	test('a hole (nested createComponent receiving an entity-derived value)', async () => {
		const AuthorCard = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <span data-testid="author-name"><Field field={author.name} /></span>)

		const compiledSelection: CompiledSelection = {
			v: 2,
			props: { entity: { title: true } },
			holes: [{
				component: () => AuthorCard,
				entityProps: { author: { source: 'entity', path: ['author'] } },
			}],
		}

		const { container } = renderWithBindx(
			// The render body would throw if executed for collection — proves the hole
			// (not the children walk) drove author.name into the fetch plan.
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={compiledSelection}>
				{article => (
					<>
						<span data-testid="title"><Field field={article.title} /></span>
						<AuthorCard author={article.author} />
					</>
				)}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})
		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
	})

	test('create-mode Entity', async () => {
		let collectorCalls = 0
		const compiledSelection: CompiledSelection = { v: 2, props: { entity: { title: true } } }

		const { container } = renderWithBindx(
			// Create mode does not fetch; assert it renders and skips the collector walk.
			<Entity entity={schema.Article} create compiledSelection={compiledSelection}>
				{article => {
					if (isCollector(article)) {
						collectorCalls++
					}
					return <span data-testid="draft"><Field field={article.title} /></span>
				}}
			</Entity>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'draft')).not.toBeNull()
		})
		// Compiled create mode also skips the collector walk.
		expect(collectorCalls).toBe(0)
	})
})

describe('compiled <Entity> — validate mode', () => {
	test('agreeing compiled and runtime selections emit no warning', async () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		const compiledSelection: CompiledSelection = { v: 2, props: { entity: { title: true } } }

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={compiledSelection}>
				{article => <span data-testid="title"><Field field={article.title} /></span>}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('a field missing from the compiled selection emits one under-fetch warning', async () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// A collector-only probe: its staticRender reads `content` (so the validate
		// walk collects it into the root) while its runtime renders nothing (so the
		// real render never touches `content` on the compiled — and thus content-less —
		// root handle). Compiled omits `content` ⇒ under-fetch ⇒ one warning.
		interface ContentProbeProps { item: EntityRef<Article> }
		const ContentProbe = withCollector(
			function ContentProbe(_props: ContentProbeProps): React.ReactNode { return null },
			(props: ContentProbeProps) => <Field field={props.item.content} />,
		)

		const compiledSelection: CompiledSelection = { v: 2, props: { entity: { title: true } } }

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={compiledSelection}>
				{article => (
					<>
						<span data-testid="title"><Field field={article.title} /></span>
						<ContentProbe item={article} />
					</>
				)}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		await waitFor(() => {
			expect(warn).toHaveBeenCalled()
		})
		expect(warn).toHaveBeenCalledTimes(1)
		const message = String(warn.mock.calls[0]![0])
		expect(message).toContain('content')
		expect(message).toContain('Article')
		warn.mockRestore()
	})
})

describe('<Entity> — no compiledSelection is unchanged (sanity)', () => {
	test('runtime children walk still drives the fetch', async () => {
		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => (
					<HasOne field={article.author}>
						{author => <span data-testid="author-name"><Field field={author.name} /></span>}
					</HasOne>
				)}
			</Entity>,
			{ mockData: createMockData() },
		)

		await waitFor(() => {
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})
	})
})

describe('compiled <Entity> — malformed literal falls back to the runtime walk', () => {
	test('warns and renders via the children collector walk, no crash', async () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {})
		let collectorCalls = 0
		// Stale/corrupt emit — wrong version. Must be rejected; the runtime walk collects instead.
		const malformed = { v: 1, props: { entity: { title: true } } } as unknown as CompiledSelection

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }} compiledSelection={malformed}>
				{article => {
					if (isCollector(article)) {
						collectorCalls++
					}
					return <span data-testid="title"><Field field={article.title} /></span>
				}}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(warn).toHaveBeenCalled()
		// Fallback ran: children was invoked with a collector (the pass the compiled path skips).
		expect(collectorCalls).toBeGreaterThan(0)
		warn.mockRestore()
	})
})
