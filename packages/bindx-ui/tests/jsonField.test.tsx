import '../../../tests/setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useEntity,
} from '@contember/bindx-react'
import type { JSONValue } from '@contember/bindx-form'
import { JsonField } from '../src/form/json-field.js'

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

function SettingsForm(): React.ReactNode {
	const settings = useEntity(settingsDef, { by: { id: 'settings-1' } }, e => e.name().payload())

	if (settings.$isLoading) return <div>Loading...</div>
	if (settings.$isError || settings.$isNotFound) return <div>Error</div>

	return (
		<div>
			<JsonField field={settings.payload} label="Payload" description="Raw JSON" />
			<span data-testid="value">{JSON.stringify(settings.payload.value)}</span>
		</div>
	)
}

interface RenderedField {
	readonly container: HTMLElement
	readonly textarea: HTMLTextAreaElement
}

async function renderJsonField(payload: JSONValue | null): Promise<RenderedField> {
	const adapter = new MockAdapter(
		{ Settings: { 'settings-1': { id: 'settings-1', name: 'Main', payload } } },
		{ delay: 0 },
	)

	const { container } = render(
		<BindxProvider adapter={adapter} schema={settingsSchema}>
			<SettingsForm />
		</BindxProvider>,
	)

	await waitFor(() => {
		expect(container.querySelector('textarea')).not.toBeNull()
	})

	const textarea = container.querySelector('textarea')
	if (textarea === null) throw new Error('Expected a textarea')
	return { container, textarea }
}

describe('JsonField', () => {
	test('renders the label and the pretty-printed value', async () => {
		const { container, textarea } = await renderJsonField({ theme: 'dark' })

		expect(container.textContent).toContain('Payload')
		expect(textarea.value).toBe('{\n  "theme": "dark"\n}')
	})

	test('round-trips edited JSON as a value', async () => {
		const { container, textarea } = await renderJsonField({ theme: 'dark' })

		fireEvent.change(textarea, { target: { value: '{"theme":"light"}' } })

		expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('{"theme":"light"}')
	})

	test('shows the parse error inline and keeps the previous value', async () => {
		const { container, textarea } = await renderJsonField({ theme: 'dark' })

		fireEvent.change(textarea, { target: { value: '{"theme":' } })

		expect(container.textContent).toContain('Invalid JSON')
		expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('{"theme":"dark"}')
		expect(textarea.hasAttribute('data-invalid')).toBe(true)
	})

	test('writes the empty value for an empty textarea', async () => {
		const { container, textarea } = await renderJsonField({ theme: 'dark' })

		fireEvent.change(textarea, { target: { value: '' } })

		expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('null')
	})
})
