import '../setup'
// An <Entity create> root collects a selection to shape $data, but its field access stays
// unchecked: reading a field the collection did not see must keep working.
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, Entity, Field, MockAdapter, useAccessor, useField, type EntityRef } from '@contember/bindx-react'
import { entityDefs, schema, type Tag } from '../react/relations/hasMany/setup'

afterEach(() => {
	cleanup()
})

function CreateTag({ children }: { children: (tag: EntityRef<Tag>) => React.ReactNode }): React.ReactElement {
	return <Entity entity={entityDefs.Tag} create>{children}</Entity>
}

/** Renders inside one provider, so a re-render of `ui` keeps the same store and draft. */
function renderInProvider(ui: React.ReactElement): HTMLElement {
	const { container } = render(
		<BindxProvider adapter={new MockAdapter({}, { delay: 0 })} schema={schema}>{ui}</BindxProvider>,
	)
	return container
}

/** A plain component: the collection does not run its body. */
function ColorText({ tag }: { tag: EntityRef<Tag> }): React.ReactElement {
	const color = useField(tag.color)
	return <span data-testid="color">{color.value ?? 'none'}</span>
}

/** Publishes `$data`; reading it is not a field read, so it does not widen what the test exercises. */
function DataProbe({ tag, publish }: { tag: EntityRef<Tag>; publish: (data: unknown) => void }): null {
	publish(useAccessor(tag).$data)
	return null
}

function colorText(container: HTMLElement): string | null {
	return container.querySelector('[data-testid="color"]')?.textContent ?? null
}

describe('<Entity create> — a field outside the collected selection', () => {
	test('reads in a plain child component that receives the entity', () => {
		const container = renderInProvider(
			<CreateTag>
				{tag => (
					<>
						<Field field={tag.name} />
						<ColorText tag={tag} />
					</>
				)}
			</CreateTag>,
		)

		expect(colorText(container)).toBe('none')
	})

	test('reads once a condition that was false at collection renders it', () => {
		let show: () => void = () => {}
		function Form(): React.ReactElement {
			const [isShown, setIsShown] = useState(false)
			show = () => setIsShown(true)
			return (
				<CreateTag>
					{tag => (
						<>
							<Field field={tag.name} />
							{isShown && <Field field={tag.color}>{color => <span data-testid="color">{color.value ?? 'none'}</span>}</Field>}
						</>
					)}
				</CreateTag>
			)
		}
		const container = renderInProvider(<Form />)

		act(() => show())

		expect(colorText(container)).toBe('none')
	})

	test('writes in a handler that runs after the render', () => {
		let onPick: () => void = () => {}
		let data: unknown = null
		renderInProvider(
			<CreateTag>
				{tag => {
					onPick = () => tag.color.setValue('red')
					return (
						<>
							<Field field={tag.name} />
							<DataProbe tag={tag} publish={next => { data = next }} />
						</>
					)
				}}
			</CreateTag>,
		)

		expect(() => act(() => onPick())).not.toThrow()
		expect(data).toMatchObject({ color: 'red' })
	})
})
