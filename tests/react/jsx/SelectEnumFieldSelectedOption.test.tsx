// Regression test for <this-issue-url>
//
// `SelectEnumField` renders its options as `SelectListItemUI`, which is built to show which one is
// active: its base class carries `data-[selected]:bg-gray-100` and it appends a `CheckIcon` gated on
// `group-data-[selected]:opacity-100`. The field never sets that attribute, so the affordance is
// dead markup and an opened select gives no indication of the current value.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { SelectEnumField } from '../../../packages/bindx-ui/src/form/select-enum-field.js'
import { createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

const STATUS_OPTIONS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'published', label: 'Published' },
]

function StatusSelect(): React.ReactElement {
	// `article-1` is seeded with status 'draft', so 'Draft' is the current value.
	const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().status())
	if (article.$isLoading) return <div data-testid="loading">Loading…</div>
	if (article.$isError || article.$isNotFound) return <div data-testid="error">Error</div>
	return <SelectEnumField field={article.status} label="Status" options={STATUS_OPTIONS} />
}

const optionButtons = (container: Element): HTMLButtonElement[] =>
	Array.from(container.ownerDocument.querySelectorAll('button')).filter(
		(button): button is HTMLButtonElement => STATUS_OPTIONS.some(option => button.textContent?.trim() === option.label)
			&& !button.id.endsWith('-input'),
	)

describe('SelectEnumField selected option', () => {
	test('should mark the option matching the field value when the list is open', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<StatusSelect />
			</BindxProvider>,
		)

		const trigger = await waitFor(() => {
			const button = container.querySelector<HTMLButtonElement>('button[id$="-input"]')
			if (!button) throw new Error('select trigger not rendered')
			return button
		})
		expect(trigger.textContent).toContain('Draft')

		fireEvent.click(trigger)

		const options = await waitFor(() => {
			const found = optionButtons(container)
			if (found.length !== STATUS_OPTIONS.length) throw new Error(`expected ${STATUS_OPTIONS.length} options, got ${found.length}`)
			return found
		})

		const draft = options.find(option => option.textContent?.trim() === 'Draft')
		const published = options.find(option => option.textContent?.trim() === 'Published')

		// The option holding the current value is the one the user needs to see marked.
		expect(draft?.getAttribute('data-selected')).not.toBeNull()
		expect(published?.getAttribute('data-selected')).toBeNull()

		expect(draft?.getAttribute('role')).toBe('option')
		expect(draft?.getAttribute('aria-selected')).toBe('true')
		expect(published?.getAttribute('aria-selected')).toBe('false')
	})
})
