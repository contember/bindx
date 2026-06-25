import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React, { useRef } from 'react'
import { BindxProvider, MockAdapter, Entity } from '@contember/bindx-react'
import type { FieldAccessor } from '@contember/bindx'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

describe('<Entity> accessor lifetime across data-driven re-render', () => {
	// Models the editor integration: a consumer (e.g. the Slate BlockEditor) captures a field
	// accessor handed to it during render and writes to it again on a later event. Between those
	// writes the entity version changes (the first write itself bumps it), which makes
	// EntityHandleRenderer recreate the EntityHandle and dispose the previous one — disposing the
	// very accessor the consumer still holds. The second write must still succeed: dispose() frees
	// no real resources, so a captured accessor for a still-mounted entity must remain writable.
	test('a captured field accessor stays writable after the entity re-renders', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const captured = { field: null as FieldAccessor<string> | null }

		function Editor({ title }: { title: FieldAccessor<string> }) {
			// Capture once, like Slate captures its onChange/field at mount time.
			const ref = useRef<FieldAccessor<string> | null>(null)
			if (!ref.current) {
				ref.current = title
				captured.field = title
			}
			return <span data-testid="title">{title.value}</span>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => <Editor title={article.title as FieldAccessor<string>} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		// First write through the captured accessor: succeeds and bumps the entity version,
		// which triggers EntityHandleRenderer to recreate (and dispose) the handle.
		act(() => {
			captured.field!.setValue('first')
		})
		expect(getByTestId(container, 'title').textContent).toBe('first')

		// Second write through the SAME captured accessor. Before the fix this threw
		// "Handle has been disposed".
		expect(() => {
			act(() => {
				captured.field!.setValue('second')
			})
		}).not.toThrow()
		expect(getByTestId(container, 'title').textContent).toBe('second')
	})
})
