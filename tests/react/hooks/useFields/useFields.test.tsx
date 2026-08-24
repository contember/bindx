import '../../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	SnapshotStore,
	FIELD_REF_META,
} from '@contember/bindx-react'
import { useRefSubscription } from '../../../../packages/bindx-react/src/hooks/useFields.js'
import { createMockData, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

interface SubscriptionKey {
	readonly entityType: string
	readonly entityId: string
}

class CountingStore extends SnapshotStore {
	readonly subscriptionLog: SubscriptionKey[] = []
	readonly activeSubscriptions = new Map<string, number>()

	override subscribeToEntity(entityType: string, id: string, callback: () => void): () => void {
		const key = JSON.stringify([entityType, id])
		this.subscriptionLog.push({ entityType, entityId: id })
		this.activeSubscriptions.set(key, (this.activeSubscriptions.get(key) ?? 0) + 1)
		const unsubscribe = super.subscribeToEntity(entityType, id, callback)
		return () => {
			unsubscribe()
			const remaining = (this.activeSubscriptions.get(key) ?? 1) - 1
			if (remaining === 0) {
				this.activeSubscriptions.delete(key)
			} else {
				this.activeSubscriptions.set(key, remaining)
			}
		}
	}

	isActive(entityType: string, entityId: string): boolean {
		return this.activeSubscriptions.has(JSON.stringify([entityType, entityId]))
	}
}

function metadataRef(entityType: string, entityId: string): object {
	return {
		[FIELD_REF_META]: {
			entityType,
			entityId,
			path: ['value'],
			fieldName: 'value',
			isArray: false,
			isRelation: false,
		},
	}
}

interface ProbeProps {
	readonly refs: readonly unknown[]
	readonly onRender: (values: readonly unknown[]) => void
}

function Probe({ refs, onRender }: ProbeProps): null {
	const values = useRefSubscription(refs)
	onRender(values)
	return null
}

function renderProbe(store: SnapshotStore, props: ProbeProps): ReturnType<typeof render> {
	return render(
		<BindxProvider
			adapter={new MockAdapter(createMockData(), { delay: 0 })}
			store={store}
			schema={testSchema}
		>
			<Probe {...props} />
		</BindxProvider>,
	)
}

describe('useRefSubscription', () => {
	test('tracks a variable target set and preserves input alignment', () => {
		const store = new CountingStore()
		const author = metadataRef('Author', 'author-1')
		const article = metadataRef('Article', 'article-1')
		const ignored = { value: 'not a ref' }
		const latestValues: Array<readonly unknown[]> = []
		const onRender = (values: readonly unknown[]): void => {
			latestValues.push(values)
		}
		const view = renderProbe(store, { refs: [], onRender })

		expect(store.activeSubscriptions.size).toBe(0)

		view.rerender(
			<BindxProvider
				adapter={new MockAdapter(createMockData(), { delay: 0 })}
				store={store}
				schema={testSchema}
			>
				<Probe refs={[author, null, ignored, article]} onRender={onRender} />
			</BindxProvider>,
		)
		expect(store.isActive('Author', 'author-1')).toBe(true)
		expect(store.isActive('Article', 'article-1')).toBe(true)
		expect(latestValues.at(-1)).toEqual([author, null, ignored, article])

		view.rerender(
			<BindxProvider
				adapter={new MockAdapter(createMockData(), { delay: 0 })}
				store={store}
				schema={testSchema}
			>
				<Probe refs={[article]} onRender={onRender} />
			</BindxProvider>,
		)
		expect(store.isActive('Author', 'author-1')).toBe(false)
		expect(store.isActive('Article', 'article-1')).toBe(true)
		expect(latestValues.at(-1)).toEqual([article])
	})

	test('stale targets stop triggering and new targets trigger', () => {
		const store = new CountingStore()
		const author = metadataRef('Author', 'author-1')
		const article = metadataRef('Article', 'article-1')
		let renders = 0
		const onRender = (): void => {
			renders++
		}
		const view = renderProbe(store, { refs: [author], onRender })

		view.rerender(
			<BindxProvider
				adapter={new MockAdapter(createMockData(), { delay: 0 })}
				store={store}
				schema={testSchema}
			>
				<Probe refs={[article]} onRender={onRender} />
			</BindxProvider>,
		)
		const afterTargetChange = renders

		act(() => {
			store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Old' }, true)
		})
		expect(renders).toBe(afterTargetChange)

		act(() => {
			store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'New' }, true)
		})
		expect(renders).toBe(afterTargetChange + 1)
	})

	test('deduplicates multiple refs to the same entity', () => {
		const store = new CountingStore()
		const title = metadataRef('Article', 'article-1')
		const published = metadataRef('Article', 'article-1')

		renderProbe(store, { refs: [title, null, published, title], onRender: () => undefined })

		expect(store.subscriptionLog).toEqual([
			{ entityType: 'Article', entityId: 'article-1' },
		])
		expect(store.activeSubscriptions.size).toBe(1)
	})
})
