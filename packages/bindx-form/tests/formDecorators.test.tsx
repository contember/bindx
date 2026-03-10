import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider } from '@contember/bindx-react'
import {
	FormFieldStateProvider,
	FormFieldScope,
	FormInput,
	FormLabel,
	FormError,
} from '../src/index.js'
import {
	useEntity,
	entityDefs,
	schema,
	getByTestId,
	queryByTestId,
	getAllByTestId,
	createAdapter,
} from './testUtils.js'

afterEach(() => {
	cleanup()
})

describe('FormLabel', () => {
	test('sets htmlFor to match input id', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<FormLabel>
						<label data-testid="label">Title</label>
					</FormLabel>
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
			expect(queryByTestId(container, 'label')).not.toBeNull()
		})

		const label = getByTestId(container, 'label') as HTMLLabelElement
		const input = getByTestId(container, 'input') as HTMLInputElement

		expect(label.htmlFor).toBeTruthy()
		expect(label.htmlFor).toBe(input.id)
	})

	test('sets data-invalid when field has errors', () => {
		const errors = [{ message: 'Error', source: 'client' as const }]

		const { container } = render(
			<FormFieldStateProvider errors={errors} dirty={false} required={false}>
				<FormLabel>
					<label data-testid="label">Title</label>
				</FormLabel>
			</FormFieldStateProvider>,
		)

		const label = getByTestId(container, 'label') as HTMLLabelElement
		expect(label.hasAttribute('data-invalid')).toBe(true)
	})

	test('sets data-invalid=false when no errors', () => {
		const { container } = render(
			<FormFieldStateProvider errors={[]} dirty={false} required={false}>
				<FormLabel>
					<label data-testid="label">Title</label>
				</FormLabel>
			</FormFieldStateProvider>,
		)

		const label = getByTestId(container, 'label') as HTMLLabelElement
		expect(label.hasAttribute('data-invalid')).toBe(false)
	})

	test('sets data-dirty and data-required attributes', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title} required={true}>
						<FormLabel>
							<label data-testid="label">Title</label>
						</FormLabel>
					</FormFieldScope>
					<button
						data-testid="modify"
						onClick={() => article.title.setValue('New')}
					>
						Modify
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
			expect(queryByTestId(container, 'label')).not.toBeNull()
		})

		const label = getByTestId(container, 'label') as HTMLLabelElement
		expect(label.hasAttribute('data-required')).toBe(true)
		expect(label.hasAttribute('data-dirty')).toBe(false)

		act(() => {
			;(getByTestId(container, 'modify') as HTMLButtonElement).click()
		})

		expect(label.hasAttribute('data-dirty')).toBe(true)
	})

	test('throws when used outside FormFieldScope', () => {
		function TestComponent() {
			return (
				<FormLabel>
					<label>Title</label>
				</FormLabel>
			)
		}

		expect(() => render(<TestComponent />)).toThrow()
	})
})

describe('FormError', () => {
	test('renders errors using formatter', () => {
		const errors = [{ message: 'Title is required', source: 'client' as const }]

		const { container } = render(
			<FormFieldStateProvider errors={errors}>
				<FormError formatter={(errs) => errs.map(e => e.message)}>
					<span data-testid="error" className="error-msg" />
				</FormError>
			</FormFieldStateProvider>,
		)

		const error = getByTestId(container, 'error')
		expect(error.textContent).toBe('Title is required')
		expect(error.classList.contains('error-msg')).toBe(true)
	})

	test('renders nothing when no errors', () => {
		const { container } = render(
			<FormFieldStateProvider errors={[]}>
				<FormError formatter={(errs) => errs.map(e => e.message)}>
					<span data-testid="error" />
				</FormError>
			</FormFieldStateProvider>,
		)

		expect(queryByTestId(container, 'error')).toBeNull()
	})

	test('renders multiple errors', () => {
		const errors = [
			{ message: 'Too short', source: 'client' as const },
			{ message: 'Must start with uppercase', source: 'client' as const },
		]

		const { container } = render(
			<FormFieldStateProvider errors={errors}>
				<FormError formatter={(errs) => errs.map(e => e.message)}>
					<span data-testid="error" />
				</FormError>
			</FormFieldStateProvider>,
		)

		const renderedErrors = getAllByTestId(container, 'error')
		expect(renderedErrors.length).toBe(2)
		expect(renderedErrors[0]!.textContent).toBe('Too short')
		expect(renderedErrors[1]!.textContent).toBe('Must start with uppercase')
	})

	test('deduplicates identical errors', () => {
		const errors = [
			{ message: 'Duplicate error', source: 'client' as const },
			{ message: 'Duplicate error', source: 'client' as const },
			{ message: 'Unique error', source: 'client' as const },
		]

		const { container } = render(
			<FormFieldStateProvider errors={errors}>
				<FormError formatter={(errs) => errs.map(e => e.message)}>
					<span data-testid="error" />
				</FormError>
			</FormFieldStateProvider>,
		)

		const renderedErrors = getAllByTestId(container, 'error')
		expect(renderedErrors.length).toBe(2)
		expect(renderedErrors[0]!.textContent).toBe('Duplicate error')
		expect(renderedErrors[1]!.textContent).toBe('Unique error')
	})

	test('sets unique id on each error element', () => {
		const errors = [
			{ message: 'Error 1', source: 'client' as const },
			{ message: 'Error 2', source: 'client' as const },
		]

		const { container } = render(
			<FormFieldStateProvider htmlId="test-field" errors={errors}>
				<FormError formatter={(errs) => errs.map(e => e.message)}>
					<span data-testid="error" />
				</FormError>
			</FormFieldStateProvider>,
		)

		const renderedErrors = getAllByTestId(container, 'error')
		expect(renderedErrors.length).toBe(2)
		expect(renderedErrors[0]!.id).toBeTruthy()
		expect(renderedErrors[1]!.id).toBeTruthy()
		expect(renderedErrors[0]!.id).not.toBe(renderedErrors[1]!.id)
	})

	test('throws when used outside FormFieldScope', () => {
		function TestComponent() {
			return (
				<FormError formatter={(errors) => errors.map(e => e.message)}>
					<span />
				</FormError>
			)
		}

		expect(() => render(<TestComponent />)).toThrow()
	})
})
