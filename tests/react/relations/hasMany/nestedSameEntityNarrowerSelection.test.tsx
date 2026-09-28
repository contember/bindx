// Regression test for https://github.com/contember/bindx/issues/123
import '../../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	entityDef,
	hasMany,
	hasOne,
	MockAdapter,
	scalar,
	type SnapshotStore,
	useEntity,
	useEntityList,
	usePersist,
	useSnapshotStore,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId } from './setup'

afterEach(() => {
	cleanup()
})

interface StoredFile {
	id: string
	url: string
	size: number
}

interface Attachment {
	id: string
	name: string
	type: string
	file: StoredFile | null
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
	StoredFile: StoredFile
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
				file: hasOne('StoredFile', { nullable: true }),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
		StoredFile: {
			fields: {
				id: scalar(),
				url: scalar(),
				size: scalar(),
			},
		},
	},
})

const entityDefs = {
	Article: entityDef<Article>('Article'),
	Attachment: entityDef<Attachment>('Attachment'),
} as const

const by = { by: { id: 'article-1' } }

interface MockOptions {
	readonly type?: string
	readonly authorId?: string
}

function createMockData({ type = 'pdf', authorId = 'author-1' }: MockOptions = {}): ConstructorParameters<typeof MockAdapter>[0] {
	const file = { id: 'file-1', url: '/slides.pdf', size: 42 }
	const attachment = { id: 'att-1', name: 'Slides', type, file }
	const author = { id: authorId, name: 'Ann', email: 'ann@example.com' }
	const article = { id: 'article-1', attachments: [attachment], author, sections: [] as unknown[] }
	// The section points back at the SAME article: one response reaches it twice.
	article.sections = [{ id: 'section-1', article }]
	return {
		Article: { 'article-1': article },
		Section: {},
		Attachment: { 'att-1': { ...attachment } },
		Author: { [authorId]: { ...author } },
		StoredFile: {},
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

let bindxStore: SnapshotStore | null = null
let persistAll: (() => Promise<unknown>) | null = null
let editArticle: ((type: string, email: string) => void) | null = null

/** What the store holds for an entity field, as data and as its server baseline. */
function storedField(entityType: string, id: string, field: string): string {
	const snapshot = bindxStore!.getEntitySnapshot<Record<string, unknown>>(entityType, id)
	return `${String(snapshot?.data[field])}/${String(snapshot?.serverData[field])}`
}

function hasStoredField(entityType: string, id: string, field: string): boolean {
	const snapshot = bindxStore!.getEntitySnapshot<Record<string, unknown>>(entityType, id)
	return snapshot !== undefined && Object.hasOwn(snapshot.data, field)
}

/**
 * One root whose selection reaches the same article twice: directly with
 * `attachments { name type file { url size } }` and `author { name email }`, and through
 * `sections.article` with `attachments { name file { url } }` and `author { name }`.
 * `readNestedFirst` mirrors two sibling components where the one holding the narrower
 * selection renders first.
 */
function ArticleView({ readNestedFirst }: { readNestedFirst: boolean }): React.ReactElement {
	bindxStore = useSnapshotStore()
	const persist = usePersist()
	persistAll = () => persist.persistAll()
	const article = useEntity(entityDefs.Article, by, e =>
		e.id()
			.attachments(a => a.id().name().type().file(f => f.id().url().size()))
			.author(a => a.id().name().email())
			.sections(s => s.id().article(r => r.id().attachments(a => a.id().name().file(f => f.id().url())).author(a => a.id().name()))),
	)

	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div>Loading...</div>
	}

	editArticle = (type, email) => {
		article.attachments.items[0]?.$fields.type.setValue(type)
		article.author.email.setValue(email)
	}

	const nestedNames = (): string => article.sections.items
		.flatMap(s => [...s.article.attachments.items.map(a => `${a.$fields.name.value}@${a.file.url.value}`), s.article.author.name.value])
		.join(',')
	const direct = (): string => article.attachments.items
		.map(a => `${String(a.$fields.type.value)}:${String(a.file.size.value)}`)
		.concat(String(article.author.email.value))
		.join(',')

	const nestedBefore = readNestedFirst ? nestedNames() : ''
	const directValues = direct()
	const nested = readNestedFirst ? nestedBefore : nestedNames()

	return (
		<div>
			<span data-testid="nested">{nested}</span>
			<span data-testid="direct">{directValues}</span>
		</div>
	)
}

function ArticleList({ readNestedFirst }: { readNestedFirst: boolean }): React.ReactElement {
	bindxStore = useSnapshotStore()
	const articles = useEntityList(entityDefs.Article, {}, e =>
		e.id()
			.attachments(a => a.id().name().type())
			.sections(s => s.id().article(r => r.id().attachments(a => a.id().name()))),
	)
	if (articles.$status !== 'ready') {
		return <div>Loading...</div>
	}
	const nested = (): string => articles.items
		.flatMap(it => it.sections.items.flatMap(s => s.article.attachments.items.map(a => a.$fields.name.value)))
		.join(',')
	const direct = (): string => articles.items.flatMap(it => it.attachments.items.map(a => String(a.$fields.type.value))).join(',')
	const nestedBefore = readNestedFirst ? nested() : ''
	const directValues = direct()
	return (
		<div>
			<span data-testid="nested">{readNestedFirst ? nestedBefore : nested()}</span>
			<span data-testid="direct">{directValues}</span>
		</div>
	)
}

/** Both occurrences select the has-many with the same params, so they share one aliased, paginated key. */
function PaginatedView({ readNestedFirst }: { readNestedFirst: boolean }): React.ReactElement {
	const params = { orderBy: [{ name: 'asc' as const }], limit: 10 }
	const article = useEntity(entityDefs.Article, by, e =>
		e.id()
			.attachments(params, a => a.id().name().type())
			.sections(s => s.id().article(r => r.id().attachments(params, a => a.id().name()))),
	)
	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div>Loading...</div>
	}
	const nested = (): string => article.sections.items.flatMap(s => s.article.attachments.items.map(a => a.$fields.name.value)).join(',')
	const nestedBefore = readNestedFirst ? nested() : ''
	const direct = article.attachments.items.map(a => String(a.$fields.type.value)).join(',')
	return (
		<div>
			<span data-testid="nested">{readNestedFirst ? nestedBefore : nested()}</span>
			<span data-testid="direct">{direct}</span>
		</div>
	)
}

