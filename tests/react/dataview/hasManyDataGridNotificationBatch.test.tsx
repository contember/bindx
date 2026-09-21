import '../../setup'
import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Entity,
	MockAdapter,
	SnapshotStore,
	defineSchema,
	entityDef,
	hasMany,
	scalar,
} from '@contember/bindx-react'
import { DataGridTextColumn, HasManyDataGrid } from '@contember/bindx-dataview'
import { queryByTestId, TestTable } from './helpers.js'

afterEach(cleanup)

interface Article {
	id: string
	title: string
}

interface Author {
	id: string
	articles: Article[]
}

const schema = defineSchema<{ Article: Article; Author: Author }>({
	entities: {
		Article: { fields: { id: scalar(), title: scalar() } },
		Author: { fields: { id: scalar(), articles: hasMany('Article') } },
	},
})
const authorDef = entityDef<Author>('Author')

async function countNotificationsUntilLoaded(rowCount: number): Promise<number> {
	const articles = Array.from({ length: rowCount }, (_, i) => ({ id: `a${i}`, title: `Article ${i}` }))
	const adapter = new MockAdapter({
		Article: Object.fromEntries(articles.map(article => [article.id, article])),
		Author: { author: { id: 'author', articles } },
	}, { delay: 0 })
	const store = new SnapshotStore()
	let notifications = 0
	store.subscribe(() => { notifications++ })

	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema} store={store}>
			<Entity entity={authorDef} by={{ id: 'author' }}>
				{author => (
					<HasManyDataGrid field={author.articles}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								<TestTable />
							</>
						)}
					</HasManyDataGrid>
				)}
			</Entity>
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'datagrid-table')).not.toBeNull())
	cleanup()
	return notifications
}

test('loading a has-many grid page notifies independently of its row count', async () => {
	const single = await countNotificationsUntilLoaded(1)
	expect(await countNotificationsUntilLoaded(30)).toBe(single)
})
