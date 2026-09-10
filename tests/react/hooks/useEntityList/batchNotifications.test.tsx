import '../../../setup'
import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React, { useLayoutEffect } from 'react'
import {
	BindxProvider, MockAdapter, defineSchema, entityDef, scalar,
	useEntityList, useSnapshotStore,
} from '@contember/bindx-react'

afterEach(cleanup)

interface Article {
	id: string
	title: string
}

const schema = defineSchema<{ Article: Article }>({
	entities: { Article: { fields: { id: scalar(), title: scalar() } } },
})
const articleDef = entityDef<Article>('Article')

test('a list response notifies global and entity subscribers only after all rows are loaded', async () => {
	const count = 200
	const rows = Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), { id: String(i), title: `Row ${i}` }]))
	const adapter = new MockAdapter({ Article: rows }, { delay: 0 })
	const observedCounts: number[] = []
	let entityCalls = 0

	function List(): React.JSX.Element {
		const store = useSnapshotStore()
		useLayoutEffect(() => {
			const readCount = (): number => Object.keys(rows).filter(id => store.hasEntity('Article', id)).length
			const unsubscribe = store.subscribe(() => observedCounts.push(readCount()))
			const unsubscribeEntity = store.subscribeToEntity('Article', '0', () => {
				entityCalls++
				expect(readCount()).toBe(count)
			})
			return () => { unsubscribe(); unsubscribeEntity() }
		}, [store])
		const articles = useEntityList(articleDef, {}, a => a.id().title())
		return <div>{articles.$status === 'ready' ? `Loaded ${articles.items.length}` : 'Loading'}</div>
	}

	const view = render(<BindxProvider adapter={adapter} schema={schema}><List /></BindxProvider>)
	await waitFor(() => expect(view.getByText(`Loaded ${count}`)).toBeDefined())
	expect(observedCounts.filter(value => value > 0)).toEqual([count])
	expect(entityCalls).toBe(1)
})
