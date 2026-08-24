import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Case,
	cond,
	Default,
	Field,
	type FieldRef,
	If,
	MockAdapter,
	Switch,
	useEntity,
} from '@contember/bindx-react'
import { createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function getByTestId(container: Element, testId: string): Element {
	const el = queryByTestId(container, testId)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

interface ProbeProps {
	readonly title: FieldRef<string>
}

/** Render counters let each test prove that memo really bailed out — the precondition for staleness. */
const renderCounts = { if: 0, switch: 0 }

const IfProbe = React.memo(function IfProbe({ title }: ProbeProps): React.ReactElement {
	renderCounts.if++
	return (
		<>
			<Field field={title} />
			<If
				condition={cond.eq(title, 'Changed')}
				then={<span data-testid="if-then">then</span>}
				else={<span data-testid="if-else">else</span>}
			/>
		</>
	)
})

const SwitchProbe = React.memo(function SwitchProbe({ title }: ProbeProps): React.ReactElement {
	renderCounts.switch++
	return (
		<>
			<Field field={title} />
			<Switch>
				<Case if={cond.eq(title, 'Changed')}>
					<span data-testid="switch-case">case</span>
				</Case>
				<Default>
					<span data-testid="switch-default">default</span>
				</Default>
			</Switch>
		</>
	)
})

let setTitle: ((value: string) => void) | null = null

interface HostProps {
	readonly children: (title: FieldRef<string>) => React.ReactNode
}

/**
 * Owns the entity subscription. Its children callback gets the (stable) title ref,
 * so the memoized probes below never re-render when the title changes.
 */
function Host({ children }: HostProps): React.ReactElement {
	const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title())
	if (article.$isLoading) return <div data-testid="loading">Loading</div>
	if (article.$isError || article.$isNotFound) return <div data-testid="error">Error</div>
	setTitle = value => article.title.setValue(value)
	return <div data-testid="host">{children(article.title)}</div>
}

function renderProbe(probe: (title: FieldRef<string>) => React.ReactNode): Element {
	const adapter = new MockAdapter(createMockData(), { delay: 0 })
	const { container } = render(
		<BindxProvider adapter={adapter} schema={testSchema}>
			<Host>{probe}</Host>
		</BindxProvider>,
	)
	return container
}

describe('condition DSL subscriptions', () => {
	test('<If> with a cond DSL condition re-evaluates inside a memoized subtree', async () => {
		renderCounts.if = 0
		const container = renderProbe(title => <IfProbe title={title} />)

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())
		expect(queryByTestId(container, 'if-else')).not.toBeNull()

		const rendersBefore = renderCounts.if
		act(() => {
			setTitle!('Changed')
		})

		// Precondition: the memoized probe does not re-render — only its subscribed leaves may.
		expect(renderCounts.if).toBe(rendersBefore)
		// Control: <Field> is subscribed, so it does show the new value.
		expect(getByTestId(container, 'host').textContent).toContain('Changed')

		expect(queryByTestId(container, 'if-then')).not.toBeNull()
		expect(queryByTestId(container, 'if-else')).toBeNull()
	})

	test('<Case if> with a cond DSL condition re-evaluates inside a memoized subtree', async () => {
		renderCounts.switch = 0
		const container = renderProbe(title => <SwitchProbe title={title} />)

		await waitFor(() => expect(queryByTestId(container, 'loading')).toBeNull())
		expect(queryByTestId(container, 'switch-default')).not.toBeNull()

		const rendersBefore = renderCounts.switch
		act(() => {
			setTitle!('Changed')
		})

		expect(renderCounts.switch).toBe(rendersBefore)
		expect(getByTestId(container, 'host').textContent).toContain('Changed')

		expect(queryByTestId(container, 'switch-case')).not.toBeNull()
		expect(queryByTestId(container, 'switch-default')).toBeNull()
	})
})
