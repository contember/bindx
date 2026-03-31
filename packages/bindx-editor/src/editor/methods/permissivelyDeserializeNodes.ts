import { toLatestFormat } from './toLatestFormat.js'
import { Editor as SlateEditor, Element as SlateElement, Text as SlateText } from 'slate'
import type { SerializableEditorNode } from '../../types/editor.js'

export const permissivelyDeserializeNodes = <E extends SlateEditor>(
	editor: E,
	serializedElement: SerializableEditorNode | string,
	errorMessage?: string,
): Array<SlateElement | SlateText> => {
	let deserialized: SerializableEditorNode | SlateElement | null = null

	if (typeof serializedElement === 'string') {
		try {
			deserialized = JSON.parse(serializedElement)
		} catch {}
	} else {
		deserialized = serializedElement
	}

	if (typeof deserialized !== 'object' || deserialized === null) {
		const fallbackText = typeof serializedElement === 'string' ? serializedElement : ''
		return [editor.createDefaultElement([{ text: fallbackText }])]
	}

	if ('formatVersion' in deserialized) {
		return toLatestFormat(editor, deserialized as SerializableEditorNode).children
	}

	return toLatestFormat(editor, {
		formatVersion: 0,
		children: [deserialized],
	}).children
}
