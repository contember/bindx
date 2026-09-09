import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useEntity,
	usePersist,
} from '@contember/bindx-react'
import {
	FormFieldScope,
	FormInput,
	createJsonHandler,
	type JsonHandlerOptions,
	type JSONValue,
} from '../src/index.js'
import { getByTestId, queryByTestId } from './testUtils.js'

afterEach(() => {
	cleanup()
})

interface Settings {
	id: string
	name: string
	payload: JSONValue | null
}

const settingsSchema = defineSchema<{ Settings: Settings }>({
	entities: {
		Settings: {
			fields: {
				id: scalar(),
				name: scalar(),
				payload: { type: 'scalar', columnType: 'Json' },
			},
		},
	},
})

const settingsDef = entityDef<Settings>('Settings')

interface JsonFormProps {
	/** Omitted to let FormInput resolve the handler from the Json column type */
	readonly handlerOptions?: JsonHandlerOptions
}

function JsonForm({ handlerOptions }: JsonFormProps): React.ReactNode {
	const settings = useEntity(settingsDef, { by: { id: 'settings-1' } }, e => e.name().payload())
	const { persist } = usePersist()
	const [persistResult, setPersistResult] = React.useState('')
	const handler = React.useMemo(
		() => (handlerOptions === undefined ? undefined : createJsonHandler(handlerOptions)),
		[handlerOptions],
	)

	if (settings.$isLoading) return <div>Loading...</div>
	if (settings.$isError || settings.$isNotFound) return <div>Error</div>

	return (
		<div>
			<FormFieldScope field={settings.payload}>
				<FormInput field={settings.payload} handler={handler}>
					<textarea data-testid="input" />
				</FormInput>
			</FormFieldScope>
			<span data-testid="value">{JSON.stringify(settings.payload.value)}</span>
			<span data-testid="value-type">{typeof settings.payload.value}</span>
			<span data-testid="errors">{settings.payload.errors.map(error => error.message).join('|')}</span>
			<span data-testid="persist-result">{persistResult}</span>
			<button
				data-testid="persist"
				onClick={() => {
					void persist(settings.payload).then(result => setPersistResult(result.success ? 'saved' : 'blocked'))
				}}
			>
				Persist
			</button>
		</div>
	)
}

interface RenderedJsonForm {
	readonly container: HTMLElement
	readonly input: HTMLTextAreaElement
	readonly store: Record<string, unknown>
}

async function renderJsonForm(
	payload: JSONValue | null,
	handlerOptions?: JsonHandlerOptions,
): Promise<RenderedJsonForm> {
	const store = { id: 'settings-1', name: 'Main', payload }
	const adapter = new MockAdapter({ Settings: { 'settings-1': store } }, { delay: 0 })

	const { container } = render(
		<BindxProvider adapter={adapter} schema={settingsSchema}>
			<JsonForm handlerOptions={handlerOptions} />
		</BindxProvider>,
	)

	await waitFor(() => {
		expect(queryByTestId(container, 'input')).not.toBeNull()
	})

	const input = getByTestId(container, 'input')
	if (!(input instanceof HTMLTextAreaElement)) throw new Error('Expected a textarea')
	return { container, input, store }
}

function textOf(container: HTMLElement, testId: string): string {
	return getByTestId(container, testId).textContent ?? ''
}

