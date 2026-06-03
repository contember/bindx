import { describe, expect, test } from 'bun:test'
import { Editor, Transforms } from 'slate'
import {
	createEditorWithEssentials,
	withParagraphs,
	withBold,
	withLists,
	paragraphElementType,
	unorderedListElementType,
	orderedListElementType,
	listItemElementType,
} from '@contember/bindx-editor'
import type { ReactNode } from 'react'

// Renderers are irrelevant for editor-level transform tests; provide trivial stubs.
const noopRender = (props: { children: ReactNode }): ReactNode => props.children as ReactNode

// Build an editor the same way the example BlockEditor / RichTextEditor does:
// createEditorWithEssentials({ defaultElementType: 'paragraph' }) then apply plugin
// functions in order. This mirrors createEditor()'s `plugins.forEach(p => p(editor))`.
const buildEditor = (): Editor => {
	const editor = createEditorWithEssentials({ defaultElementType: paragraphElementType })
	const plugins = [
		withParagraphs({ render: noopRender as never }),
		withBold(),
		withLists({
			renderListItem: noopRender as never,
			renderUnorderedList: noopRender as never,
			renderOrderedList: noopRender as never,
		}),
	]
	for (const plugin of plugins) {
		;(plugin as (e: Editor) => Editor)(editor)
	}
	return editor
}

// Place a collapsed selection inside the first text node of the node at `path`.
const selectInside = (editor: Editor, path: number[]): void => {
	const point = Editor.start(editor, path)
	Transforms.select(editor, point)
}

describe('S3 — lists', () => {
	test('toggleElement(unorderedList) on a paragraph wraps it into ul > li > paragraph', () => {
		const editor = buildEditor()
		editor.children = [
			{ type: paragraphElementType, children: [{ text: 'hello' }] } as never,
		]
		selectInside(editor, [0])

		// This is what EditorElementTrigger -> editor.toggleElement(unorderedListElementType) does.
		editor.toggleElement(unorderedListElementType)
		Editor.normalize(editor, { force: true })

		// Expected: a single unorderedList containing one listItem.
		// After listItem normalization, a single default-element child is unwrapped, so the
		// listItem holds the text directly: ul > li > text("hello").
		expect(editor.children).toHaveLength(1)
		const list = editor.children[0] as { type: string; children: unknown[] }
		expect(list.type).toBe(unorderedListElementType)
		expect(list.children).toHaveLength(1)
		const item = list.children[0] as { type: string; children: { text?: string }[] }
		expect(item.type).toBe(listItemElementType)
		expect(item.children[0]!.text).toBe('hello')
	})

	test('toggleElement(orderedList) twice toggles a paragraph into a list and back out', () => {
		const editor = buildEditor()
		editor.children = [
			{ type: paragraphElementType, children: [{ text: 'item' }] } as never,
		]
		selectInside(editor, [0])

		editor.toggleElement(orderedListElementType)
		Editor.normalize(editor, { force: true })
		expect((editor.children[0] as { type: string }).type).toBe(orderedListElementType)

		// Toggle off — selection now lives inside the list; re-issuing the toggle must unwrap it.
		selectInside(editor, [0, 0])
		editor.toggleElement(orderedListElementType)
		Editor.normalize(editor, { force: true })

		// Back to a single paragraph containing the original text.
		expect(editor.children).toHaveLength(1)
		const para = editor.children[0] as { type: string; children: { text: string }[] }
		expect(para.type).toBe(paragraphElementType)
		expect(para.children[0]!.text).toBe('item')
	})

	test('Enter (insertBreak) at end of a non-empty list item splits into a new list item', () => {
		const editor = buildEditor()
		// ul > [ li > paragraph("first") ]
		editor.children = [
			{
				type: unorderedListElementType,
				children: [
					{
						type: listItemElementType,
						children: [{ type: paragraphElementType, children: [{ text: 'first' }] }],
					},
				],
			} as never,
		]
		Editor.normalize(editor, { force: true })

		// Caret at the end of "first".
		const end = Editor.end(editor, [0, 0])
		Transforms.select(editor, end)

		editor.insertBreak()
		Editor.normalize(editor, { force: true })

		// Expect the single list to now contain two list items.
		const list = editor.children[0] as { type: string; children: unknown[] }
		expect(list.type).toBe(unorderedListElementType)
		expect(list.children).toHaveLength(2)
		for (const li of list.children) {
			expect((li as { type: string }).type).toBe(listItemElementType)
		}
		// The first item still holds "first" (listItem holds the text directly after normalization).
		const firstItem = list.children[0] as { type: string; children: { text?: string }[] }
		expect(firstItem.children[0]!.text).toBe('first')
	})

	test('Tab (indentListItem) nests the second list item under the first', () => {
		const editor = buildEditor()
		// ul > [ li > p("a"), li > p("b") ]
		editor.children = [
			{
				type: unorderedListElementType,
				children: [
					{ type: listItemElementType, children: [{ type: paragraphElementType, children: [{ text: 'a' }] }] },
					{ type: listItemElementType, children: [{ type: paragraphElementType, children: [{ text: 'b' }] }] },
				],
			} as never,
		]
		Editor.normalize(editor, { force: true })

		// Caret inside the second list item, then Tab to indent.
		Transforms.select(editor, Editor.start(editor, [0, 1]))
		editor.onKeyDown({
			key: 'Tab',
			shiftKey: false,
			preventDefault: () => {},
			nativeEvent: { key: 'Tab' },
		} as never)
		Editor.normalize(editor, { force: true })

		// Top-level list now has a single item; that item contains a nested list with item "b".
		const list = editor.children[0] as { type: string; children: { children: unknown[] }[] }
		expect(list.type).toBe(unorderedListElementType)
		expect(list.children).toHaveLength(1)
		const firstItem = list.children[0]!
		// firstItem children: [ paragraph("a"), nested unorderedList ]
		const nested = firstItem.children.find(
			(c): c is { type: string; children: unknown[] } =>
				typeof c === 'object' && c !== null && (c as { type?: string }).type === unorderedListElementType,
		)
		expect(nested).toBeDefined()
		expect(nested!.children).toHaveLength(1)
	})
})
