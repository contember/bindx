import type { FieldRef } from '@contember/bindx'
import { Descendant, Editor } from 'slate'
import { useRef } from 'react'

export interface UseRichTextFieldNodesOptions {
	editor: Editor
	field: FieldRef<string | null>
}

export const useRichTextFieldNodes = ({
	editor,
	field,
}: UseRichTextFieldNodesOptions): Descendant[] => {
	const cacheRef = useRef<{ value: string | null; nodes: Descendant[] } | null>(null)

	const fieldValue = field.value

	if (cacheRef.current && cacheRef.current.value === fieldValue) {
		return cacheRef.current.nodes
	}

	if (typeof fieldValue !== 'string' && fieldValue !== null) {
		throw new Error('RichTextEditor: the underlying field does not contain a string value.')
	}

	const elements: Descendant[] =
		fieldValue === null || fieldValue === ''
			? [editor.createDefaultElement([{ text: '' }])]
			: [
				editor.createDefaultElement(
					editor.deserializeNodes(
						fieldValue,
						'RichTextEditor: the underlying field contains invalid JSON.',
					) as Descendant[],
				),
			  ]

	cacheRef.current = { value: fieldValue, nodes: elements }

	return elements
}
