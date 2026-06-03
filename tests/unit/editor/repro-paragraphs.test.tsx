import { describe, expect, test } from 'bun:test'
import { Editor, Element as SlateElement, Node as SlateNode, Transforms } from 'slate'
import { createEditorWithEssentials } from '@contember/bindx-editor'
import { withParagraphs } from '@contember/bindx-editor'
import { referenceOverrides } from '../../../packages/bindx-editor/src/plugins/references/referenceOverrides.js'
import { prepareElementForInsertion } from '../../../packages/bindx-editor/src/plugins/references/utils/prepareElementForInsertion.js'

// ---------------------------------------------------------------------------
// Build an editor that mirrors BlockEditorWithReferences in the example:
//   - paragraphs plugin (default element)
//   - a VOID block element ("image") registered exactly like BlockEditor.tsx does
//   - referenceOverrides applied (insertNode / insertBreak / etc.)
// All of this is what drives the "Block Editor (with references)" page.
// ---------------------------------------------------------------------------
const buildBlockEditor = (): Editor => {
	const editor = createEditorWithEssentials({ defaultElementType: 'paragraph' })
	withParagraphs({ render: () => null as any })(editor)

	// Mirror BlockEditor.tsx registration of a void block.
	editor.registerElement({
		type: 'image',
		canContainAnyBlocks: true,
		isVoid: true,
		render: () => null as any,
	})

	referenceOverrides(editor)
	return editor
}

const voidBlock = (referenceId: string) => ({
	type: 'image',
	referenceId,
	children: [{ text: '' }],
})

const paragraph = (text: string) => ({
	type: 'paragraph',
	children: [{ text }],
})

describe('S2: adding a plain paragraph around void blocks', () => {
	test('normalize does NOT delete void blocks (document of only void blocks survives)', () => {
		const editor = buildBlockEditor()
		editor.children = [voidBlock('a'), voidBlock('b')]
		Editor.normalize(editor, { force: true })

		// Void blocks must survive normalization.
		const types = editor.children.map(n => (SlateElement.isElement(n) ? n.type : 'text'))
		expect(types.filter(t => t === 'image').length).toBe(2)
	})

	test('insertBetweenBlocks after the last void block yields an editable paragraph', () => {
		const editor = buildBlockEditor()
		editor.children = [voidBlock('a')]
		Editor.normalize(editor, { force: true })

		// The editor API offers insertBetweenBlocks; insert a paragraph AFTER the block.
		const lastIndex = editor.children.length - 1
		editor.insertBetweenBlocks([editor.children[lastIndex] as SlateElement, [lastIndex]], 'after')
		Editor.normalize(editor, { force: true })

		// There should now be an editable paragraph somewhere in the doc.
		const hasParagraph = editor.children.some(
			n => SlateElement.isElement(n) && n.type === 'paragraph',
		)
		expect(hasParagraph).toBe(true)

		// And the void block must still be present.
		const hasImage = editor.children.some(n => SlateElement.isElement(n) && n.type === 'image')
		expect(hasImage).toBe(true)
	})

	// FIXED (S2): inserting a void block into a fresh doc used to consume the only
	// editable paragraph, trapping the user with a document of only the void block.
	// createEditorWithEssentials.normalizeNode now guarantees a trailing editable
	// default element after a trailing void, so there is always a place to type.
	test('inserting a void block into a fresh doc keeps an editable paragraph to type in', () => {
		// Start from an empty editor (single default paragraph), the realistic starting state.
		const editor = buildBlockEditor()
		editor.children = [paragraph('')]
		editor.selection = {
			anchor: { path: [0, 0], offset: 0 },
			focus: { path: [0, 0], offset: 0 },
		}
		Editor.normalize(editor, { force: true })

		// Insert a void block exactly the way useBlockEditorReferences.insertBlock does:
		// withoutNormalizing -> prepareElementForInsertion(editor, true) -> insertNodes(at: path)
		Editor.withoutNormalizing(editor, () => {
			const path = prepareElementForInsertion(editor, true)
			Transforms.insertNodes(editor, voidBlock('a'), { at: path })
		})
		Editor.normalize(editor, { force: true })

		// The void block is present...
		const hasImage = editor.children.some(n => SlateElement.isElement(n) && n.type === 'image')
		expect(hasImage).toBe(true)
		// ...and there is still an editable (non-void) block to type into.
		const editableBlocks = editor.children.filter(
			n => SlateElement.isElement(n) && !editor.isVoid(n),
		)
		expect(editableBlocks.length).toBeGreaterThanOrEqual(1)
		// Specifically, the document ends with an editable default element.
		const last = editor.children[editor.children.length - 1]
		expect(SlateElement.isElement(last) && !editor.isVoid(last)).toBe(true)
	})

	test('a paragraph between two void blocks survives, and a trailing editable paragraph is guaranteed', () => {
		const editor = buildBlockEditor()
		editor.children = [voidBlock('a'), paragraph('hello'), voidBlock('b')]
		Editor.normalize(editor, { force: true })

		// The middle paragraph (with text "hello") must still exist and be editable.
		const paragraphs = editor.children.filter(
			n => SlateElement.isElement(n) && n.type === 'paragraph',
		)
		expect(paragraphs.some(p => SlateNode.string(p) === 'hello')).toBe(true)

		// Because the doc ended in a void, a trailing editable paragraph is guaranteed (S2 fix).
		const last = editor.children[editor.children.length - 1]
		expect(SlateElement.isElement(last) && (last as any).type === 'paragraph').toBe(true)
	})
})
