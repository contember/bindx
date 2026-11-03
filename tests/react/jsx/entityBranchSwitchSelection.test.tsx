// Regression test for <issue-url — filled in after the issue is filed>
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, MockAdapter, Entity, Field } from '@contember/bindx-react'
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
})
