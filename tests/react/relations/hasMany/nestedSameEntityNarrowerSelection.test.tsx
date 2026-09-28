// Regression test for https://github.com/contember/bindx/issues/123
import '../../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, defineSchema, entityDef, hasMany, hasOne, MockAdapter, scalar, type SnapshotStore, useEntity, useEntityList, usePersist, useSnapshotStore } from '@contember/bindx-react'
import { getByTestId, queryByTestId } from './setup'

afterEach(() => {
	cleanup()
})

interface Attachment {
	id: string
	name: string
	type: string
}

interface Author {
	id: string
	name: string
	email: string
}

interface Section {
	id: string
	article: Article | null
}

interface Article {
	id: string
	attachments: Attachment[]
	sections: Section[]
	author: Author | null
}

interface CycleSchema {
	Article: Article
	Section: Section
	Attachment: Attachment
	Author: Author
}

const schema = defineSchema<CycleSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				attachments: hasMany('Attachment'),
				sections: hasMany('Section'),
				author: hasOne('Author', { nullable: true }),
			},
		},
		Section: {
			fields: {
				id: scalar(),
				article: hasOne('Article', { nullable: true }),
			},
		},
		Attachment: {
			fields: {
				id: scalar(),
				name: scalar(),
				type: scalar(),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
	},
})

const entityDefs = {
	Article: entityDef<Article>('Article'),
	Attachment: entityDef<Attachment>('Attachment'),
} as const

const by = { by: { id: 'article-1' } }

function createMockData(): ConstructorParameters<typeof MockAdapter>[0] {
	const attachments = [{ id: 'att-1', name: 'Slides', type: 'pdf' }]
	const author = { id: 'author-1', name: 'Ann', email: 'ann@example.com' }
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				attachments,
				author,
				// The section points back at the SAME article — a cycle the page selects
				// through a second component with a narrower selection.
				sections: [{ id: 'section-1', article: { id: 'article-1', attachments, author } }],
			},
		},
		Section: {},
		Attachment: { 'att-1': { ...attachments[0] } },
		Author: { 'author-1': { ...author } },
	}
}

function renderWithin(adapter: MockAdapter, children: React.ReactNode): ReturnType<typeof render> {
	return render(<BindxProvider adapter={adapter} schema={schema}>{children}</BindxProvider>)
}

async function waitForTestIds(container: HTMLElement, ...testIds: string[]): Promise<void> {
	await waitFor(() => {
		for (const testId of testIds) {
			expect(queryByTestId(container, testId)).not.toBeNull()
		}
	})
}

/**
 * One root entity whose selection reaches the same `Article` twice: directly with
 * `attachments { name type }` and `author { name email }`, and through `sections.article`
 * with `attachments { name }` and `author { name }`. `readNestedFirst` mirrors two sibling
 * components where the one holding the narrower selection renders first.
 */
function ArticleView({ readNestedFirst }: { readNestedFirst: boolean }): React.ReactElement {
	const article = useEntity(entityDefs.Article, by, e =>
		e.id()
			.attachments(a => a.id().name().type())
			.author(a => a.id().name().email())
			.sections(m => m.id().article(s => s.id().attachments(a => a.id().name()).author(a => a.id().name()))),
	)

	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div>Loading...</div>
	}

	const nestedNames = (): string => article.sections.items
		.flatMap(m => [...m.article.attachments.items.map(a => a.$fields.name.value), m.article.author.name.value])
		.join(',')
	const directTypes = (): string => article.attachments.items.map(a => String(a.$fields.type.value)).join(',')
	const directEmail = (): string => String(article.author.email.value)

	const nested = readNestedFirst ? nestedNames() : ''
	const types = directTypes()
	const email = directEmail()
	const nestedAfter = readNestedFirst ? nested : nestedNames()

	return (
		<div>
			<span data-testid="nested-names">{nestedAfter}</span>
			<span data-testid="direct-types">{types}</span>
			<span data-testid="direct-email">{email}</span>
		</div>
	)
}

describe('the same entity reached twice in one query with different selections', () => {
	test('should keep the wider selection\'s fields when the narrower nested occurrence is read first', async () => {
		const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <ArticleView readNestedFirst />)
		await waitForTestIds(container, 'direct-types')

		expect(getByTestId(container, 'nested-names').textContent).toBe('Slides,Ann')
		expect(getByTestId(container, 'direct-types').textContent).toBe('pdf')
		expect(getByTestId(container, 'direct-email').textContent).toBe('ann@example.com')
	})

	test('should keep the wider selection\'s fields when the direct occurrence is read first', async () => {
		const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <ArticleView readNestedFirst={false} />)
		await waitForTestIds(container, 'direct-types')

		expect(getByTestId(container, 'nested-names').textContent).toBe('Slides,Ann')
		expect(getByTestId(container, 'direct-types').textContent).toBe('pdf')
		expect(getByTestId(container, 'direct-email').textContent).toBe('ann@example.com')
	})
})

// ── Two roots over one entity ─────────────────────────────────────────────

let editWideRoot: ((type: string, email: string) => void) | null = null
let persistAll: (() => Promise<unknown>) | null = null
let bindxStore: SnapshotStore | null = null

