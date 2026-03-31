import { type ReactNode, useCallback, useState } from 'react'
import { Descendant, Editor, Element as SlateElement, Node as SlateNode, NodeEntry, Transforms } from 'slate'
import { Slate } from 'slate-react'
import { createEditor } from '../editor/createEditor.js'
import { paragraphElementType } from '../plugins/element/paragraphs/index.js'
import { useRichTextFieldNodes } from '../internal/hooks/useRichTextFieldNodes.js'
import type { FieldRef } from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import type { RichTextEditorProps } from '../types/editorProps.js'
import { BINDX_COMPONENT, type SelectionFieldMeta, type SelectionProvider } from '@contember/bindx-react'
import type { SerializableEditorNode } from '../types/editor.js'

export type { RichTextEditorProps }

export function RichTextEditor({ field, plugins, children }: RichTextEditorProps): ReactNode {
	// At runtime, field is always a full FieldRef (proxy provides all properties)
	const fullField = field as FieldRef<SerializableEditorNode | null>

	const [editor] = useState(() => {
		const { editor } = createEditor({
			plugins,
			defaultElementType: paragraphElementType,
		})

		const { normalizeNode } = editor
		Object.assign(editor, {
			insertBreak: () => {
				Transforms.insertText(editor, '\n')
			},
			normalizeNode: (nodeEntry: NodeEntry) => {
				const [node, path] = nodeEntry
				if (path.length === 0 && SlateElement.isAncestor(node)) {
					if (node.children.length > 1) {
						return Editor.withoutNormalizing(editor, () => {
							const targetPath = [0, (editor.children[0] as SlateElement).children.length]
							Transforms.moveNodes(editor, {
								at: [1],
								to: targetPath,
							})
							Transforms.unwrapNodes(editor, { at: targetPath })
						})
					}
					if (SlateElement.isElement(node.children[0]) && !editor.isDefaultElement(node.children[0])) {
						return Editor.withoutNormalizing(editor, () => {
							Transforms.wrapNodes(editor, editor.createDefaultElement([{ text: '' }]), {
								at: path,
							})
							Transforms.unwrapNodes(editor, { at: [0, 0] })
						})
					}
				}
				if (SlateElement.isElement(node) && Editor.isBlock(editor, node) && path.length > 1) {
					return Transforms.unwrapNodes(editor, { at: path })
				}
				normalizeNode(nodeEntry)
			},
		})

		return editor
	})

	const valueNodes = useRichTextFieldNodes({ editor, field: fullField })

	const onChange = useCallback(
		(value: Descendant[]) => {
			if (SlateNode.string({ type: 'dummy', children: value }) === '' && fullField.serverValue === null) {
				fullField.setValue(null)
				return
			}

			if (SlateElement.isElement(value[0])) {
				const contentJson: SerializableEditorNode = {
					formatVersion: editor.formatVersion,
					children: value[0].children,
				}
				fullField.setValue(contentJson)
			}
		},
		[fullField, editor.formatVersion],
	)

	return (
		<Slate editor={editor} initialValue={valueNodes} onChange={onChange}>
			{children(editor)}
		</Slate>
	)
}

// Static method for selection extraction
const richTextEditorAny = RichTextEditor as unknown as Record<string | symbol, unknown> & SelectionProvider

richTextEditorAny.getSelection = (props: unknown): SelectionFieldMeta | null => {
	const editorProps = props as RichTextEditorProps
	if (editorProps.field === undefined || editorProps.field === null) {
		return null
	}
	const meta = editorProps.field[FIELD_REF_META]
	if (!meta) {
		return null
	}
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

richTextEditorAny[BINDX_COMPONENT] = true
