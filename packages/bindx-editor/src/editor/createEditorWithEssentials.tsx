import { createElement, isValidElement, ReactElement } from 'react'
import { createEditor, Descendant, Editor, Element as SlateElement, Node as SlateNode, Path, Range as SlateRange, Text as SlateText, Transforms } from 'slate'
import * as Slate from 'slate'
import { withHistory } from 'slate-history'
import { ReactEditor, withReact } from 'slate-react'
import type { EditorElementPlugin, EditorMarkPlugin } from '../types/plugins.js'
import type { TextSpecifics } from '../types/editor.js'
import { DefaultElement } from '../internal/components/DefaultElement.js'
import { withPaste } from '../plugins/behaviour/paste/withPaste.js'
import { BindxEditor } from './index.js'

export const createEditorWithEssentials = ({ defaultElementType }: { defaultElementType: string }): Editor => {
	const underlyingEditor = withHistory(withReact(createEditor() as ReactEditor))

	const editor = underlyingEditor as unknown as Editor
	const { normalizeNode, isInline, isVoid, deleteBackward } = editor

	const elements = new Map<string, EditorElementPlugin<any>>()
	const marks = new Map<string, EditorMarkPlugin>()

	Object.assign<Editor, Partial<Editor>>(editor, {
		slate: Slate,
		formatVersion: 1,
		defaultElementType,
		isDefaultElement: element => 'type' in element && (element as Record<string, unknown>)['type'] === defaultElementType,
		createDefaultElement: children => ({
			type: defaultElementType,
			children,
		}),
		insertBetweenBlocks: ([_element, path], edge) => {
			const edgeOffset = edge === 'before' ? 0 : 1
			const targetPath = path.slice(0, -1).concat(path[path.length - 1]! + edgeOffset)
			Transforms.insertNodes(editor, editor.createDefaultElement([{ text: '' }]), {
				at: targetPath,
				select: true,
			})
		},

		canToggleMarks: () => true,
		canToggleElement: <E extends SlateElement>() => true,

		hasMarks: <T extends SlateText>(marks: TextSpecifics<T>) => BindxEditor.hasMarks(editor, marks),

		isElementActive: <E extends SlateElement>(elementType: E['type'], suchThat?: Partial<E>) => {
			return (
				elements.get(elementType)?.isActive?.({ editor, suchThat })
				?? Array.from(Editor.nodes(editor, {
					match: node => SlateElement.isElement(node) && BindxEditor.isElementType(node, elementType, suchThat),
					voids: false,
				})).length > 0
			)
		},

		acceptsAttributes: <E extends SlateElement>(elementType: E['type'], suchThat: Partial<E>) => {
			return elements.get(elementType)?.acceptsAttributes?.({ editor, suchThat }) ?? false
		},

		toggleMarks: <T extends SlateText>(marks: TextSpecifics<T>) => {
			if (!editor.canToggleMarks(marks)) {
				return
			}
			const isActive = editor.hasMarks(marks)
			if (isActive) {
				BindxEditor.removeMarks(editor, marks)
				return false
			}
			BindxEditor.addMarks(editor, marks)
			return true
		},
		toggleElement: <E extends SlateElement>(elementType: E['type'], suchThat?: Partial<E>) => {
			elements.get(elementType)?.toggleElement?.({
				editor,
				suchThat,
			})
		},

		isInline: element => {
			return elements.get(element.type)?.isInline ?? isInline(element)
		},

		isVoid: element => {
			const elIsVoid = elements.get(element.type)?.isVoid
			if (elIsVoid === undefined) {
				return isVoid(element)
			}
			if (typeof elIsVoid === 'boolean') {
				return elIsVoid
			}
			return elIsVoid({ editor, element })
		},

		canContainAnyBlocks: element => {
			if (Editor.isEditor(element)) {
				return true
			}
			return !editor.isInline(element)
				&& !editor.isVoid(element)
				&& (elements.has(element.type) ? elements.get(element.type)!.canContainAnyBlocks ?? false : true)
		},

		serializeNodes: (nodes, errorMessage) => BindxEditor.serializeNodes(editor, nodes, errorMessage),
		deserializeNodes: (serializedNodes, errorMessage) =>
			BindxEditor.permissivelyDeserializeNodes(editor, serializedNodes, errorMessage),

		upgradeFormatBySingleVersion: (node, oldVersion) => {
			if (SlateElement.isElement(node)) {
				return {
					...node,
					children: node.children.map(child => editor.upgradeFormatBySingleVersion(child, oldVersion) as Descendant),
				}
			}
			return node
		},

		renderElement: props => {
			const component = elements.get(props.element.type)?.render ?? DefaultElement
			return createElement(component, props)
		},

		renderLeafChildren: props => props.children,

		renderLeaf: props => {
			let el: ReactElement = createElement('span', props.attributes, editor.renderLeafChildren(props))
			for (const [, mark] of marks) {
				if (props.leaf[mark.type] === true) {
					const markerEl = mark.render({ ...props, children: el })
					if (markerEl !== null) {
						if (!isValidElement(markerEl)) {
							throw new Error(`Mark plugin ${mark.type} returned a non-React element`)
						}
						el = markerEl
					}
				}
			}
			return el
		},

		onDOMBeforeInput: () => {},
		onKeyDown: e => {
			for (const [, mark] of marks) {
				if (mark.isHotKey(e.nativeEvent)) {
					editor.toggleMarks({ [mark.type]: true })
					e.preventDefault()
					return
				}
			}

			if (e.key !== 'Delete' && e.key !== 'Backspace') {
				return
			}
			const selection = editor.selection

			if (selection && SlateRange.isCollapsed(selection)) {
				const voidEntry = Editor.void(editor, {
					at: selection,
					mode: 'lowest',
					voids: true,
				})
				if (!voidEntry) {
					return
				}
				const [node, nodePath] = voidEntry
				if (editor.isInline(node)) {
					const adjacentPoint =
						e.key === 'Backspace'
							? Editor.point(editor, Path.next(nodePath), {
								edge: 'start',
							  })
							: Editor.point(editor, Path.previous(nodePath), {
								edge: 'end',
							  })
					Transforms.select(editor, adjacentPoint)
				}
			}
		},
		onFocus: () => {},
		onBlur: () => {},
		normalizeNode: ([node, path]) => {
			if (Editor.isEditor(node) && node.children.length === 0) {
				Transforms.insertNodes(editor, editor.createDefaultElement([{ text: '' }]))
			}
			if (!SlateElement.isElement(node)) {
				normalizeNode([node, path])
				return
			}
			let defaultPrevented = false
			elements.get(node.type)?.normalizeNode?.({
				element: node,
				path,
				editor,
				preventDefault: () => {
					defaultPrevented = true
				},
			})
			if (!defaultPrevented) {
				normalizeNode([node, path])
			}
		},
		registerElement: plugin => {
			elements.set(plugin.type, plugin)
		},
		registerMark: plugin => {
			marks.set(plugin.type, plugin)
		},

		deleteBackward: unit => {
			const selection = editor.selection

			if (selection && SlateRange.isCollapsed(selection)) {
				const [node, nodePath] = Editor.node(editor, [selection.focus.path[0]!])
				if (SlateElement.isElement(node) && SlateNode.string(node) === '') {
					const previous = Editor.previous(editor, {
						at: nodePath,
						voids: true,
					})

					if (previous) {
						const [previousNode] = previous
						if (SlateElement.isElement(previousNode) && editor.isVoid(previousNode)) {
							editor.apply({
								type: 'remove_node',
								path: nodePath,
								node,
							})
							return
						}
					}
				}
			}
			deleteBackward(unit)
		},
	})

	withPaste(editor)

	return editor
}