describe('Json form input', () => {
	test('pretty-prints the stored value', async () => {
		const { input } = await renderJsonForm({ theme: 'dark', tags: ['a', 'b'] }, {})

		expect(input.value).toBe('{\n  "theme": "dark",\n  "tags": [\n    "a",\n    "b"\n  ]\n}')
	})

	test('writes parsed JSON to the accessor as a value, not a string', async () => {
		const { container, input } = await renderJsonForm(null, {})

		fireEvent.change(input, { target: { value: '{"theme":"light","count":2}' } })

		expect(textOf(container, 'value')).toBe('{"theme":"light","count":2}')
		expect(textOf(container, 'value-type')).toBe('object')
		expect(textOf(container, 'errors')).toBe('')
	})

	test('resolves the handler from the Json column type', async () => {
		const { container, input } = await renderJsonForm(null)

		fireEvent.change(input, { target: { value: '{"theme":"light"}' } })

		expect(textOf(container, 'value')).toBe('{"theme":"light"}')
		expect(textOf(container, 'value-type')).toBe('object')
	})

	test('keeps the raw text instead of reformatting it while typing', async () => {
		const { container, input } = await renderJsonForm(null, {})

		fireEvent.change(input, { target: { value: '{"theme": ' } })
		expect(getByTestId(container, 'input')).toHaveProperty('value', '{"theme": ')

		fireEvent.change(input, { target: { value: '{"theme":"light"}' } })
		expect(getByTestId(container, 'input')).toHaveProperty('value', '{"theme":"light"}')
	})

	test('shows an error and keeps the previous value when the JSON does not parse', async () => {
		const { container, input } = await renderJsonForm({ theme: 'dark' }, {})

		fireEvent.change(input, { target: { value: '{"theme":' } })

		expect(textOf(container, 'errors')).toContain('Invalid JSON')
		expect(textOf(container, 'value')).toBe('{"theme":"dark"}')
		expect(input.hasAttribute('data-invalid')).toBe(true)
	})

	test('keeps the parse error after the input loses focus', async () => {
		const { container, input } = await renderJsonForm({ theme: 'dark' }, {})

		fireEvent.change(input, { target: { value: '{"theme":' } })
		fireEvent.blur(input)

		expect(textOf(container, 'errors')).toContain('Invalid JSON')
	})

	test('clears the error once the text parses again', async () => {
		const { container, input } = await renderJsonForm({ theme: 'dark' }, {})

		fireEvent.change(input, { target: { value: '{"theme":' } })
		expect(textOf(container, 'errors')).toContain('Invalid JSON')

		fireEvent.change(input, { target: { value: '{"theme":"light"}' } })

		expect(textOf(container, 'errors')).toBe('')
		expect(textOf(container, 'value')).toBe('{"theme":"light"}')
		expect(input.hasAttribute('data-invalid')).toBe(false)
	})

	test('blocks persist while the JSON does not parse', async () => {
		const { container, input, store } = await renderJsonForm({ theme: 'dark' }, {})

		fireEvent.change(input, { target: { value: '{"theme":"light"}' } })
		fireEvent.change(input, { target: { value: '{"theme":' } })

		await act(async () => {
			getByTestId(container, 'persist').dispatchEvent(new MouseEvent('click', { bubbles: true }))
			await new Promise(resolve => setTimeout(resolve, 50))
		})

		expect(textOf(container, 'persist-result')).toBe('blocked')
		expect(store['payload']).toEqual({ theme: 'dark' })

		fireEvent.change(input, { target: { value: '{"theme":"light"}' } })

		await act(async () => {
			getByTestId(container, 'persist').dispatchEvent(new MouseEvent('click', { bubbles: true }))
			await new Promise(resolve => setTimeout(resolve, 50))
		})

		expect(textOf(container, 'persist-result')).toBe('saved')
		expect(store['payload']).toEqual({ theme: 'light' })
	})

	test('writes the default empty value for an empty input', async () => {
		const { container, input } = await renderJsonForm({ theme: 'dark' }, {})

		fireEvent.change(input, { target: { value: '   ' } })

		expect(textOf(container, 'value')).toBe('null')
		expect(textOf(container, 'errors')).toBe('')
	})

	test('writes a custom empty value for an empty input', async () => {
		const { container, input } = await renderJsonForm({ theme: 'dark' }, { emptyValue: {} })

		fireEvent.change(input, { target: { value: '' } })

		expect(textOf(container, 'value')).toBe('{}')
	})

	test('reports a validate failure as a field error', async () => {
		const isObject = (value: JSONValue): boolean => typeof value === 'object' && value !== null && !Array.isArray(value)
		const { container, input } = await renderJsonForm(null, {
			validate: value => (isObject(value) ? null : 'Expected an object'),
		})

		fireEvent.change(input, { target: { value: '42' } })
		expect(textOf(container, 'errors')).toBe('Expected an object')
		expect(textOf(container, 'value')).toBe('42')

		fireEvent.change(input, { target: { value: '{"a":1}' } })
		expect(textOf(container, 'errors')).toBe('')
	})

	test('pretty-prints on blur when formatOnBlur is set', async () => {
		const { container, input } = await renderJsonForm(null, { formatOnBlur: true })

		fireEvent.change(input, { target: { value: '{"a":1}' } })
		expect(getByTestId(container, 'input')).toHaveProperty('value', '{"a":1}')

		fireEvent.blur(input)

		expect(getByTestId(container, 'input')).toHaveProperty('value', '{\n  "a": 1\n}')
	})

	test('leaves the raw input alone on blur without formatOnBlur', async () => {
		const { container, input } = await renderJsonForm(null, {})

		fireEvent.change(input, { target: { value: '{"a":1}' } })
		fireEvent.blur(input)

		expect(getByTestId(container, 'input')).toHaveProperty('value', '{"a":1}')
	})
})
