import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { Editor, Node, Transforms, type Descendant } from 'slate'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	hasMany,
	useEntity,
	Field,
} from '@contember/bindx-react'
import {
	BlockEditor,
	Editable,
	createEditorWithEssentials,
	withParagraphs,
	paragraphElementType,
	type SerializableEditorNode,
} from '@contember/bindx-editor'
import type { ReactNode } from 'react'
import type { BlockDefinitions } from '@contember/bindx-editor'

afterEach(() => {
	cleanup()
})

// ---------------------------------------------------------------------------
// Schema mirroring the example's Article + ContentReference
// ---------------------------------------------------------------------------
interface ContentReference {
	id: string
	type: string
	imageUrl: string | null
	caption: string | null
}
type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONObject | JSONArray
type JSONObject = { readonly [K in string]?: JSONValue }
type JSONArray = readonly JSONValue[]

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

const testSchema = defineSchema<TestSchema>({
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
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

const blocks: BlockDefinitions<ContentReference> = {
	image: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<div {...props.attributes} contentEditable={false} data-testid="image-block">
					<Field field={ref.caption}>
						{caption => <span data-testid="image-caption">{caption.value ?? 'NO-CAPTION'}</span>}
					</Field>
					{props.children}
				</div>
			)
		},
		staticRender: ref => (
			<>
				<Field field={ref.imageUrl} />
				<Field field={ref.caption} />
			</>
		),
	},
}

const ParagraphRenderer = (props: { attributes: object; children: ReactNode }): ReactNode => (
	<p {...props.attributes}>{props.children}</p>
)

// A document with: paragraph -> void image block (referenceId) -> paragraph.
// This is the exact shape the example seeds richContent with.
function makeRichContent(refId: string): SerializableEditorNode {
	return {
		formatVersion: 2,
		children: [
			{ type: 'paragraph', children: [{ text: 'Intro paragraph' }] },
			{ type: 'image', referenceId: refId, children: [{ text: '' }] },
			{ type: 'paragraph', children: [{ text: 'Outro paragraph' }] },
		] as unknown as Descendant[],
	}
}

function makeMockData() {
	return {
		Article: {
			'a1': {
				id: 'a1',
				title: 'Test Article',
				richContent: makeRichContent('ref-1'),
				contentReferences: [
					{ id: 'ref-1', type: 'image', imageUrl: 'https://example.com/x.png', caption: 'Hello caption' },
				],
			},
		},
		ContentReference: {
			'ref-1': { id: 'ref-1', type: 'image', imageUrl: 'https://example.com/x.png', caption: 'Hello caption' },
		},
	}
}

// ---------------------------------------------------------------------------
// PART 1 — Editor-level value-sync round-trip (deterministic, no DOM editing).
//
// Reproduces precisely what BlockEditor.SyncValue + handleEditorOnChange do:
//   * derive `nodes` from field.value.children
//   * Slate sets editor.children = nodes (initialValue)
//   * user edits -> editor.children becomes a NEW array `value`
//   * handleEditorOnChange stores { formatVersion, children: value }
//   * field.value re-read -> nodes2 = value.children
//   * SyncValue re-runs: must NOT reset the doc (nodes2 === editor.children)
//
// The bug class we probe: if the snapshot store does not preserve reference
// identity of the stored children array, SyncValue.JSON.stringify mismatch is
// irrelevant — but the *reset path* removes all nodes and re-inserts, which
// wipes the live selection on every keystroke and makes editing impossible.
// ---------------------------------------------------------------------------

// The exact reset logic from BlockEditor.SyncValue (packages/bindx-editor/src/components/BlockEditor.tsx:253-266)
function runSyncValue(editor: Editor, nodes: Descendant[]): boolean {
	let didReset = false
	if (editor.children !== nodes && JSON.stringify(editor.children) !== JSON.stringify(nodes)) {
		didReset = true
		Editor.withoutNormalizing(editor, () => {
			for (const [, childPath] of Node.children(editor, [], { reverse: true })) {
				Transforms.removeNodes(editor, { at: childPath })
			}
			Transforms.insertNodes(editor, nodes)
		})
	}
	return didReset
}

