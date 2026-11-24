import '../setup'
// $data of an <Entity create> root lists its selected unset fields as null,
// as $data of a hasMany.add entity does (tests/react/relations/hasMany/addUnsetFieldValue.test.tsx).
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, Entity, Field, MockAdapter, useAccessor, usePersist, type EntityAccessor, type EntityRef } from '@contember/bindx-react'
import type { CreateResult } from '@contember/bindx'
import { entityDefs, schema, type Tag } from '../react/relations/hasMany/setup'

afterEach(() => {
	cleanup()
})

/** MockAdapter that records the data of every create the persister sends. */
class RecordingAdapter extends MockAdapter {
	readonly created: Record<string, unknown>[] = []

	override async create(entityType: string, data: Record<string, unknown>): Promise<CreateResult> {
		this.created.push(data)
		return super.create(entityType, data)
	}
}

interface Probe {
	setName: (name: string) => void
	persistAll: () => Promise<unknown>
	data: () => unknown
}

function TagProbe({ tag, publish }: {
	tag: EntityRef<Tag>
	publish: (tag: EntityAccessor<Tag>, persistAll: () => Promise<unknown>) => void
}): null {
	const accessor = useAccessor(tag)
	const { persistAll } = usePersist()
	publish(accessor, persistAll)
	return null
}

async function mount(): Promise<{ adapter: RecordingAdapter; probe: () => Probe }> {
	const adapter = new RecordingAdapter({}, { delay: 0 })
	let published: { tag: EntityAccessor<Tag>; persistAll: () => Promise<unknown> } | null = null
	render(
		<BindxProvider adapter={adapter} schema={schema}>
			<Entity entity={entityDefs.Tag} create>
				{tag => (
					<>
						<Field field={tag.name} />
						<Field field={tag.color} />
						<TagProbe tag={tag} publish={(accessor, persistAll) => { published = { tag: accessor, persistAll } }} />
					</>
				)}
			</Entity>
		</BindxProvider>,
	)
	await waitFor(() => expect(published).not.toBeNull())
	return {
		adapter,
		probe: () => {
			if (published === null) throw new Error('The create form has not rendered yet')
			const { tag, persistAll } = published
			return {
				setName: name => tag.name.setValue(name),
				persistAll,
				data: () => tag.$data,
			}
		},
	}
}

describe('<Entity create> — $data of the root', () => {
	test('lists a selected field the form did not set as null, before and after the persist', async () => {
		const { probe } = await mount()
		act(() => probe().setName('New tag'))
		const expected = { id: expect.any(String), name: 'New tag', color: null }
		expect(probe().data()).toStrictEqual(expected)
		await act(async () => {
			await probe().persistAll()
		})
		expect(probe().data()).toStrictEqual(expected)
	})

	test('reading it leaves the field out of the create mutation', async () => {
		const { adapter, probe } = await mount()
		act(() => probe().setName('New tag'))
		expect(probe().data()).toMatchObject({ color: null })
		await act(async () => {
			await probe().persistAll()
		})
		expect(adapter.created).toStrictEqual([{ name: 'New tag' }])
	})
})