function NarrowRoot(): React.ReactElement {
	const article = useEntity(entityDefs.Article, by, e => e.id().attachments(a => a.id().name()).author(a => a.id().name()))
	if (article.$isLoading || article.$isError || article.$isNotFound) {
		return <div>Loading...</div>
	}
	return <span data-testid="narrow">{article.attachments.items.map(a => a.$fields.name.value).join(',')}</span>
}

function AttachmentRoot(): React.ReactElement {
	const attachment = useEntity(entityDefs.Attachment, { by: { id: 'att-1' } }, e => e.id().type())
	if (attachment.$isLoading || attachment.$isError || attachment.$isNotFound) {
		return <div>Loading...</div>
	}
	return <span data-testid="attachment-type">{String(attachment.type.value)}</span>
}

for (const readNestedFirst of [true, false]) {
	const order = readNestedFirst ? 'narrower nested occurrence read first' : 'wider direct occurrence read first'

	describe(`one response reaching the same entity twice (${order})`, () => {
		test('keeps the wider has-many, has-one and nested has-one fields', async () => {
			const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <ArticleView readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')

			expect(getByTestId(container, 'nested').textContent).toBe('Slides@/slides.pdf,Ann')
			expect(getByTestId(container, 'direct').textContent).toBe('pdf:42,ann@example.com')
			expect(storedField('Attachment', 'att-1', 'type')).toBe('pdf/pdf')
			expect(storedField('StoredFile', 'file-1', 'size')).toBe('42/42')
		})

		test('keeps the wider fields across the items of a list response', async () => {
			const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <ArticleList readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')

			expect(getByTestId(container, 'nested').textContent).toBe('Slides')
			expect(getByTestId(container, 'direct').textContent).toBe('pdf')
		})

		test('keeps the wider fields of a paginated has-many selected with params', async () => {
			const { container } = renderWithin(new MockAdapter(createMockData(), { delay: 0 }), <PaginatedView readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')

			expect(getByTestId(container, 'nested').textContent).toBe('Slides')
			expect(getByTestId(container, 'direct').textContent).toBe('pdf')
		})

		test('keeps two entity types that share an id apart', async () => {
			const adapter = new MockAdapter(createMockData({ authorId: 'att-1' }), { delay: 0 })
			const { container } = renderWithin(adapter, <ArticleView readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')

			expect(getByTestId(container, 'direct').textContent).toBe('pdf:42,ann@example.com')
			expect(hasStoredField('Attachment', 'att-1', 'email')).toBe(false)
			expect(hasStoredField('Author', 'att-1', 'type')).toBe(false)
		})
	})

	describe(`separate reads behave as before (${order})`, () => {
		test('a narrower read after a persist keeps the persisted values', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const { container, rerender } = renderWithin(adapter, <ArticleView readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')

			act(() => editArticle!('docx', 'ann@example.org'))
			await act(async () => {
				await persistAll!()
			})

			rerender(<BindxProvider adapter={adapter} schema={schema}><ArticleView readNestedFirst={readNestedFirst} /><NarrowRoot /></BindxProvider>)
			await waitForTestIds(container, 'narrow')

			expect(storedField('Attachment', 'att-1', 'type')).toBe('docx/docx')
			expect(storedField('Author', 'author-1', 'email')).toBe('ann@example.org/ann@example.org')
			expect(getByTestId(container, 'direct').textContent).toBe('docx:42,ann@example.org')
		})

		test('a refetch after a server change shows the new value', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const { container, rerender } = renderWithin(adapter, <ArticleView key="first" readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')
			expect(getByTestId(container, 'direct').textContent).toBe('pdf:42,ann@example.com')

			adapter.resetStore(createMockData({ type: 'docx' }))
			rerender(<BindxProvider adapter={adapter} schema={schema}><ArticleView key="second" readNestedFirst={readNestedFirst} /></BindxProvider>)

			await waitFor(() => {
				expect(getByTestId(container, 'direct').textContent).toBe('docx:42,ann@example.com')
			})
			expect(storedField('Attachment', 'att-1', 'type')).toBe('docx/docx')
		})

		test('a fresher read through another root is not overwritten by an older read', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const { container, rerender } = renderWithin(adapter, <ArticleView readNestedFirst={readNestedFirst} />)
			await waitForTestIds(container, 'direct')

			adapter.resetStore(createMockData({ type: 'docx' }))
			rerender(<BindxProvider adapter={adapter} schema={schema}><ArticleView readNestedFirst={readNestedFirst} /><AttachmentRoot /></BindxProvider>)
			await waitForTestIds(container, 'attachment-type')

			rerender(
				<BindxProvider adapter={adapter} schema={schema}>
					<ArticleView readNestedFirst={readNestedFirst} />
					<AttachmentRoot />
					<NarrowRoot />
				</BindxProvider>,
			)
			await waitForTestIds(container, 'narrow')

			expect(storedField('Attachment', 'att-1', 'type')).toBe('docx/docx')
			expect(getByTestId(container, 'attachment-type').textContent).toBe('docx')
			expect(getByTestId(container, 'direct').textContent).toBe('docx:42,ann@example.com')
		})
	})
}
