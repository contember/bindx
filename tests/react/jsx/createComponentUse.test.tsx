// Tests for createComponent().use() — runtime-only values (hooks allowed) that
// static selection analysis never executes. See issue #57 for the motivation.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import React, { createContext, useContext } from 'react'
import { createComponent, Field, Entity, COMPONENT_SELECTIONS, type SelectionMeta } from '@contember/bindx-react'
import { schema, renderWithBindx, getByTestId } from '../../shared'

afterEach(() => {
	cleanup()
})

// Triggers static collection via the `$<propName>` fragment getter (same
// mechanism the parent Entity walk uses through getSelection).
function getComponentSelection(component: unknown, propName: string): SelectionMeta | undefined {
	const fragment = (component as Record<string, unknown>)[`$${propName}`]
	if (!fragment) return undefined
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	return selections?.get(propName)?.selection
}

describe('createComponent().use()', () => {
	test('static analysis skips use(); runtime render receives its values', async () => {
		let useCalls = 0
		const Comp = createComponent()
			.entity('article', schema.Article)
			.use(() => {
				useCalls++
				return { t: (key: string): string => `translated:${key}` }
			})
			.render(({ article, t }) => (
				<div>
					<h2 data-testid="heading">{t('heading')}</h2>
					<span data-testid="title"><Field field={article.title} /></span>
				</div>
			))

		// Fragment access = static analysis; use() must not run, fields must be found
		const selection = getComponentSelection(Comp, 'article')
		expect(useCalls).toBe(0)
		expect(selection).toBeDefined()
		expect([...selection!.fields.keys()]).toContain('title')

		// End-to-end: field fetched through the Entity walk, use() value rendered
		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => <Comp article={article} />}
			</Entity>,
		)
		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(getByTestId(container, 'heading').textContent).toBe('translated:heading')
		expect(useCalls).toBeGreaterThan(0)
	})

	test('hooks work inside use()', async () => {
		const TranslatorContext = createContext<(key: string) => string>(() => 'missing-provider')

		const Comp = createComponent()
			.entity('article', schema.Article)
			.use(() => ({ t: useContext(TranslatorContext) }))
			.render(({ article, t }) => (
				<div>
					<h2 data-testid="heading">{t('heading')}</h2>
					<span data-testid="title"><Field field={article.title} /></span>
				</div>
			))

		const { container } = renderWithBindx(
			<TranslatorContext.Provider value={key => `ctx:${key}`}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => <Comp article={article} />}
				</Entity>
			</TranslatorContext.Provider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(getByTestId(container, 'heading').textContent).toBe('ctx:heading')
	})

	test('chained use() functions see values of earlier ones', async () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.use(() => ({ base: 'A' }))
			.use(({ base }) => ({ derived: `${base}B` }))
			.render(({ article, derived }) => (
				<div>
					<span data-testid="derived">{derived}</span>
					<span data-testid="title"><Field field={article.title} /></span>
				</div>
			))

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => <Comp article={article} />}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		expect(getByTestId(container, 'derived').textContent).toBe('AB')
	})

	test('use() values are not part of public props (parent does not pass them)', async () => {
		// The component itself provides `t`; the call site only passes the entity.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.use(() => ({ t: (key: string): string => `own:${key}` }))
			.render(({ article, t }) => (
				<span data-testid="text">{t('x')}<Field field={article.title} /></span>
			))

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => <Comp article={article} />}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'text').textContent).toBe('own:xHello World')
		})
	})
})

describe('selection analysis robustness', () => {
	test('a component crashing during analysis does not cost siblings their selection', async () => {
		// The tolerant scalar stand-in cannot save indexing a REAL object with a
		// mocked key: LABELS[''] is undefined and `.x` throws during analysis.
		const LABELS: Record<string, { x: string }> = { k1: { x: 'label-one' } }

		const Broken = createComponent()
			.entity('article', schema.Article)
			.props<{ labelKey: string }>()
			.render(({ labelKey }) => (
				<span data-testid="broken">{LABELS[labelKey]!.x}</span>
			))

		const Good = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<span data-testid="good"><Field field={article.title} /></span>
			))

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => (
					<div>
						<Broken article={article} labelKey="k1" />
						<Good article={article} />
					</div>
				)}
			</Entity>,
		)

		// Good sibling's field must be fetched despite Broken's analysis crash;
		// Broken itself renders fine at runtime (real labelKey exists).
		await waitFor(() => {
			expect(getByTestId(container, 'good').textContent).toBe('Hello World')
		})
		expect(getByTestId(container, 'broken').textContent).toBe('label-one')
	})

	test('fields accessed before an analysis crash are still collected', () => {
		const REAL: Record<string, string> = {}

		const Comp = createComponent()
			.entity('article', schema.Article)
			.props<{ k: string }>()
			.render(({ article, k }) => (
				<div>
					<Field field={article.title} />
					<span>{REAL[k]!.toUpperCase()}</span>
				</div>
			))

		const selection = getComponentSelection(Comp, 'article')
		expect(selection).toBeDefined()
		expect([...selection!.fields.keys()]).toContain('title')
	})
})
