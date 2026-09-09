import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { BindxProvider, useBindxContext } from '@contember/bindx-react'
import { addFieldError, createServerError } from '@contember/bindx'
import { FormError, FormFieldScope, FormInput } from '../src/index.js'
import {
	useEntity,
	entityDefs,
	schema,
	getAllByTestId,
	getByTestId,
	queryByTestId,
	createAdapter,
} from './testUtils.js'

afterEach(() => {
	cleanup()
})

function TestForm(): React.ReactElement {
	const { dispatcher } = useBindxContext()
	const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.title())

	if (article.$isLoading) return <div>Loading...</div>
	if (article.$isError) return <div>Error</div>

	return (
		<div>
			<FormFieldScope field={article.title} required={true}>
				<FormInput field={article.title}>
					<input data-testid="input" />
				</FormInput>
				<FormError formatter={errors => errors.map(error => error.message)}>
					<span data-testid="error" />
				</FormError>
			</FormFieldScope>
			<button
				data-testid="add-server-error"
				onClick={() => dispatcher.dispatch(addFieldError(
					'Article',
					'article-1',
					'title',
					createServerError('Title is already taken', 'UniqueConstraintViolation'),
				))}
			>
				Add server error
			</button>
			<button
				data-testid="add-client-error"
				onClick={() => article.title.addError({ message: 'Invalid JSON', code: 'json-parse' })}
			>
				Add client error
			</button>
		</div>
	)
}

async function renderForm(): Promise<{ input: HTMLInputElement; container: Element }> {
	const { container } = render(
		<BindxProvider adapter={createAdapter()} schema={schema}>
			<TestForm />
		</BindxProvider>,
	)
	await waitFor(() => {
		expect(queryByTestId(container, 'input')).not.toBeNull()
	})
	return { input: getByTestId(container, 'input') as HTMLInputElement, container }
}

function errorsOf(container: Element): string {
	return getAllByTestId(container, 'error').map(element => element.textContent).join('|')
}

/** happy-dom computes validity but leaves validationMessage empty, so the message is set explicitly. */
function makeInvalid(input: HTMLInputElement, message: string): void {
	fireEvent.change(input, { target: { value: '' } })
	input.setCustomValidity(message)
}

function makeValid(input: HTMLInputElement): void {
	input.setCustomValidity('')
	fireEvent.change(input, { target: { value: 'A valid title' } })
}

describe('useFormInputValidationHandler', () => {
	test('keeps a server error on blur', async () => {
		const { input, container } = await renderForm()

		fireEvent.click(getByTestId(container, 'add-server-error'))
		expect(errorsOf(container)).toBe('Title is already taken')

		fireEvent.focus(input)
		fireEvent.blur(input)

		expect(errorsOf(container)).toBe('Title is already taken')
	})

	test('keeps a server error when the validity changes after blur', async () => {
		const { input, container } = await renderForm()

		makeInvalid(input, 'Title is required')
		fireEvent.focus(input)
		fireEvent.blur(input)
		expect(errorsOf(container)).toBe('Title is required')

		fireEvent.click(getByTestId(container, 'add-server-error'))
		makeValid(input)

		await waitFor(() => {
			expect(errorsOf(container)).toBe('Title is already taken')
		})
	})

	test('keeps a client error raised by other code on blur', async () => {
		const { input, container } = await renderForm()

		fireEvent.change(input, { target: { value: 'not json' } })
		fireEvent.click(getByTestId(container, 'add-client-error'))
		expect(errorsOf(container)).toBe('Invalid JSON')

		fireEvent.focus(input)
		fireEvent.blur(input)

		expect(errorsOf(container)).toBe('Invalid JSON')
	})

	test('reports the HTML5 validation message on blur and clears it once valid', async () => {
		const { input, container } = await renderForm()

		makeInvalid(input, 'Title is required')
		fireEvent.focus(input)
		fireEvent.blur(input)

		expect(errorsOf(container)).toBe('Title is required')

		makeValid(input)

		await waitFor(() => {
			expect(errorsOf(container)).toBe('')
		})
	})
})