describe('A: value-sync / data-flow', () => {
	test('SyncValue does not reset the editor doc after an onChange round-trip', () => {
		const editor = createEditorWithEssentials({ defaultElementType: paragraphElementType })
		;(withParagraphs({ render: ParagraphRenderer as never }) as (e: Editor) => Editor)(editor)

		// Initial field value (what the store hands back, jsonColumn => parsed object).
		let fieldValue: SerializableEditorNode = {
			formatVersion: 2,
			children: [{ type: 'paragraph', children: [{ text: 'hello' }] }] as unknown as Descendant[],
		}

		// nodes derived exactly like BlockEditor does.
		const nodes0 = fieldValue.children
		editor.children = nodes0
		// SyncValue on mount: editor.children === nodes0 -> no reset.
		expect(runSyncValue(editor, nodes0)).toBe(false)

		// Simulate a user keystroke: Slate produces a NEW children array.
		const typed: Descendant[] = [{ type: 'paragraph', children: [{ text: 'hello!' }] }] as unknown as Descendant[]
		editor.children = typed

		// handleEditorOnChange stores { formatVersion, children: typed }. The store
		// must keep `typed` by reference so the next derived nodes === editor.children.
		// Faithfully emulate the store's shallow snapshot semantics:
		//   setNestedValue({ ...data }, ['richContent'], { formatVersion, children: typed })
		//   createEntitySnapshot => Object.freeze({ ...data })  (shallow)
		const newFieldValueObject: SerializableEditorNode = { formatVersion: 2, children: typed }
		const dataAfter = Object.freeze({ ...{ richContent: newFieldValueObject } })
		fieldValue = dataAfter.richContent

		// nodes re-derived after re-render.
		const nodes1 = fieldValue.children
		// SyncValue must see nodes1 === editor.children and skip the reset.
		expect(nodes1).toBe(editor.children)
		const didReset = runSyncValue(editor, nodes1)
		expect(didReset).toBe(false)
	})

	// ---------------------------------------------------------------------------
	// PART 2 — Full render of the real BlockEditor (with references).
	//
	// GENERAL symptom: blocks render empty/gray boxes with just a dash; the
	// referenced entity data does not render. This asserts the CORRECT behaviour:
	//   * the referenced image block must render its caption ("Hello caption")
	//   * the surrounding paragraph text must render (contributes to S2 — plain
	//     paragraphs around blocks must exist & be editable)
	// ---------------------------------------------------------------------------
	test('block referenced entity data renders inside the editor (GENERAL)', async () => {
		const adapter = new MockAdapter(makeMockData(), { delay: 0 })

		function Page(): ReactNode {
			const article = useEntity(articleDef, { by: { id: 'a1' } }, e =>
				e
					.id()
					.title()
					.richContent()
					.contentReferences(r => r.id().type().imageUrl().caption()),
			)
			if (article.$isLoading) return <div data-testid="loading">Loading</div>
			if (article.$isError || article.$isNotFound) return <div data-testid="err">Error</div>

			return (
				<div data-testid="ready">
					<BlockEditor
						field={article.richContent}
						references={article.contentReferences}
						discriminationField="type"
						blocks={blocks}
						plugins={[withParagraphs({ render: ParagraphRenderer as never })]}
					>
						{editor => (
							<div data-testid="content">
								<Editable
									renderElement={editor.renderElement}
									renderLeaf={editor.renderLeaf}
									onKeyDown={editor.onKeyDown}
								/>
							</div>
						)}
					</BlockEditor>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Page />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="ready"]')).not.toBeNull()
		})

		// Let any effects (SyncValue) settle.
		await act(async () => {
			await Promise.resolve()
		})

		const content = container.querySelector('[data-testid="content"]')
		expect(content).not.toBeNull()
		const text = content!.textContent ?? ''

		// CORRECT behaviour: the paragraph text around the block must render.
		expect(text).toContain('Intro paragraph')
		expect(text).toContain('Outro paragraph')

		// CORRECT behaviour: the referenced image block must render its caption.
		const caption = container.querySelector('[data-testid="image-caption"]')
		expect(caption).not.toBeNull()
		expect(caption!.textContent).toBe('Hello caption')
	})

	// ---------------------------------------------------------------------------
	// PART 3 — Root cause, isolated at the handle level.
	//
	// BlockEditor resolves a block's referenced entity *exclusively* via
	//   references.getById(referenceId)
	// (packages/bindx-editor/src/internal/hooks/useBlockEditorReferences.ts:51-53).
	//
	// But embedded child snapshots are only materialised into the store as a
	// SIDE EFFECT of reading HasManyListHandle.items (it calls ensureItemSnapshots
	// -> store.refreshServerData, packages/bindx/src/handles/HasManyListHandle.ts:132-156).
	// getById() / getItemHandle() (lines 259-287) does NOT materialise anything.
	//
	// Consequently, when getById is used without anyone ever touching .items
	// (exactly the editor's situation), the referenced entity's fields read null.
	//
	// This test asserts the CORRECT behaviour: getById must return a populated
	// accessor on its own. It FAILS on current code, proving the bug. The second
	// expectation documents that touching .items first "fixes" it, pinpointing the
	// missing materialisation in getById.
	// ---------------------------------------------------------------------------
	test('getById alone must return populated referenced entity (root cause)', async () => {
		const adapter = new MockAdapter(makeMockData(), { delay: 0 })

		let captionViaGetByIdAlone: string | null = 'unset'
		let captionAfterItems: string | null = 'unset'

		function Probe(): ReactNode {
			const article = useEntity(articleDef, { by: { id: 'a1' } }, e =>
				e
					.id()
					.title()
					.richContent()
					.contentReferences(r => r.id().type().imageUrl().caption()),
			)
			if (article.$isLoading) return <div data-testid="loading">Loading</div>
			if (article.$isError || article.$isNotFound) return <div data-testid="err">Error</div>

			const refs = article.contentReferences

			// (a) getById WITHOUT ever reading .items — the editor's real path.
			const viaGetById = refs.getById('ref-1') as unknown as { caption: { value: string | null } }
			captionViaGetByIdAlone = viaGetById?.caption?.value ?? null

			// (b) Now read .items (materialises snapshots) then getById again.
			void refs.items.length
			const viaGetByIdAfter = refs.getById('ref-1') as unknown as { caption: { value: string | null } }
			captionAfterItems = viaGetByIdAfter?.caption?.value ?? null

			return <div data-testid="probe-ready" />
		}

		render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(captionViaGetByIdAlone).not.toBe('unset')
		})

		// Reading .items first materialises the embedded snapshot — this works today.
		expect(captionAfterItems).toBe('Hello caption')

		// CORRECT behaviour: getById on its own must also be populated.
		// FAILS on current code (returns null), proving getById skips materialisation.
		expect(captionViaGetByIdAlone).toBe('Hello caption')
	})
})
