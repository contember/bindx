/**
 * An entity accessor passed as a prop must survive generic enumeration. React's dev
 * build logs a prop diff for every changed prop by reading each own key of the value;
 * without an ownKeys trap that walk reached the handle's instance fields through the
 * field-access `get` trap and threw UnfetchedFieldError mid-commit.
 */
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, Field, MockAdapter, useEntity, type EntityRef } from '@contember/bindx-react'
import { createMockData, schema, testSchema, type Author } from '../../shared'

afterEach(() => {
	cleanup()
})

// React 19's development build logs a prop diff for every fiber whose props changed
// (react-dom-client.development.js `logComponentRender` -> `addObjectDiffToProperties` ->
// `addObjectToProperties`). That helper does `for (const key in props[name])` and then READS
// every own key off the value. An EntityAccessor is a Proxy with no `ownKeys` trap, so `for..in`
// yields the EntityHandle's own instance fields (`store`, `dispatcher`, `schema`, ...) and the
// `get` trap routes each of them into field access, which throws UnfetchedFieldError.
//
// The gate is `typeof console.timeStamp === 'function' && typeof performance.measure === 'function'`
// — true in every browser — so this fires in any dev build as soon as an entity accessor is
// passed as a prop to a component whose props change.
//
// Passing an entity accessor down as a prop is the documented pattern (createComponent()
// entity props, DataGrid rows, `<Row item={list.items[i]} />`).

describe('entity accessor passed as a prop', () => {
	test('does not explode when React logs the prop diff', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let show: (() => void) | null = null

		function Badge({ author }: { author?: EntityRef<Author, Pick<Author, 'id' | 'name'>> }): React.ReactElement {
			if (!author) return <span data-testid="badge-empty">none</span>
			return <span data-testid="badge"><Field field={author.name} /></span>
		}

		function Host(): React.ReactElement {
			const [visible, setVisible] = React.useState(false)
			show = () => setVisible(true)
			const author = useEntity(schema.Author, { by: { id: 'author-1' } }, a => a.id().name())
			if (author.$isLoading) return <div data-testid="loading" />
			if (author.$isError || author.$isNotFound) return <div data-testid="error" />
			return <Badge author={visible ? author : undefined} />
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Host />
			</BindxProvider>,
		)

		await waitFor(() => expect(container.querySelector('[data-testid="badge-empty"]')).not.toBeNull())

		// The prop goes undefined -> accessor, so React logs the diff of `author`.
		act(() => {
			show!()
		})

		expect(container.querySelector('[data-testid="badge"]')!.textContent).toBe('John Doe')
	})
})
