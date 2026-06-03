import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	hasMany,
	hasOne,
	Entity,
	Field,
} from '@contember/bindx-react'
import type { MockDataStore, QuerySpec } from '@contember/bindx'
import { BlockEditor, Editable, withParagraphs, withBold } from '@contember/bindx-editor'
import type { BlockDefinitions } from '@contember/bindx-editor'
import type { RenderElementProps } from 'slate-react'

afterEach(() => {
	cleanup()
})

// ---------------------------------------------------------------------------
// Schema mirrors packages/example: Article.richContent + Article.contentReferences
// ContentReference is a void block entity discriminated by `type`.
// ---------------------------------------------------------------------------

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONObject | JSONArray
type JSONObject = { readonly [K in string]?: JSONValue }
type JSONArray = readonly JSONValue[]

interface ContentReference {
	id: string
	type: string
	imageUrl: string | null
	caption: string | null
	quoteText: string | null
	quoteAuthor: string | null
}

interface Article {
	id: string
	title: string
	// JSON scalar (union with a primitive) so it is treated as a scalar field, like the generated schema.
	richContent: JSONValue | null
	contentReferences: ContentReference[]
}

interface TestSchema {
	Article: Article
	ContentReference: ContentReference
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				richContent: scalar(),
				contentReferences: hasMany('ContentReference'),
			},
		},
		ContentReference: {
			fields: {
				id: scalar(),
				type: scalar(),
				imageUrl: scalar(),
				caption: scalar(),
				quoteText: scalar(),
				quoteAuthor: scalar(),
			},
		},
	},
})

const ArticleDef = entityDef<Article>('Article')

// richContent: a paragraph, an image block (void, referenceId=ref1),
// a quote block (void, referenceId=ref2), and a trailing paragraph.
const richContent = {
	formatVersion: 2,
	children: [
		{ type: 'paragraph', children: [{ text: 'Intro paragraph.' }] },
		{ type: 'image', referenceId: 'ref1', children: [{ text: '' }] },
		{ type: 'quote', referenceId: 'ref2', children: [{ text: '' }] },
		{ type: 'paragraph', children: [{ text: 'Outro paragraph.' }] },
	],
}

function createStore(): MockDataStore {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'My Article',
				richContent,
				contentReferences: [
					{ id: 'ref1', type: 'image', imageUrl: 'https://example.com/img.png', caption: 'A nice caption', quoteText: null, quoteAuthor: null },
					{ id: 'ref2', type: 'quote', imageUrl: null, caption: null, quoteText: 'To be or not to be', quoteAuthor: 'Shakespeare' },
				],
			},
		},
		ContentReference: {
			ref1: { id: 'ref1', type: 'image', imageUrl: 'https://example.com/img.png', caption: 'A nice caption', quoteText: null, quoteAuthor: null },
			ref2: { id: 'ref2', type: 'quote', imageUrl: null, caption: null, quoteText: 'To be or not to be', quoteAuthor: 'Shakespeare' },
		},
	}
}

// Block definitions mirror packages/example/components/editorConfig.tsx:
// all void, `if (!ref) return null`, render referenced fields.
const ParagraphRenderer = (props: RenderElementProps): React.ReactNode => (
	<p {...props.attributes}>{props.children}</p>
)

const blocks: BlockDefinitions<ContentReference> = {
	image: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<div {...props.attributes} contentEditable={false} data-testid="image-block">
					<Field field={ref.caption}>
						{caption => <span data-testid="image-caption">{caption.value ?? 'NO_CAPTION'}</span>}
					</Field>
					{props.children}
				</div>
			)
		},
		staticRender: ref => (
			<><Field field={ref.imageUrl} /><Field field={ref.caption} /></>
		),
	},
	quote: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<blockquote {...props.attributes} contentEditable={false} data-testid="quote-block">
					<Field field={ref.quoteText}>
						{text => <span data-testid="quote-text">{text.value ?? 'NO_TEXT'}</span>}
					</Field>
					<Field field={ref.quoteAuthor}>
						{author => <span data-testid="quote-author">{author.value ?? 'NO_AUTHOR'}</span>}
					</Field>
					{props.children}
				</blockquote>
			)
		},
		staticRender: ref => (
			<><Field field={ref.quoteText} /><Field field={ref.quoteAuthor} /></>
		),
	},
}

const plugins = [withParagraphs({ render: ParagraphRenderer }), withBold()]

// Capture the query spec sent to the backend so we can inspect whether the
// nested contentReferences selection (caption, quoteText, ...) was requested.
let capturedSpecs: QuerySpec[] = []
class CapturingAdapter extends MockAdapter {
	override async query(queries: any, options?: any): Promise<any> {
		for (const q of queries) {
			capturedSpecs.push(q.spec)
		}
		return super.query(queries, options)
	}
}

