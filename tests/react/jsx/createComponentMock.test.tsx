// Tests for createComponent().mock() — deterministic stand-in values used ONLY
// during static selection analysis, never at runtime render. See issue #57.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import React from 'react'
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

describe('createComponent().mock()', () => {
	test('mocked key indexes a real object, so fields after it are still collected', () => {
		// Without the mock, LABELS[<generic mock>] coerces to '' → undefined → `.x`
		// throws mid-analysis, so `title` (accessed after) would be missed.
		const LABELS: Record<string, { x: string }> = { k1: { x: 'label-one' } }

		const Comp = createComponent()
			.entity('article', schema.Article)
			.props<{ labelKey: string }>()
			.mock({ labelKey: 'k1' })
			.render(({ article, labelKey }) => (
				<div>
					<span>{LABELS[labelKey]!.x}</span>
					<Field field={article.title} />
				</div>
			))

		const selection = getComponentSelection(Comp, 'article')
		expect(selection).toBeDefined()
		expect([...selection!.fields.keys()]).toContain('title')
	})

	test('sample-array mock invokes .map(), collecting fields used inside the callback', () => {
		// The generic mock never runs a .map() callback, so `content` (accessed only
		// inside it) would be silently missing. A sample array makes the callback run.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.props<{ tabs: { key: string }[] }>()
			.mock({ tabs: [{ key: 'x' }] })
			.render(({ article, tabs }) => (
				<div>
					<Field field={article.title} />
					{tabs.map(tab => (
						<span key={tab.key}><Field field={article.content} /></span>
					))}
				</div>
			))

		const selection = getComponentSelection(Comp, 'article')
		expect(selection).toBeDefined()
		const fields = [...selection!.fields.keys()]
		expect(fields).toContain('title')
		expect(fields).toContain('content')
	})

	test('deterministic branching selects the chosen branch fields', () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.props<{ variant: string }>()
			.mock({ variant: 'b' })
			.render(({ article, variant }) => (
				variant === 'b'
					? <Field field={article.title} />
					: <Field field={article.publishedAt} />
			))

		const selection = getComponentSelection(Comp, 'article')
		expect(selection).toBeDefined()
		const fields = [...selection!.fields.keys()]
		expect(fields).toContain('title')
		expect(fields).not.toContain('publishedAt')
	})

	test('runtime render ignores mocks — real prop values win', async () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.props<{ label: string }>()
			.mock({ label: 'mocked-label' })
			.render(({ article, label }) => (
				<div>
					<span data-testid="label">{label}</span>
					<span data-testid="title"><Field field={article.title} /></span>
				</div>
			))

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => <Comp article={article} label="real-label" />}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		// Real prop wins at render; the mock is analysis-only.
		expect(getByTestId(container, 'label').textContent).toBe('real-label')
	})

	test('mock applies to a .use() output name; runtime uses the real .use() value', async () => {
		// LABELS[t('k1')].x would crash with the generic mock (t returns a proxy).
		const LABELS: Record<string, { x: string }> = { k1: { x: 'label-one' } }

		const Comp = createComponent()
			.entity('article', schema.Article)
			.use(() => ({ t: (key: string): string => key })) // real: identity
			.mock({ t: () => 'k1' }) // analysis-only: always 'k1'
			.render(({ article, t }) => (
				<div>
					<span data-testid="probe">{t('probe')}</span>
					<span data-testid="index">{LABELS[t('k1')]!.x}</span>
					<span data-testid="title"><Field field={article.title} /></span>
				</div>
			))

		// Static analysis: mock makes t('k1') === 'k1', so the index resolves and
		// title is collected without hitting the degraded path.
		const selection = getComponentSelection(Comp, 'article')
		expect(selection).toBeDefined()
		expect([...selection!.fields.keys()]).toContain('title')

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => <Comp article={article} />}
			</Entity>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
		// Real .use() identity function wins at render, not the mock.
		expect(getByTestId(container, 'probe').textContent).toBe('probe')
		expect(getByTestId(container, 'index').textContent).toBe('label-one')
	})

	test('mocking an entity prop is a type error', () => {
		createComponent()
			.entity('article', schema.Article)
			.props<{ label: string }>()
			// @ts-expect-error - entity props cannot be mocked
			.mock({ article: {} })
			.render(({ article }) => <Field field={article.title} />)
	})
})
