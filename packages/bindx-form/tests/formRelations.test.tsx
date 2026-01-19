import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider } from '@contember/bindx-react'
import {
	FormHasOneRelationScope,
	FormHasManyRelationScope,
	useFormFieldState,
	type FormFieldState,
} from '../src/index.js'
import {
	useEntity,
	getByTestId,
	queryByTestId,
	createAdapter,
} from './testUtils.js'

afterEach(() => {
	cleanup()
})

describe('FormHasOneRelationScope', () => {
	test('provides context from has-one relation handle', async () => {
		const adapter = createAdapter()

		let capturedState: FormFieldState | undefined

		function TestComponent() {
			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				e => e.author(a => a.id().name()),
			)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormHasOneRelationScope relation={article.author}>
					<Consumer />
				</FormHasOneRelationScope>
			)
		}

		function Consumer() {
			capturedState = useFormFieldState()
			return <div data-testid="consumer">Rendered</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'consumer')).not.toBeNull()
		})

		expect(capturedState).toBeDefined()
		expect(capturedState!.field?.entityName).toBe('Article')
		expect(capturedState!.field?.fieldName).toBe('author')
	})
})

describe('FormHasManyRelationScope', () => {
	test('provides context from has-many relation handle', async () => {
		const adapter = createAdapter()

		let capturedState: FormFieldState | undefined

		function TestComponent() {
			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				e => e.tags(t => t.id().name()),
			)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormHasManyRelationScope relation={article.tags}>
					<Consumer />
				</FormHasManyRelationScope>
			)
		}

		function Consumer() {
			capturedState = useFormFieldState()
			return <div data-testid="consumer">Rendered</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'consumer')).not.toBeNull()
		})

		expect(capturedState).toBeDefined()
		expect(capturedState!.field?.entityName).toBe('Article')
		expect(capturedState!.field?.fieldName).toBe('tags')
	})

	test('tracks dirty state from has-many relation', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				e => e.tags(t => t.id().name()),
			)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormHasManyRelationScope relation={article.tags}>
						<DirtyIndicator />
					</FormHasManyRelationScope>
					<button
						data-testid="disconnect"
						onClick={() => article.tags.disconnect('tag-1')}
					>
						Disconnect
					</button>
				</div>
			)
		}

		function DirtyIndicator() {
			const state = useFormFieldState()
			return <span data-testid="dirty">{state?.dirty ? 'dirty' : 'clean'}</span>
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'dirty')).not.toBeNull()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('dirty')
	})
})
