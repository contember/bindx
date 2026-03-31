import { toLatestFormat } from './toLatestFormat.js'
import { Editor as SlateEditor, Element as SlateElement, Text as SlateText } from 'slate'
import type { SerializableEditorNode } from '../../types/editor.js'

export const strictlyDeserializeNodes = <E extends SlateEditor>(
	editor: E,
	serializedElement: SerializableEditorNode | string,
	errorMessage?: string,
): Array<SlateElement | SlateText> => {
	let deserialized: SerializableEditorNode
	if (typeof serializedElement === 'string') {
		try {
			deserialized = JSON.parse(serializedElement)
		} catch {
			throw new Error(errorMessage ?? 'Editor: deserialization error')
		}
	} else {
		deserialized = serializedElement
	}
	return toLatestFormat(editor, deserialized).children
}
