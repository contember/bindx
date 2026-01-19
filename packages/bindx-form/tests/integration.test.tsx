import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { BindxProvider } from '@contember/bindx-react'
import {
	FormFieldScope,
	FormInput,
	FormCheckbox,
	FormRadioInput,
	FormLabel,
	FormError,
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

describe('Form components integration', () => {
	test('full form with multiple fields', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				e => e.title().published(),
			)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title} required={true}>
						<FormLabel>
							<label data-testid="title-label">Title</label>
						</FormLabel>
						<FormInput field={article.title}>
							<input data-testid="title-input" />
						</FormInput>
						<FormError formatter={(errors) => errors.map(e => e.message)}>
							<span data-testid="title-error" />
						</FormError>
					</FormFieldScope>

					<FormFieldScope field={article.published}>
						<FormLabel>
							<label data-testid="published-label">Published</label>
						</FormLabel>
						<FormCheckbox field={article.published}>
							<input type="checkbox" data-testid="published-checkbox" />
						</FormCheckbox>
					</FormFieldScope>

					<FormFieldScope field={article.title}>
						<FormLabel>
							<label data-testid="radio-label">Title Selection</label>
						</FormLabel>
						<FormRadioInput field={article.title} value="Test Article">
							<input type="radio" data-testid="radio-current" />
						</FormRadioInput>
						<FormRadioInput field={article.title} value="Other">
							<input type="radio" data-testid="radio-other" />
						</FormRadioInput>
					</FormFieldScope>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title-input')).not.toBeNull()
		})

		// Initial values
		const titleInput = getByTestId(container, 'title-input') as HTMLInputElement
		const publishedCheckbox = getByTestId(container, 'published-checkbox') as HTMLInputElement
		const radioCurrent = getByTestId(container, 'radio-current') as HTMLInputElement

		expect(titleInput.value).toBe('Test Article')
		expect(publishedCheckbox.checked).toBe(true)
		expect(radioCurrent.checked).toBe(true)

		// Label links work
		const titleLabel = getByTestId(container, 'title-label') as HTMLLabelElement
		expect(titleLabel.htmlFor).toBe(titleInput.id)

		// Required attribute is set
		expect(titleInput.hasAttribute('data-required')).toBe(true)

		// No errors initially
		expect(queryByTestId(container, 'title-error')).toBeNull()
	})

	test('form shows errors when field has error', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				e => e.title(),
			)
			const [ready, setReady] = React.useState(false)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title} required={true}>
						<FormLabel>
							<label data-testid="title-label">Title</label>
						</FormLabel>
						<FormInput field={article.title}>
							<input data-testid="title-input" />
						</FormInput>
						<FormError formatter={(errs) => errs.map(e => e.message)}>
							<span data-testid="title-error" />
						</FormError>
					</FormFieldScope>
					<button
						data-testid="add-error"
						onClick={() => {
							article.title.setValue('')
							article.title.addError({ message: 'Title is required' })
							setReady(true)
						}}
					>
						Add Error
					</button>
					{ready && <span data-testid="ready">Ready</span>}
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title-input')).not.toBeNull()
		})

		// Click button to add error
		act(() => {
			;(getByTestId(container, 'add-error') as HTMLButtonElement).click()
		})

		await waitFor(() => {
			expect(queryByTestId(container, 'ready')).not.toBeNull()
		})

		// Should show error
		await waitFor(() => {
			const titleError = queryByTestId(container, 'title-error')
			expect(titleError).not.toBeNull()
			expect(titleError!.textContent).toBe('Title is required')
		})

		// Should have data-invalid
		const titleInput = getByTestId(container, 'title-input') as HTMLInputElement
		expect(titleInput.hasAttribute('data-invalid')).toBe(true)

		const titleLabel = getByTestId(container, 'title-label') as HTMLLabelElement
		expect(titleLabel.hasAttribute('data-invalid')).toBe(true)

		// Should have data-dirty
		expect(titleInput.hasAttribute('data-dirty')).toBe(true)
	})

	test('form with useEntity data flow', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				e => e.title(),
			)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title} required={true}>
						<FormLabel>
							<label data-testid="title-label">Title</label>
						</FormLabel>
						<FormInput field={article.title}>
							<input data-testid="title-input" />
						</FormInput>
					</FormFieldScope>
					<span data-testid="title-value">{article.title.value}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title-input')).not.toBeNull()
		})

		// Wait for data to load
		await waitFor(() => {
			expect(getByTestId(container, 'title-value').textContent).toBe('Test Article')
		})

		const titleInput = getByTestId(container, 'title-input') as HTMLInputElement
		expect(titleInput.value).toBe('Test Article')

		// Label links work
		const titleLabel = getByTestId(container, 'title-label') as HTMLLabelElement
		expect(titleLabel.htmlFor).toBe(titleInput.id)

		// Required attribute is set
		expect(titleInput.hasAttribute('data-required')).toBe(true)

		// Update value
		fireEvent.change(titleInput, { target: { value: 'New Title' } })

		await waitFor(() => {
			expect(getByTestId(container, 'title-value').textContent).toBe('New Title')
		})
	})
})
