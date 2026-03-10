import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { BindxProvider } from '@contember/bindx-react'
import {
	FormFieldStateProvider,
	FormFieldScope,
	FormInput,
	FormCheckbox,
	FormRadioInput,
} from '../src/index.js'
import {
	useEntity,
	entityDefs,
	schema,
	getByTestId,
	queryByTestId,
	createClientError,
	createAdapter,
	createMockData,
} from './testUtils.js'

afterEach(() => {
	cleanup()
})

describe('FormInput', () => {
	test('binds field value to input', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<FormInput field={article.title}>
						<input data-testid="input" />
					</FormInput>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.value).toBe('Test Article')
	})

	test('updates field on input change', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title}>
						<FormInput field={article.title}>
							<input data-testid="input" />
						</FormInput>
					</FormFieldScope>
					<span data-testid="value">{article.title.value}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		fireEvent.change(input, { target: { value: 'Updated Title' } })

		expect(getByTestId(container, 'value').textContent).toBe('Updated Title')
	})

	test('sets data-invalid when errors in context', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())
			const [hasError, setHasError] = React.useState(false)

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			const errors = hasError ? [createClientError('Too short')] : []

			return (
				<div>
					<FormFieldStateProvider errors={errors} dirty={false}>
						<FormInput field={article.title}>
							<input data-testid="input" />
						</FormInput>
					</FormFieldStateProvider>
					<button data-testid="add-error" onClick={() => setHasError(true)}>
						Add Error
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		let input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-invalid')).toBe(false)

		act(() => {
			;(getByTestId(container, 'add-error') as HTMLButtonElement).click()
		})

		input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-invalid')).toBe(true)
	})

	test('sets data-dirty when field is modified', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<FormInput field={article.title}>
						<input data-testid="input" />
					</FormInput>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-dirty')).toBe(false)

		fireEvent.change(input, { target: { value: 'Modified' } })

		expect(input.hasAttribute('data-dirty')).toBe(true)
	})

	test('sets data-required when required', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title} required={true}>
					<FormInput field={article.title}>
						<input data-testid="input" />
					</FormInput>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-required')).toBe(true)
		expect(input.required).toBe(true)
	})

	test('supports custom formatValue and parseValue', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title}>
						<FormInput
							field={article.title}
							formatValue={(v) => `PREFIX:${v}`}
							parseValue={(v) => v.replace('PREFIX:', '')}
						>
							<input data-testid="input" />
						</FormInput>
					</FormFieldScope>
					<span data-testid="value">{article.title.value}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.value).toBe('PREFIX:Test Article')

		fireEvent.change(input, { target: { value: 'PREFIX:New Value' } })
		expect(getByTestId(container, 'value').textContent).toBe('New Value')
	})

	test('handles empty input as null', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title}>
						<FormInput field={article.title}>
							<input data-testid="input" />
						</FormInput>
					</FormFieldScope>
					<span data-testid="value">{article.title.value === null ? 'NULL' : article.title.value}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		fireEvent.change(input, { target: { value: '' } })

		expect(getByTestId(container, 'value').textContent).toBe('NULL')
	})
})

