import { createContext, useContext } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { Element } from 'slate'

export interface EditorBlockElement extends RenderElementProps {
	/** Patch the inline data stored directly on this block's Slate node (persisted in the JSON
	 *  field). Wraps `ReactEditor.findPath` + `Transforms.setNodes` so block renders don't have to. */
	setData: (patch: Partial<Element>) => void
}

const EditorBlockElementContext = createContext<EditorBlockElement | null>(null)

export const EditorBlockElementProvider = EditorBlockElementContext.Provider

export function useEditorBlockElement(): EditorBlockElement {
	const ctx = useContext(EditorBlockElementContext)
	if (!ctx) {
		throw new Error('useEditorBlockElement must be used within an EditorBlockElementProvider')
	}
	return ctx
}
