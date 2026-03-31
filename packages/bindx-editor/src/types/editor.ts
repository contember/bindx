import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { BaseEditor, Descendant, Editor, Element as SlateElement, Node as SlateNode, NodeEntry, Text as SlateText } from 'slate'
import type { RenderElementProps, RenderLeafProps } from 'slate-react'
import type { EditorElementPlugin, EditorMarkPlugin } from './plugins.js'
import type * as Slate from 'slate'
import type { HtmlDeserializer } from '../plugins/behaviour/paste/HtmlDeserializer.js'

export type EditorDefaultElementFactory = (children: Descendant[]) => SlateElement

export interface WithEssentials {
	slate: typeof Slate
	htmlDeserializer: HtmlDeserializer
	formatVersion: number
	defaultElementType: string
	isDefaultElement: (element: SlateElement) => boolean
	createDefaultElement: EditorDefaultElementFactory
	insertBetweenBlocks: (blockEntry: NodeEntry, edge: 'before' | 'after') => void

	canToggleMarks: <T extends SlateText>(marks: TextSpecifics<T>) => boolean
	hasMarks: <T extends SlateText>(marks: TextSpecifics<T>) => boolean
	toggleMarks: <T extends SlateText>(marks: TextSpecifics<T>) => void

	canToggleElement: <E extends SlateElement>(elementType: E['type'], suchThat?: Partial<E>) => boolean
	isElementActive: <E extends SlateElement>(elementType: E['type'], suchThat?: Partial<E>) => boolean
	toggleElement: <E extends SlateElement>(elementType: E['type'], suchThat?: Partial<E>) => void
	acceptsAttributes: <E extends SlateElement>(elementType: E['type'], suchThat: Partial<E>) => boolean

	canContainAnyBlocks: (element: SlateElement | Editor) => boolean

	serializeNodes: (nodes: Array<Descendant>, errorMessage?: string) => SerializableEditorNode
	deserializeNodes: (serializedNodes: SerializableEditorNode | string, errorMessage?: string) => Array<SlateElement | SlateText>

	upgradeFormatBySingleVersion: (node: SlateNode, oldVersion: number) => SlateNode

	registerElement: (plugin: EditorElementPlugin<any>) => void
	registerMark: (plugin: EditorMarkPlugin) => void

	// <Editable> props
	renderElement: (props: RenderElementProps) => ReactElement
	renderLeaf: (props: RenderLeafProps) => ReactElement
	renderLeafChildren: (props: Omit<RenderLeafProps, 'attributes'>) => ReactElement
	onDOMBeforeInput: (event: Event) => void
	onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
	onFocus: (event: ReactFocusEvent<HTMLDivElement>) => void
	onBlur: (event: ReactFocusEvent<HTMLDivElement>) => void

	insertBlock?: (name: string, init?: (ref: unknown) => void) => void
}

export type EditorWithEssentials<E extends BaseEditor> = WithEssentials & E

export interface SerializableEditorNode {
	formatVersion: number
	children: Array<SlateElement | SlateText>
}

export type TextSpecifics<Text extends SlateText> = Omit<Text, 'text'>
