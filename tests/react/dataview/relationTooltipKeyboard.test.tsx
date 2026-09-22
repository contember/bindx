import '../../setup'
import { afterEach, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import { Tooltip, DataGridTooltipLabel } from '@contember/bindx-ui'

afterEach(async () => {
	await act(async () => {
		cleanup()
		await new Promise(resolve => setTimeout(resolve, 0))
	})
})

function renderCell(): ReturnType<typeof render> {
	return render(
		<Tooltip content={<><button>Filter</button><button>Exclude</button></>}>
			<DataGridTooltipLabel data-testid="label"><a href="#author">Author</a></DataGridTooltipLabel>
		</Tooltip>,
	)
}

test('focus reveals actions without stealing focus from the label or its link', async () => {
	const { getByTestId, getByRole } = renderCell()
	const label = getByTestId('label')
	act(() => label.focus())
	await waitFor(() => expect(getByRole('button', { name: 'Filter' })).not.toBeNull())
	expect(document.activeElement === label).toBe(true)
	const link = getByRole('link')
	act(() => link.focus())
	expect(document.activeElement === link).toBe(true)
	fireEvent.keyDown(link, { key: 'ArrowDown' })
	expect(document.activeElement === link).toBe(true)
})

test('Escape returns to the trigger without reopening; ArrowDown can enter again', async () => {
	const { getByTestId, getByRole } = renderCell()
	const label = getByTestId('label')
	act(() => label.focus())
	await waitFor(() => expect(getByRole('button', { name: 'Filter' })).not.toBeNull())
	act(() => getByRole('button', { name: 'Filter' }).focus())
	fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
	await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')).toBeNull())
	expect(document.activeElement === label).toBe(true)
	fireEvent.keyDown(label, { key: 'ArrowDown' })
	await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')?.contains(document.activeElement)).toBe(true))
})

test('Escape on a preview keeps focus on the link and outside dismissal preserves the new focus', async () => {
	const { getByRole } = renderCell()
	const { getByText } = render(<button>Outside</button>)
	const link = getByRole('link')
	act(() => link.focus())
	await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')).not.toBeNull())
	fireEvent.keyDown(link, { key: 'Escape' })
	await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')).toBeNull())
	expect(document.activeElement === link).toBe(true)
	act(() => getByText('Outside').focus())
	act(() => link.focus())
	await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')).not.toBeNull())
	act(() => getByText('Outside').focus())
	await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')).toBeNull())
	expect(document.activeElement === getByText('Outside')).toBe(true)
})
