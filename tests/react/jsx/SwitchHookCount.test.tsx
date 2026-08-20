import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Case,
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

describe('Switch hook count', () => {
	test('survives a conditional <Case> appearing and disappearing between renders', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let setExtraCase: ((extra: boolean) => void) | null = null

		function TestComponent(): React.ReactElement {
			const [extra, setExtra] = React.useState(false)
			setExtraCase = setExtra
			const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
				a.id().title().published().status().publishedAt(),
			)
			if (article.$isLoading) return <div data-testid="loading">Loading</div>
			if (article.$isError || article.$isNotFound) return <div data-testid="error">Error</div>
			return (
				<Switch>
					{extra ? (
						<Case show={article.status}>
							<span data-testid="extra">Extra</span>
						</Case>
					) : null}
					<Case show={article.title}>
						<span data-testid="title">Title</span>
					</Case>
					<Default>
						<span data-testid="fallback">Fallback</span>
					</Default>
				</Switch>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())
		expect(queryByTestId(container, 'title')).not.toBeNull()

		// One more <Case> than the previous render.
		act(() => {
			setExtraCase!(true)
		})
		expect(queryByTestId(container, 'extra')).not.toBeNull()
		expect(queryByTestId(container, 'title')).toBeNull()

		// ...and one fewer again.
		act(() => {
			setExtraCase!(false)
		})
		expect(queryByTestId(container, 'extra')).toBeNull()
		expect(queryByTestId(container, 'title')).not.toBeNull()
	})
})