/** What the store holds for a related entity, as data and as its server baseline. */
function storedField(entityType: string, id: string, field: string): string {
	const snapshot = bindxStore!.getEntitySnapshot<Record<string, unknown>>(entityType, id)
	return `${String(snapshot?.data[field])}/${String(snapshot?.serverData[field])}`
}

function WideRoot(): React.ReactElement {
	const persist = usePersist()
	bindxStore = useSnapshotStore()
	persistAll = () => persist.persistAll()
	const article = useEntity(entityDefs.Article, by, e => e.id().attachments(a => a.id().name().type()).author(a => a.id().name().email()))
	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div>Loading...</div>
	}
	editWideRoot = (type, email) => {
		article.attachments.items[0]?.$fields.type.setValue(type)
		article.author.email.setValue(email)
	}
	return (
		<div>
			<span data-testid="wide-types">{article.attachments.items.map(a => String(a.$fields.type.value)).join(',')}</span>
			<span data-testid="wide-email">{String(article.author.email.value)}</span>
		</div>
	)
}

function NarrowRoot(): React.ReactElement {
	const article = useEntity(entityDefs.Article, by, e => e.id().attachments(a => a.id().name()).author(a => a.id().name()))
	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div>Loading...</div>
	}
	return <span data-testid="narrow-names">{article.attachments.items.map(a => a.$fields.name.value).join(',')}</span>
}

function NarrowList(): React.ReactElement {
	const articles = useEntityList(entityDefs.Article, {}, e => e.id().attachments(a => a.id().name()).author(a => a.id().name()))
	if (articles.$status !== 'ready') {
		return <div>Loading...</div>
	}
	return <span data-testid="narrow-names">{articles.items.flatMap(s => s.attachments.items.map(a => a.$fields.name.value)).join(',')}</span>
}

function AttachmentRoot(): React.ReactElement {
	const attachment = useEntity(entityDefs.Attachment, { by: { id: 'att-1' } }, e => e.id().type())
	if (attachment.$isLoading || attachment.$isError || attachment.$isNotFound) {
		return <div>Loading...</div>
	}
	return <span data-testid="attachment-type">{String(attachment.type.value)}</span>
}

describe('the same entity loaded by two roots with different selections', () => {
	test('should keep the wider root\'s fields when the narrower useEntity read lands last', async () => {
		const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <><WideRoot /><NarrowRoot /></>)
		await waitForTestIds(container, 'wide-types', 'narrow-names')

		expect(getByTestId(container, 'narrow-names').textContent).toBe('Slides')
		expect(getByTestId(container, 'wide-types').textContent).toBe('pdf')
		expect(getByTestId(container, 'wide-email').textContent).toBe('ann@example.com')
	})

	test('should keep the wider root\'s fields when the narrower useEntityList read lands last', async () => {
		const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <><WideRoot /><NarrowList /></>)
		await waitForTestIds(container, 'wide-types', 'narrow-names')

		expect(getByTestId(container, 'narrow-names').textContent).toBe('Slides')
		expect(getByTestId(container, 'wide-types').textContent).toBe('pdf')
		expect(getByTestId(container, 'wide-email').textContent).toBe('ann@example.com')
	})
})

describe('a narrower read after the related entity moved past its embedded copy', () => {
	test('should keep values persisted through the wider root', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { container, rerender } = renderWithin(adapter, <WideRoot />)
		await waitForTestIds(container, 'wide-types')

		act(() => editWideRoot!('docx', 'ann@example.org'))
		await act(async () => {
			await persistAll!()
		})
		expect(getByTestId(container, 'wide-types').textContent).toBe('docx')

		rerender(<BindxProvider adapter={adapter} schema={schema}><WideRoot /><NarrowRoot /></BindxProvider>)
		await waitForTestIds(container, 'narrow-names')

		expect(storedField('Attachment', 'att-1', 'type')).toBe('docx/docx')
		expect(storedField('Author', 'author-1', 'email')).toBe('ann@example.org/ann@example.org')
		expect(getByTestId(container, 'wide-types').textContent).toBe('docx')
		expect(getByTestId(container, 'wide-email').textContent).toBe('ann@example.org')
	})

	test('should keep values a read through another root brought in', async () => {
		const data = createMockData()
		// The attachment changed on the server after the article was read.
		data['Attachment'] = { 'att-1': { id: 'att-1', name: 'Slides', type: 'docx' } }
		const adapter = new MockAdapter(data, { delay: 0 })
		const { container, rerender } = renderWithin(adapter, <WideRoot />)
		await waitForTestIds(container, 'wide-types')
		expect(getByTestId(container, 'wide-types').textContent).toBe('pdf')

		rerender(<BindxProvider adapter={adapter} schema={schema}><WideRoot /><AttachmentRoot /></BindxProvider>)
		await waitForTestIds(container, 'attachment-type')
		expect(getByTestId(container, 'wide-types').textContent).toBe('docx')

		rerender(<BindxProvider adapter={adapter} schema={schema}><WideRoot /><AttachmentRoot /><NarrowRoot /></BindxProvider>)
		await waitForTestIds(container, 'narrow-names')

		expect(storedField('Attachment', 'att-1', 'type')).toBe('docx/docx')
		expect(getByTestId(container, 'wide-types').textContent).toBe('docx')
		expect(getByTestId(container, 'attachment-type').textContent).toBe('docx')
	})
})
