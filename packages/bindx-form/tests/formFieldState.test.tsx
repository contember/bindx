import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider } from '@contember/bindx-react'
import {
	FormFieldStateProvider,
	FormFieldScope,
	useFormFieldState,
	useRequiredFormFieldState,
	useFormFieldId,
	type FormFieldState,
} from '../src/index.js'
import {
	useEntity,
	getByTestId,
	queryByTestId,
	createClientError,
	createAdapter,
} from './testUtils.js'

afterEach(() => {
	cleanup()
})

describe('FormFieldStateProvider', () => {
	test('provides context with default values', () => {
		let capturedState: FormFieldState | undefined

		function Consumer() {
			capturedState = useFormFieldState()
			return <div data-testid="consumer">Rendered</div>
		}

		const { container } = render(
			<FormFieldStateProvider>
				<Consumer />
			</FormFieldStateProvider>,
		)

		expect(queryByTestId(container, 'consumer')).not.toBeNull()
		expect(capturedState).toBeDefined()
		expect(capturedState!.htmlId).toBeTruthy()
		expect(capturedState!.errors).toEqual([])
		expect(capturedState!.required).toBe(false)
		expect(capturedState!.dirty).toBe(false)
		expect(capturedState!.field).toBeUndefined()
	})

	test('provides custom values', () => {
		let capturedState: FormFieldState | undefined

		const errors = [createClientError('Required', 'REQUIRED')]
		const field = { entityName: 'Article', fieldName: 'title' }

		function Consumer() {
			capturedState = useFormFieldState()
			return null
		}

		render(
			<FormFieldStateProvider
				htmlId="custom-id"
				errors={errors}
				required={true}
				dirty={true}
				field={field}
			>
				<Consumer />
			</FormFieldStateProvider>,
		)

		expect(capturedState).toBeDefined()
		expect(capturedState!.htmlId).toBe('custom-id')
		expect(capturedState!.errors).toEqual(errors)
		expect(capturedState!.required).toBe(true)
		expect(capturedState!.dirty).toBe(true)
		expect(capturedState!.field).toEqual(field)
	})

	test('useRequiredFormFieldState throws outside provider', () => {
		function Consumer() {
			useRequiredFormFieldState()
			return null
		}

		expect(() => render(<Consumer />)).toThrow(
			'useRequiredFormFieldState must be used within a FormFieldScope or FormFieldStateProvider',
		)
	})

	test('useFormFieldId returns htmlId from context', () => {
		let capturedId: string | undefined

		function Consumer() {
			capturedId = useFormFieldId()
			return null
		}

		render(
			<FormFieldStateProvider htmlId="test-field-id">
				<Consumer />
			</FormFieldStateProvider>,
		)

		expect(capturedId).toBe('test-field-id')
	})
})

describe('FormFieldScope', () => {
	test('extracts metadata from field handle and provides context', async () => {
		const adapter = createAdapter()

		let capturedState: FormFieldState | undefined

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title}>
					<Consumer />
				</FormFieldScope>
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
		expect(capturedState!.field?.fieldName).toBe('title')
		expect(capturedState!.dirty).toBe(false)
		expect(capturedState!.errors).toEqual([])
	})

	test('updates dirty state when field changes', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<div>
					<FormFieldScope field={article.title}>
						<DirtyIndicator />
					</FormFieldScope>
					<button
						data-testid="change-btn"
						onClick={() => article.title.setValue('New Title')}
					>
						Change
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
			;(getByTestId(container, 'change-btn') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('dirty')
	})

	test('respects required prop override', async () => {
		const adapter = createAdapter()

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) return <div>Loading...</div>
			if (article.isError) return <div>Error</div>

			return (
				<FormFieldScope field={article.title} required={true}>
					<RequiredIndicator />
				</FormFieldScope>
			)
		}

		function RequiredIndicator() {
			const state = useFormFieldState()
			return <span data-testid="required">{state?.required ? 'required' : 'optional'}</span>
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'required')).not.toBeNull()
		})

		expect(getByTestId(container, 'required').textContent).toBe('required')
	})
})