function BlockEditorHarness(): React.ReactNode {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }} loading={<div data-testid="loading">Loading</div>}>
			{article => (
				<div data-testid="editor-root">
					<BlockEditor
						field={article.richContent}
						references={article.contentReferences}
						discriminationField="type"
						blocks={blocks}
						plugins={plugins}
					>
						{editor => (
							<Editable
								renderElement={editor.renderElement}
								renderLeaf={editor.renderLeaf}
							/>
						)}
					</BlockEditor>
				</div>
			)}
		</Entity>
	)
}

describe('Block editor references (S1 / GENERAL)', () => {
	test('GENERAL: nested contentReferences fields are requested in the query', async () => {
		capturedSpecs = []
		const adapter = new CapturingAdapter(createStore(), { delay: 0 })

		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<BlockEditorHarness />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(document.querySelector('[data-testid="editor-root"]')).not.toBeNull()
		})

		// Find the Article query spec (QueryFieldSpec uses `name` + `nested.fields`)
		const articleSpec = capturedSpecs.find(s =>
			s.fields.some(f => f.name === 'contentReferences'),
		)

		// Helpful debug if it fails
		if (!articleSpec) {
			console.log('Captured specs:', JSON.stringify(capturedSpecs, null, 2))
		}
		expect(articleSpec).toBeDefined()

		const refsField = articleSpec!.fields.find(f => f.name === 'contentReferences')
		expect(refsField).toBeDefined()
		expect(refsField!.isArray).toBe(true)

		const nestedFieldNames = (refsField!.nested?.fields ?? []).map(f => f.name)
		console.log('contentReferences nested fields requested:', nestedFieldNames)
		// The block staticRender accesses caption / quoteText / quoteAuthor / imageUrl
		// and the discriminationField 'type'. These MUST be in the nested selection,
		// otherwise the void blocks render empty (the GENERAL symptom).
		expect(nestedFieldNames).toContain('type')
		expect(nestedFieldNames).toContain('caption')
		expect(nestedFieldNames).toContain('quoteText')
		expect(nestedFieldNames).toContain('quoteAuthor')
	})

	test('GENERAL: void blocks render their referenced entity field values', async () => {
		const adapter = new MockAdapter(createStore(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<BlockEditorHarness />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="editor-root"]')).not.toBeNull()
		})

		// Wait for the void blocks themselves to render
		await waitFor(() => {
			expect(container.querySelector('[data-testid="image-block"]')).not.toBeNull()
			expect(container.querySelector('[data-testid="quote-block"]')).not.toBeNull()
		})

		const caption = container.querySelector('[data-testid="image-caption"]')
		const quoteText = container.querySelector('[data-testid="quote-text"]')
		const quoteAuthor = container.querySelector('[data-testid="quote-author"]')

		// These are the CORRECT expected values from the referenced entities.
		// If the reference lookup / nested selection is broken, they render
		// 'NO_CAPTION' / 'NO_TEXT' (empty gray box with no data — the GENERAL symptom).
		expect(caption?.textContent).toBe('A nice caption')
		expect(quoteText?.textContent).toBe('To be or not to be')
		expect(quoteAuthor?.textContent).toBe('Shakespeare')
	})

	// Root-cause proof: HasManyListHandle.getById() (used by getReferencedEntity)
	// creates an item EntityHandle WITHOUT propagating the parent's embedded list
	// data into the child snapshot. Only the `items` getter runs
	// ensureItemSnapshots(). So getById() before any `.items` access returns an
	// empty entity, but reading `.items` first populates the store and then it works.
	test('ROOT CAUSE: getById resolves empty until .items is read', async () => {
		const adapter = new MockAdapter(createStore(), { delay: 0 })

		let beforeItems: string | null | undefined = 'UNSET'
		let afterItems: string | null | undefined = 'UNSET'

		const { useEntity } = await import('@contember/bindx-react')

		function Probe(): React.ReactNode {
			const article = useEntity(ArticleDef, { by: { id: 'article-1' } }, e =>
				e.id().title().contentReferences(r => r.id().type().caption().quoteText()),
			)
			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="probe-loading">loading</div>
			}
			// article.contentReferences is already a live HasManyAccessor.
			const refs = article.contentReferences as any

			// getById BEFORE touching .items (mirrors getReferencedEntity)
			const refBefore = refs.getById('ref1')
			beforeItems = refBefore.caption.value

			// Now read .items (this is what populates the child snapshots)
			void refs.items

			const refAfter = refs.getById('ref1')
			afterItems = refAfter.caption.value

			return <div data-testid="probe-done">done</div>
		}

		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(document.querySelector('[data-testid="probe-done"]')).not.toBeNull()
		})

		console.log('getById caption BEFORE .items:', beforeItems)
		console.log('getById caption AFTER .items:', afterItems)

		// Reading .items propagates embedded data, so AFTER must have the value.
		expect(afterItems).toBe('A nice caption')

		// FIXED: getById() now materialises the embedded child snapshot itself,
		// so the referenced entity is populated even when nobody iterates `items`.
		// This is the path the block editor uses (getReferencedEntity → getById),
		// so referenced blocks now render their data instead of empty boxes.
		expect(beforeItems).toBe('A nice caption')
	})
})
