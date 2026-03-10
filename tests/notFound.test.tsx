import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useEntity,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Author {
	id: string
	name: string
}

interface TestSchema {
	Author: Author
}

const schema = defineSchema<TestSchema>({
	entities: {
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const authorDef = entityDef<Author>('Author')

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

describe('not_found state', () => {
	test('useEntity returns not_found for non-existent entity', async () => {
		const adapter = new MockAdapter({
			Author: {
				'author-1': { id: 'author-1', name: 'John Doe' },
			},
		}, { delay: 0 })

		function TestComponent() {
			const author = useEntity(authorDef, { by: { id: 'non-existent' } }, e => e.name())

			if (author.status === 'loading') {
				return <div data-testid="loading">Loading...</div>
			}

			if (author.status === 'not_found') {
				return <div data-testid="not-found">Not Found</div>
			}

			if (author.status === 'error') {
				return <div data-testid="error">Error</div>
			}

			return <div data-testid="ready">{author.data.name}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'not-found')).not.toBeNull()
		})

		expect(getByTestId(container, 'not-found').textContent).toBe('Not Found')
	})

	test('not_found accessor has correct properties', async () => {
		const adapter = new MockAdapter({
			Author: {},
		}, { delay: 0 })

		let capturedResult: ReturnType<typeof useEntity> | null = null

		function TestComponent() {
			const author = useEntity(authorDef, { by: { id: 'missing' } }, e => e.name())
			capturedResult = author

			if (author.status === 'loading') {
				return <div data-testid="loading">Loading...</div>
			}

			if (author.status === 'not_found') {
				return <div data-testid="not-found">Not Found</div>
			}

			return <div data-testid="ready">Ready</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'not-found')).not.toBeNull()
		})

		expect(capturedResult).not.toBeNull()
		expect(capturedResult!.status).toBe('not_found')
		expect(capturedResult!.isLoading).toBe(false)
		expect(capturedResult!.isError).toBe(false)
		expect(capturedResult!.isPersisting).toBe(false)
		expect(capturedResult!.isDirty).toBe(false)
	})
})
