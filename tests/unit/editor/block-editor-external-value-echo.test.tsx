// Regression test for https://github.com/contember/bindx/issues/168
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import type { Descendant } from 'slate'
import { BindxProvider, MockAdapter, defineSchema, entityDef, scalar, useEntity, useUndo } from '@contember/bindx-react'
import { BlockEditor, Editable, withParagraphs, type SerializableEditorNode } from '@contember/bindx-editor'

afterEach(() => {
	cleanup()
})

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONObject | JSONArray
type JSONObject = { readonly [K in string]?: JSONValue }
type JSONArray = readonly JSONValue[]

interface Article {
	id: string
	// JSON scalar, as the generated schema declares a rich-text column.
	content: JSONValue | null
}
interface TestSchema {
	Article: Article
}

const testSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				content: scalar(),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

const doc = (text: string): SerializableEditorNode => ({
	formatVersion: 2,
	children: [{ type: 'paragraph', children: [{ text }] }] as unknown as Descendant[],
})

const ParagraphRenderer = (props: { attributes: object; children: ReactNode }): ReactNode => <p {...props.attributes}>{props.children}</p>

interface Harness {
	undo: () => void
	canRedo: boolean
	undoCount: number
	redoCount: number
	content: unknown
	setContent: (value: SerializableEditorNode | null) => void
}

let harness: Harness | null = null
let slateUndoCount = 0

function Page(): ReactNode {
	const { undo, canRedo, undoCount, redoCount } = useUndo()
	const article = useEntity(articleDef, { by: { id: 'a1' } }, e => e.id().content())
	if (article.$isLoading || article.$isError || article.$isNotFound) return null
	harness = {
		undo,
		canRedo,
		undoCount,
		redoCount,
		content: article.content.value,
		setContent: value => article.content.setValue(value as JSONValue),
	}
	return (
		<BlockEditor field={article.content} plugins={[withParagraphs({ render: ParagraphRenderer as never })]}>
			{editor => {
				slateUndoCount = editor.history.undos.length
				return <Editable renderElement={editor.renderElement} renderLeaf={editor.renderLeaf} onKeyDown={editor.onKeyDown} />
			}}
		</BlockEditor>
	)
}

// Longer than the UndoManager's 300 ms debounce, so every gesture is flushed to the stacks.
const settle = () =>
	act(async () => {
		await new Promise(resolve => setTimeout(resolve, 400))
	})

const renderEditor = async (content: SerializableEditorNode | null) => {
	harness = null
	const adapter = new MockAdapter({ Article: { a1: { id: 'a1', content } } }, { delay: 0 })
	render(
		<BindxProvider adapter={adapter} schema={testSchema} enableUndo={true}>
			<Page />
		</BindxProvider>,
	)
	await settle()
	if (!harness) throw new Error('editor did not render')
}

const current = (): Harness => {
	if (!harness) throw new Error('editor did not render')
	return harness
}

// An undo (or any write from outside the editor) changes the field the BlockEditor is bound to. The
// editor must follow the field, not write it back: SyncValue replaces the Slate children, Slate fires
// onChange for those operations, and the change handler stores the document as a new value.
describe('BlockEditor bound to a field changed from outside', () => {
	test('should keep the redo step when undo restores the previous document', async () => {
		await renderEditor(doc('before'))

		await act(async () => current().setContent(doc('after')))
		await settle()
		expect(current().undoCount).toBe(1)

		await act(async () => current().undo())
		await settle()

		expect(JSON.stringify(current().content)).toBe(JSON.stringify(doc('before')))
		// The editor's write-back is recorded as a fresh gesture: it lands on the undo stack and clears redo.
		expect(current().undoCount).toBe(0)
		expect(current().canRedo).toBe(true)
		expect(current().redoCount).toBe(1)
	})

	test('should leave the field empty when undo restores an empty field', async () => {
		await renderEditor(null)

		await act(async () => current().setContent(doc('typed')))
		await settle()

		await act(async () => current().undo())
		await settle()

		// The editor writes its empty paragraph back, so the field no longer holds the restored null.
		expect(current().content).toBeNull()
		expect(current().canRedo).toBe(true)
	})

	test('should keep a value set from outside out of the editor\'s own undo history', async () => {
		await renderEditor(doc('before'))

		await act(async () => current().setContent(doc('after')))
		await settle()

		expect(JSON.stringify(current().content)).toBe(JSON.stringify(doc('after')))
		// Ctrl+Z inside the editor must not step back over a value the editor only followed.
		expect(slateUndoCount).toBe(0)
	})
})