describe('FormCheckbox', () => {
	test('binds boolean field to checkbox checked state', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.published())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.published}>
					<FormCheckbox field={article.published}>
						<input type="checkbox" data-testid="checkbox" />
					</FormCheckbox>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'checkbox')).not.toBeNull()
		})

		const checkbox = getByTestId(container, 'checkbox') as HTMLInputElement
		expect(checkbox.checked).toBe(true)
		expect(checkbox.getAttribute('data-state')).toBe('checked')
	})

	test('unchecked state when value is false', async () => {
		const mockData = createMockData()
		mockData.Article['article-1']!.published = false
		const adapter = createAdapter(mockData)

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.published())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.published}>
					<FormCheckbox field={article.published}>
						<input type="checkbox" data-testid="checkbox" />
					</FormCheckbox>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'checkbox')).not.toBeNull()
		})

		const checkbox = getByTestId(container, 'checkbox') as HTMLInputElement
		expect(checkbox.checked).toBe(false)
		expect(checkbox.getAttribute('data-state')).toBe('unchecked')
	})

	test('indeterminate state when value is null', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-2' } }, e => e.published())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.published}>
					<FormCheckbox field={article.published}>
						<input type="checkbox" data-testid="checkbox" />
					</FormCheckbox>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'checkbox')).not.toBeNull()
		})

		const checkbox = getByTestId(container, 'checkbox') as HTMLInputElement
		expect(checkbox.indeterminate).toBe(true)
		expect(checkbox.getAttribute('data-state')).toBe('indeterminate')
	})

	test('updates field on checkbox change', async () => {
		const mockData = createMockData()
		mockData.Article['article-1']!.published = false
		const adapter = createAdapter(mockData)

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.published())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.published}>
						<FormCheckbox field={article.published}>
							<input type="checkbox" data-testid="checkbox" />
						</FormCheckbox>
					</FormFieldScope>
					<span data-testid="value">{String(article.published.value)}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'checkbox')).not.toBeNull()
		})

		expect(getByTestId(container, 'value').textContent).toBe('false')

		const checkbox = getByTestId(container, 'checkbox') as HTMLInputElement
		fireEvent.click(checkbox)

		expect(getByTestId(container, 'value').textContent).toBe('true')
	})

	test('sets data-dirty when field is modified', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.published())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.published}>
						<FormCheckbox field={article.published}>
							<input type="checkbox" data-testid="checkbox" />
						</FormCheckbox>
					</FormFieldScope>
					<button
						data-testid="toggle"
						onClick={() => article.published.setValue(!article.published.value)}
					>
						Toggle
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'checkbox')).not.toBeNull()
		})

		const checkbox = getByTestId(container, 'checkbox') as HTMLInputElement
		expect(checkbox.hasAttribute('data-dirty')).toBe(false)

		act(() => {
			;(getByTestId(container, 'toggle') as HTMLButtonElement).click()
		})

		expect(checkbox.hasAttribute('data-dirty')).toBe(true)
	})
})

describe('FormRadioInput', () => {
	test('binds field value to radio checked state', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<FormRadioInput field={article.title} value="Test Article">
						<input type="radio" data-testid="radio-current" />
					</FormRadioInput>
					<FormRadioInput field={article.title} value="Other">
						<input type="radio" data-testid="radio-other" />
					</FormRadioInput>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'radio-current')).not.toBeNull()
		})

		const currentRadio = getByTestId(container, 'radio-current') as HTMLInputElement
		const otherRadio = getByTestId(container, 'radio-other') as HTMLInputElement

		expect(currentRadio.checked).toBe(true)
		expect(otherRadio.checked).toBe(false)
	})

	test('calls setValue when radio is clicked', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title}>
						<FormRadioInput field={article.title} value="Test Article">
							<input type="radio" data-testid="radio-current" />
						</FormRadioInput>
						<FormRadioInput field={article.title} value="Changed">
							<input type="radio" data-testid="radio-changed" />
						</FormRadioInput>
					</FormFieldScope>
					<span data-testid="value">{article.title.value}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'radio-changed')).not.toBeNull()
		})

		expect(getByTestId(container, 'value').textContent).toBe('Test Article')

		const changedRadio = getByTestId(container, 'radio-changed') as HTMLInputElement
		fireEvent.click(changedRadio)

		expect(getByTestId(container, 'value').textContent).toBe('Changed')
	})

	test('radios in same scope share name attribute', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<FormRadioInput field={article.title} value="A">
						<input type="radio" data-testid="radio-a" />
					</FormRadioInput>
					<FormRadioInput field={article.title} value="B">
						<input type="radio" data-testid="radio-b" />
					</FormRadioInput>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'radio-a')).not.toBeNull()
		})

		const radioA = getByTestId(container, 'radio-a') as HTMLInputElement
		const radioB = getByTestId(container, 'radio-b') as HTMLInputElement

		expect(radioA.name).toBeTruthy()
		expect(radioA.name).toBe(radioB.name)
	})

	test('sets data-dirty when field is modified', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<FormRadioInput field={article.title} value="Test Article">
						<input type="radio" data-testid="radio-current" />
					</FormRadioInput>
					<FormRadioInput field={article.title} value="Changed">
						<input type="radio" data-testid="radio-changed" />
					</FormRadioInput>
				</FormFieldScope>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'radio-current')).not.toBeNull()
		})

		const currentRadio = getByTestId(container, 'radio-current') as HTMLInputElement
		expect(currentRadio.hasAttribute('data-dirty')).toBe(false)

		const changedRadio = getByTestId(container, 'radio-changed') as HTMLInputElement
		fireEvent.click(changedRadio)

		expect(changedRadio.hasAttribute('data-dirty')).toBe(true)
	})
})
