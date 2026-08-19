import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, Entity, createComponent, useAccessor, useField } from '@contember/bindx-react'
import type { FieldRef } from '@contember/bindx'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

/**
 * Accessors keep a stable identity across data changes, so a memo()-wrapped bindx component no
 * longer re-renders just because its parent did — every entity prop it receives must carry its own
 * store subscription. `createComponent().entity(name, def)` WITHOUT a selector (implicit selection
 * collection) is a first-party API and must subscribe exactly like the explicit-selector form.
 */
describe('createComponent entity prop subscriptions', () => {
	test('re-renders an implicit entity prop when its entity changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		// No selector — the selection is collected implicitly from the render function.
		const ImplicitName = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <span data-testid="implicit">{author.name.inputProps.value}</span>)

		let rename: (() => void) | null = null

		function Rename({ name }: { name: FieldRef<string> }): null {
			const field = useField(name)
			rename = () => field.setValue('Renamed')
			return null
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Author} by={{ id: 'author-1' }}>
					{author => (
						<>
							<ImplicitName author={author} />
							<Rename name={author.name} />
						</>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'implicit')).not.toBeNull()
		})
		expect(getByTestId(container, 'implicit').textContent).toBe('John Doe')

		act(() => {
			rename!()
		})

		await waitFor(() => {
			expect(getByTestId(container, 'implicit').textContent).toBe('Renamed')
		})
	})

	test('re-renders an explicit entity prop when its entity changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const ExplicitName = createComponent()
			.entity('author', schema.Author, a => a.name())
			.render(({ author }) => {
				const acc = useAccessor(author)
				return <span data-testid="explicit">{acc.$data?.name}</span>
			})

		let rename: (() => void) | null = null

		function Rename({ name }: { name: FieldRef<string> }): null {
			const field = useField(name)
			rename = () => field.setValue('Renamed')
			return null
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Author} by={{ id: 'author-1' }}>
					{author => (
						<>
							<ExplicitName author={author} />
							<Rename name={author.name} />
						</>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'explicit')).not.toBeNull()
		})
		expect(getByTestId(container, 'explicit').textContent).toBe('John Doe')

		act(() => {
			rename!()
		})

		await waitFor(() => {
			expect(getByTestId(container, 'explicit').textContent).toBe('Renamed')
		})
	})
})
