// Regression test for <issue-url — filled in after the issue is filed>
import '../../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, defineSchema, entityDef, hasMany, hasOne, MockAdapter, scalar, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId } from './setup'

afterEach(() => {
	cleanup()
})

interface Attachment {
	id: string
	name: string
	type: string
}

interface Meeting {
	id: string
	session: Session | null
}

interface Session {
	id: string
	attachments: Attachment[]
	meetings: Meeting[]
}

interface CycleSchema {
	Session: Session
	Meeting: Meeting
	Attachment: Attachment
}

const schema = defineSchema<CycleSchema>({
	entities: {
		Session: {
			fields: {
				id: scalar(),
				attachments: hasMany('Attachment'),
				meetings: hasMany('Meeting'),
			},
		},
		Meeting: {
			fields: {
				id: scalar(),
				session: hasOne('Session', { nullable: true }),
			},
		},
		Attachment: {
			fields: {
				id: scalar(),
				name: scalar(),
				type: scalar(),
			},
		},
	},
})

const entityDefs = {
	Session: entityDef<Session>('Session'),
} as const

function createMockData() {
	const attachments = [{ id: 'att-1', name: 'Slides', type: 'learningMaterial' }]
	return {
		Session: {
			'session-1': {
				id: 'session-1',
				attachments,
				// The meeting points back at the SAME session — a cycle the page selects
				// through a second component with a narrower attachment selection.
				meetings: [{ id: 'meeting-1', session: { id: 'session-1', attachments } }],
			},
		},
		Meeting: {},
		Attachment: {},
	}
}

/**
 * One root entity whose selection reaches the same `Session` twice: directly with
 * `attachments { name type }`, and through `meetings.session` with `attachments { name }`.
 * `readNestedFirst` mirrors two sibling components where the one holding the narrower
 * selection renders first.
 */
function SessionView({ readNestedFirst }: { readNestedFirst: boolean }): React.ReactElement {
	const session = useEntity(entityDefs.Session, { by: { id: 'session-1' } }, e =>
		e.id()
			.attachments(a => a.id().name().type())
			.meetings(m => m.id().session(s => s.id().attachments(a => a.id().name()))),
	)

	if (session.$isLoading || session.$isError || session.$isNotFound) {
		return <div>Loading...</div>
	}

	const nestedNames = () => session.meetings.items.flatMap(m => m.session.attachments.items.map(a => a.$fields.name.value)).join(',')
	const directTypes = () => session.attachments.items.map(a => String(a.$fields.type.value)).join(',')

	const nested = readNestedFirst ? nestedNames() : ''
	const types = directTypes()
	const nestedAfter = readNestedFirst ? nested : nestedNames()

	return (
		<div>
			<span data-testid="nested-names">{nestedAfter}</span>
			<span data-testid="direct-types">{types}</span>
		</div>
	)
}

describe('HasMany - the same entity reached twice with different selections', () => {
	test('should keep the wider selection\'s fields when the narrower nested occurrence is read first', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<SessionView readNestedFirst />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'direct-types')).not.toBeNull()
		})

		expect(getByTestId(container, 'nested-names').textContent).toBe('Slides')
		expect(getByTestId(container, 'direct-types').textContent).toBe('learningMaterial')
	})

	test('should keep the wider selection\'s fields when the direct occurrence is read first', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<SessionView readNestedFirst={false} />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'direct-types')).not.toBeNull()
		})

		expect(getByTestId(container, 'nested-names').textContent).toBe('Slides')
		expect(getByTestId(container, 'direct-types').textContent).toBe('learningMaterial')
	})
})
