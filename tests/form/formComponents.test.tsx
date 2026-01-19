import '../setup'
import { describe, test, expect, afterEach, beforeEach } from 'bun:test'
import { render, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	createBindx,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx-react'
import {
	// Form components
	FormFieldStateProvider,
	FormFieldScope,
	FormInput,
	FormCheckbox,
	FormRadioInput,
	FormLabel,
	FormError,
	FormHasOneRelationScope,
	FormHasManyRelationScope,
	// Contexts
	useFormFieldState,
	useRequiredFormFieldState,
	useFormFieldId,
	// Types
	type FormFieldState,
} from '@contember/bindx-form'

afterEach(() => {
	cleanup()
})

// Helper to create client-side errors for testing
function createClientError(message: string, code?: string) {
	return { source: 'client' as const, message, code }
}

// Test types
interface Author {
	id: string
	name: string
	bio: string
}

interface Tag {
	id: string
	name: string
}

interface Article {
	id: string
	title: string
	published: boolean | null
	status: string
	views: number | null
	rating: number | null
	publishedAt: string | null
	createdAt: string | null
	author: Author | null
	tags: Tag[]
}

// Create typed hooks using createBindx with schema
interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				published: scalar(),
				status: scalar(),
				views: scalar(),
				rating: scalar(),
				publishedAt: scalar(),
				createdAt: scalar(),
				author: hasOne('Author'),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				bio: scalar(),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const { useEntity } = createBindx(schema)

// Helper to query by data-testid
function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function getAllByTestId(container: Element, testId: string): Element[] {
	return Array.from(container.querySelectorAll(`[data-testid="${testId}"]`))
}

// Test data factory
function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				published: true,
				status: 'draft',
				views: 100,
				rating: 4.5,
				publishedAt: '2024-01-15',
				createdAt: '2024-01-15T10:30:00Z',
				author: {
					id: 'author-1',
					name: 'John Doe',
					bio: 'Writer',
				},
				tags: [
					{ id: 'tag-1', name: 'JavaScript' },
					{ id: 'tag-2', name: 'React' },
				],
			},
			'article-2': {
				id: 'article-2',
				title: 'Another Article',
				published: null,
				status: 'published',
				views: null,
				rating: null,
				publishedAt: null,
				createdAt: null,
				author: null,
				tags: [],
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				bio: 'Writer',
			},
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JavaScript' },
			'tag-2': { id: 'tag-2', name: 'React' },
		},
	}
}

// ============================================================================
// FormFieldStateProvider tests
// ============================================================================

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
		expect(capturedState!.htmlId).toBeTruthy() // auto-generated
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
			useRequiredFormFieldState() // Should throw
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

// ============================================================================
// FormFieldScope tests
// ============================================================================

describe('FormFieldScope', () => {
	test('extracts metadata from field handle and provides context', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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

// ============================================================================
// FormInput tests
// ============================================================================

describe('FormInput', () => {
	test('binds field value to input', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		// Test that FormInput respects errors from FormFieldStateProvider context
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())
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
					<button
						data-testid="add-error"
						onClick={() => setHasError(true)}
					>
						Add Error
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		// Initially no error
		let input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-invalid')).toBe(false)

		// Click button to add error
		act(() => {
			;(getByTestId(container, 'add-error') as HTMLButtonElement).click()
		})

		// Now should have data-invalid
		input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-invalid')).toBe(true)
	})

	test('sets data-invalid=false when no errors', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'input')).not.toBeNull()
		})

		const input = getByTestId(container, 'input') as HTMLInputElement
		expect(input.hasAttribute('data-invalid')).toBe(false)
	})

	test('sets data-dirty when field is modified', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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

// ============================================================================
// FormCheckbox tests
// ============================================================================

describe('FormCheckbox', () => {
	test('binds boolean field to checkbox checked state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.published())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(mockData, { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.published())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-2' } }, e => e.published())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(mockData, { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.published())

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
			<BindxProvider adapter={adapter}>
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

	test('sets data-invalid and data-dirty attributes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.published())

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
			<BindxProvider adapter={adapter}>
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

// ============================================================================
// FormRadioInput tests
// ============================================================================

describe('FormRadioInput', () => {
	// Use title field which works reliably with the entity system

	test('binds field value to radio checked state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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

// ============================================================================
// FormLabel tests
// ============================================================================

describe('FormLabel', () => {
	test('sets htmlFor to match input id', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

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
			<BindxProvider adapter={adapter}>
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

// ============================================================================
// FormError tests
// ============================================================================

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
		expect(renderedErrors.length).toBe(2) // Deduplicated
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

// ============================================================================
// FormHasOneRelationScope tests
// ============================================================================

describe('FormHasOneRelationScope', () => {
	test('provides context from has-one relation handle', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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

// ============================================================================
// FormHasManyRelationScope tests
// ============================================================================

describe('FormHasManyRelationScope', () => {
	test('provides context from has-many relation handle', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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

// ============================================================================
// Integration tests
// ============================================================================

describe('Form components integration', () => {
	test('full form with multiple fields', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

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
