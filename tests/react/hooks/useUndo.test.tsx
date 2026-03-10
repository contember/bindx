import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, act, cleanup, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useUndo,
	useEntity,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
	content: string
}

interface TestSchema {
	Article: Article
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

function createMockData() {
	return {
		Article: {
			'article-1': { id: 'article-1', title: 'Original Title', content: 'Original Content' },
		},
	}
}

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

/** Test component that exercises useUndo + useEntity together */
function UndoTestComponent({ id }: { id: string }): React.ReactElement {
	const { canUndo, canRedo, undo, redo, undoCount, redoCount, beginGroup, endGroup } = useUndo()
	const article = useEntity(articleDef, { by: { id } }, e => e.id().title().content())

	if (article.isLoading) return <div data-testid="loading">Loading</div>
	if (article.isError) return <div data-testid="error">Error</div>

	return (
		<div>
			<span data-testid="title-value">{article.fields.title.value}</span>
			<span data-testid="content-value">{article.fields.content.value}</span>
			<span data-testid="can-undo">{String(canUndo)}</span>
			<span data-testid="can-redo">{String(canRedo)}</span>
			<span data-testid="undo-count">{undoCount}</span>
			<span data-testid="redo-count">{redoCount}</span>
			<span data-testid="title-dirty">{String(article.fields.title.isDirty)}</span>
			<input
				data-testid="title-input"
				value={article.fields.title.value ?? ''}
				onChange={e => article.fields.title.setValue(e.target.value)}
			/>
			<button data-testid="undo-btn" onClick={undo} disabled={!canUndo}>Undo</button>
			<button data-testid="redo-btn" onClick={redo} disabled={!canRedo}>Redo</button>
			<button
				data-testid="bulk-btn"
				onClick={() => {
					const gid = beginGroup('bulk')
					article.fields.title.setValue('Bulk Title')
					article.fields.content.setValue('Bulk Content')
					endGroup(gid)
				}}
			>
				Bulk
			</button>
		</div>
	)
}

function renderWithProvider(ui: React.ReactElement, mockData = createMockData()) {
	const adapter = new MockAdapter(mockData, { debug: false, delay: 0 })
	return render(
		<BindxProvider adapter={adapter} schema={schema} enableUndo={true}>
			{ui}
		</BindxProvider>,
	)
}

describe('useUndo React integration', () => {
	test('renders without infinite loop', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Original Title')
		expect(getByTestId(container, 'can-undo').textContent).toBe('false')
		expect(getByTestId(container, 'can-redo').textContent).toBe('false')
		expect(getByTestId(container, 'undo-count').textContent).toBe('0')
		expect(getByTestId(container, 'redo-count').textContent).toBe('0')
	})

	test('getState returns stable reference when state has not changed', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		// After rendering, the component should be stable (no infinite loop)
		// and canUndo/canRedo should reflect correct state
		expect(getByTestId(container, 'can-undo').textContent).toBe('false')
		expect(getByTestId(container, 'undo-count').textContent).toBe('0')
	})

	test('reflects undo state after field change', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		// Change the title
		await act(async () => {
			fireEvent.change(getByTestId(container, 'title-input'), { target: { value: 'New Title' } })
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('New Title')
		expect(getByTestId(container, 'title-dirty').textContent).toBe('true')
		expect(getByTestId(container, 'can-undo').textContent).toBe('true')
		expect(getByTestId(container, 'can-redo').textContent).toBe('false')
	})

	test('undo reverts field change and updates UI', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		// Change
		await act(async () => {
			fireEvent.change(getByTestId(container, 'title-input'), { target: { value: 'Changed' } })
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Changed')

		// Undo
		await act(async () => {
			fireEvent.click(getByTestId(container, 'undo-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Original Title')
		expect(getByTestId(container, 'can-undo').textContent).toBe('false')
		expect(getByTestId(container, 'can-redo').textContent).toBe('true')
		expect(getByTestId(container, 'title-dirty').textContent).toBe('false')
	})

	test('redo restores field change and updates UI', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		// Change -> Undo -> Redo
		await act(async () => {
			fireEvent.change(getByTestId(container, 'title-input'), { target: { value: 'Changed' } })
			await new Promise(r => setTimeout(r, 50))
		})

		await act(async () => {
			fireEvent.click(getByTestId(container, 'undo-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Original Title')

		await act(async () => {
			fireEvent.click(getByTestId(container, 'redo-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Changed')
		expect(getByTestId(container, 'can-undo').textContent).toBe('true')
		expect(getByTestId(container, 'can-redo').textContent).toBe('false')
	})

	test('bulk update groups into single undo', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		// Bulk update (title + content in one group)
		await act(async () => {
			fireEvent.click(getByTestId(container, 'bulk-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Bulk Title')
		expect(getByTestId(container, 'content-value').textContent).toBe('Bulk Content')
		expect(getByTestId(container, 'can-undo').textContent).toBe('true')

		// Single undo should revert both fields
		await act(async () => {
			fireEvent.click(getByTestId(container, 'undo-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Original Title')
		expect(getByTestId(container, 'content-value').textContent).toBe('Original Content')
		expect(getByTestId(container, 'can-undo').textContent).toBe('false')
	})

	test('multiple sequential changes create separate undo entries', async () => {
		const { container } = renderWithProvider(<UndoTestComponent id="article-1" />)

		await act(async () => {
			await new Promise(r => setTimeout(r, 50))
		})

		// First change
		await act(async () => {
			fireEvent.change(getByTestId(container, 'title-input'), { target: { value: 'First' } })
		})

		// Wait for debounce to flush (default 300ms)
		await act(async () => {
			await new Promise(r => setTimeout(r, 400))
		})

		// Second change (separate entry because debounce has flushed)
		await act(async () => {
			fireEvent.change(getByTestId(container, 'title-input'), { target: { value: 'Second' } })
		})

		// Wait for second debounce to flush
		await act(async () => {
			await new Promise(r => setTimeout(r, 400))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Second')
		expect(getByTestId(container, 'undo-count').textContent).toBe('2')

		// Undo -> goes to "First"
		await act(async () => {
			fireEvent.click(getByTestId(container, 'undo-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('First')
		expect(getByTestId(container, 'can-undo').textContent).toBe('true')
		expect(getByTestId(container, 'redo-count').textContent).toBe('1')

		// Undo again -> goes to "Original Title"
		await act(async () => {
			fireEvent.click(getByTestId(container, 'undo-btn'))
			await new Promise(r => setTimeout(r, 50))
		})

		expect(getByTestId(container, 'title-value').textContent).toBe('Original Title')
		expect(getByTestId(container, 'can-undo').textContent).toBe('false')
		expect(getByTestId(container, 'redo-count').textContent).toBe('2')
	})
})
