/**
 * @contember/bindx-editor - Slate-based rich text and block editor for Contember Bindx
 *
 * @packageDocumentation
 */

// Slate re-exports
export { Transforms, Editor, Node, Element, Text, Range, Point, Path } from 'slate'
export type { Descendant, BaseElement, BaseText } from 'slate'
export { Slate, Editable, ReactEditor } from 'slate-react'

// Slate type augmentation
export type { EditorElement, EditorText } from './slate-types.js'
export type { EditorWithEssentials, SerializableEditorNode } from './types/editor.js'

// Editor factory
export { createEditorWithEssentials } from './editor/createEditorWithEssentials.js'

// Editor methods
export {
	serializeNodes,
	permissivelyDeserializeNodes,
	strictlyDeserializeNodes,
	toLatestFormat,
	addMarks,
	removeMarks,
	hasMarks,
	canToggleMark,
	closest,
	closestBlockEntry,
	closestViableBlockContainerEntry,
	ejectElement,
	elementToSpecifics,
	textToSpecifics,
	isElementType,
	hasParentOfType,
	getPreviousSibling,
	getElementDataAttributes,
	topLevelNodes,
} from './editor/methods/index.js'

// Plugin types
export type {
	EditorPlugin,
	EditorElementPlugin,
	EditorMarkPlugin,
	CreateEditorPublicOptions,
} from './types/plugins.js'
export type { HtmlDeserializerPlugin } from './types/htmlDeserializer.js'

// Editor prop types
export type {
	RichTextEditorProps,
	BlockEditorBaseProps,
	BlockEditorWithReferencesProps,
	BlockEditorProps,
	BlockDefinition,
	BlockDefinitions,
	InsertBlockOptions,
} from './types/editorProps.js'

// Element plugins
export { withAnchors, anchorElementType, type AnchorElement } from './plugins/element/anchors/index.js'
export { withHeadings, headingElementType, type HeadingElement } from './plugins/element/headings/index.js'
export { withLists, orderedListElementType, unorderedListElementType, listItemElementType, type OrderedListElement, type UnorderedListElement, type ListItemElement } from './plugins/element/lists/index.js'
export { withParagraphs, paragraphElementType, type ParagraphElement } from './plugins/element/paragraphs/index.js'
export { withHorizontalRules, horizontalRuleElementType, type HorizontalRuleElement } from './plugins/element/horizontalRules/index.js'
export { withScrollTargets, scrollTargetElementType, type ScrollTargetElement } from './plugins/element/scrollTargets/index.js'
export { withTables, tableElementType, tableRowElementType, tableCellElementType, type TableElement, type TableRowElement, type TableCellElement } from './plugins/element/tables/index.js'

// Mark plugins
export { withBold, boldMark } from './plugins/text/bold/index.js'
export { withItalic, italicMark } from './plugins/text/italic/index.js'
export { withCode, codeMark } from './plugins/text/code/index.js'
export { withHighlight, highlightMark } from './plugins/text/highlight/index.js'
export { withStrikeThrough, strikeThroughMark } from './plugins/text/strikeThrough/index.js'
export { withUnderline, underlineMark } from './plugins/text/underline/index.js'
export { withNewline } from './plugins/text/newline/index.js'

// Attribute plugins
export { createAlignHandler, type AlignDirection } from './plugins/attributes/alignment/index.js'

// Paste / HTML deserialization
export { withPaste, HtmlDeserializer, createMarkHtmlDeserializer } from './plugins/behaviour/paste/index.js'

// Trigger components
export { EditorMarkTrigger, type EditorMarkTriggerProps } from './components/triggers/EditorMarkTrigger.js'
export { EditorElementTrigger, type EditorElementTriggerProps } from './components/triggers/EditorElementTrigger.js'
export { EditorGenericTrigger, type EditorGenericTriggerProps } from './components/triggers/EditorGenericTrigger.js'
export { EditorWrapNodeTrigger, type EditorWrapNodeTriggerProps } from './components/triggers/EditorWrapNodeTrigger.js'

// Editor components
export { RichTextEditor } from './components/RichTextEditor.js'
export { BlockEditor } from './components/BlockEditor.js'

// Contexts (internal, for advanced use)
export { EditorGetReferencedEntityProvider, useEditorGetReferencedEntity } from './contexts/EditorReferencesContext.js'
export { EditorBlockElementProvider, useEditorBlockElement, type EditorBlockElement } from './contexts/EditorBlockElementContext.js'

// Reference system
export { type ElementWithReference, isElementWithReference } from './plugins/references/elements/ElementWithReference.js'

// Sortable
export { withSortable } from './plugins/behaviour/sortable/index.js'

// Error boundary
export { EditorErrorBoundary, type EditorErrorBoundaryProps } from './components/EditorErrorBoundary.js'

// Hotkey utilities
export { isHotkey, type HotkeyDescriptor } from './utils/hotkeys.js'

// Internal utilities
export { parseUrl } from './internal/utils/parseUrl.js'
export { parseIframeSrc } from './internal/utils/parseIframeSrc.js'
