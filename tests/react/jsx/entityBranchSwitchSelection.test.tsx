// Regression test for https://github.com/contember/bindx/issues/154
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, MockAdapter, Entity, EntityList, Field } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

describe('<Entity> reused across conditional branches', () => {
	test('should collect the new children selection when the branch switches but entity and by stay the same', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		let setTab: (tab: 'title' | 'content') => void = () => {}

		// Two tabs render an <Entity> for the same record at the same position in the
		// tree, with different children. React reuses the instance; only `children` changes.
		function App() {
			const [tab, setLocalTab] = useState<'title' | 'content'>('title')
			setTab = setLocalTab

			return tab === 'title'
				? (
					<Entity entity={schema.Article} by={{ id: 'article-1' }}>
						{article => <div data-testid="title"><Field field={article.title} /></div>}
					</Entity>
				)
				: (
					<Entity entity={schema.Article} by={{ id: 'article-1' }}>
						{article => <div data-testid="content"><Field field={article.content} /></div>}
					</Entity>
				)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		act(() => setTab('content'))

		await waitFor(() => {
			expect(queryByTestId(container, 'content')).not.toBeNull()
		})
		expect(getByTestId(container, 'content').textContent).toBe('This is the content')
	})

	test('should collect the new children selection when an <EntityList> branch switches with the same options', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		let setTab: (tab: 'title' | 'content') => void = () => {}

		function App() {
			const [tab, setLocalTab] = useState<'title' | 'content'>('title')
			setTab = setLocalTab

			return tab === 'title'
				? (
					<EntityList entity={schema.Article}>
						{article => <div data-testid={`title-${article.id}`}><Field field={article.title} /></div>}
					</EntityList>
				)
				: (
					<EntityList entity={schema.Article}>
						{article => <div data-testid={`content-${article.id}`}><Field field={article.content} /></div>}
					</EntityList>
				)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title-article-1')).not.toBeNull()
		})

		act(() => setTab('content'))

		await waitFor(() => {
			expect(queryByTestId(container, 'content-article-1')).not.toBeNull()
		})
		expect(getByTestId(container, 'content-article-1').textContent).toBe('This is the content')
	})
})
