import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, SnapshotStore } from '@contember/bindx-react'
import { createClientError, createServerError } from '@contember/bindx'
import { useEntityErrors, type EntityErrorsState } from '../../../packages/bindx-react/src/hooks/useErrors.js'
import { testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

interface ProbeLog {
	renders: number
	state: EntityErrorsState | null
}

function Probe({ log }: { log: ProbeLog }): null {
	log.renders++
	log.state = useEntityErrors('Article', 'article-1')
	return null
}

function renderProbe(store: SnapshotStore, log: ProbeLog): void {
	render(
		<BindxProvider adapter={new MockAdapter({}, { delay: 0 })} store={store} schema={testSchema}>
			<Probe log={log} />
		</BindxProvider>,
	)
}

function createArticleStore(): SnapshotStore {
	const store = new SnapshotStore()
	store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Hello' }, true)
	return store
}

describe('useEntityErrors', () => {
	test('settles after mount and returns no errors for a clean entity', () => {
		const log: ProbeLog = { renders: 0, state: null }
		renderProbe(createArticleStore(), log)

		expect(log.renders).toBeLessThanOrEqual(2)
		expect(log.state?.hasErrors).toBe(false)
		expect(log.state?.allErrors).toEqual([])
	})

	test('returns entity, field and relation errors and re-renders a bounded number of times per change', () => {
		const store = createArticleStore()
		const log: ProbeLog = { renders: 0, state: null }
		renderProbe(store, log)

		const entityError = createServerError('Article is locked')
		const fieldError = createClientError({ message: 'Title is required' })
		const relationError = createServerError('Author not found')

		const rendersBefore = log.renders
		act(() => {
			store.addEntityError('Article', 'article-1', entityError)
			store.addFieldError('Article', 'article-1', 'title', fieldError)
			store.addRelationError('Article', 'article-1', 'author', relationError)
		})

		expect(log.renders - rendersBefore).toBeLessThanOrEqual(2)
		expect(log.state?.entityErrors).toEqual([entityError])
		expect(log.state?.fieldErrors.get('title')).toEqual([fieldError])
		expect(log.state?.relationErrors.get('author')).toEqual([relationError])
		expect(log.state?.allErrors).toEqual([entityError, fieldError, relationError])
		expect(log.state?.hasClientErrors).toBe(true)
		expect(log.state?.hasServerErrors).toBe(true)
	})

	test('keeps the returned state when an entity change leaves its errors unchanged', () => {
		const store = createArticleStore()
		const log: ProbeLog = { renders: 0, state: null }
		renderProbe(store, log)
		act(() => {
			store.addEntityError('Article', 'article-1', createServerError('Article is locked'))
		})
		const stateBefore = log.state

		act(() => {
			store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Hello again' }, true)
		})

		expect(log.state).toBe(stateBefore)
	})
})
