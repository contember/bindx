import { Descendant, Element as SlateElement, Text as SlateText } from 'slate'
import type { HtmlDeserializerNextCallback, HtmlDeserializerPlugin } from '../../../types/htmlDeserializer.js'
import type { EditorDefaultElementFactory } from '../../../types/editor.js'

const ignoredElements = ['SCRIPT', 'STYLE', 'TEMPLATE']

export interface TextAttrs {
	[key: string]: unknown
}

export type NodesWithTypeFiltered =
	| { texts: Descendant[]; elements?: undefined }
	| { elements: SlateElement[]; texts?: undefined }

export type NodesWithType = NodesWithTypeFiltered | null

export class HtmlDeserializer {
	constructor(
		public createDefaultElement: EditorDefaultElementFactory,
		private plugins: HtmlDeserializerPlugin[],
	) {
	}

	registerPlugin(plugin: HtmlDeserializerPlugin, prepend: boolean = true): void {
		prepend ? this.plugins.unshift(plugin) : this.plugins.push(plugin)
	}

	public processNodeListPaste(nodeList: Node[], cumulativeTextAttrs: TextAttrs): NodesWithType {
		for (const plugin of this.plugins) {
			const result = plugin.processNodeListPaste?.({ nodeList, cumulativeTextAttrs, deserializer: this }) ?? null
			if (result !== null) {
				return result
			}
		}
		const processed: (
			| { text: SlateText | SlateElement; element?: undefined; isWhiteSpace: boolean }
			| { element: SlateElement; text?: undefined }
		)[] = []

		for (const childNode of nodeList) {
			const isWhiteSpace = childNode.nodeType === Node.TEXT_NODE && childNode.textContent?.match(/^\s*$/) !== null

			const attrs = this.processWithAttributeProcessor(childNode, cumulativeTextAttrs)
			const result =
				childNode instanceof HTMLElement
					? this.processBlockPaste(childNode, cumulativeTextAttrs)
					: null
			if (result !== null) {
				processed.push(...(Array.isArray(result) ? result : [result]).map(element => ({ element })))
			} else {
				const result = this.deserializeTextNode(childNode, cumulativeTextAttrs)
				if (result !== null) {
					processed.push(...result.map(text => ({ text, isWhiteSpace })))
				} else {
					const deserializedChildren = this.processNodeListPaste(
						Array.from(childNode.childNodes),
						attrs,
					)
					processed.push(
						...(deserializedChildren === null
							? []
							: deserializedChildren.texts !== undefined
								? deserializedChildren.texts.map(text => ({ text, isWhiteSpace }))
								: deserializedChildren.elements.map(element => ({ element }))),
					)
				}
			}
		}

		if (processed.length === 0) {
			return null
		}

		const containsBlock = processed.find(({ element }) => element !== undefined) !== undefined

		if (containsBlock) {
			return {
				elements: processed.flatMap(item => {
					if (item.text !== undefined) {
						return item.isWhiteSpace ? [] : [this.createDefaultElement([item.text])]
					} else if (item.element !== undefined) {
						return [item.element]
					}
					return []
				}),
			}
		} else {
			return { texts: processed.map(item => item.text as SlateText) }
		}
	}

	deserializeInline(list: NodeList | Node[], cumulativeTextAttrs: TextAttrs): Descendant[] {
		return Array.from(list).flatMap(childNode => {
			const result = this.deserializeTextNode(childNode, cumulativeTextAttrs)
			if (result !== null) {
				return result
			} else {
				const attrs = this.processWithAttributeProcessor(childNode, cumulativeTextAttrs)
				return this.deserializeInline(childNode.childNodes, attrs)
			}
		})
	}

	deserializeBlocks(list: Node[], cumulativeTextAttrs: TextAttrs): Descendant[] {
		const result = this.processNodeListPaste(list, cumulativeTextAttrs)
		if (result === null) {
			return []
		}
		// `deserializeBlocks` is the block-content boundary — it is called both at the top level
		// (from `withPaste`) and for a block's children (from each block plugin's `next`). Interior
		// whitespace has already been collapsed per text node, but a run assembled from
		// pretty-printed / indented source HTML still carries a leading/trailing space at the block
		// edge (e.g. `<p>\n\t\tSome text\n</p>` → `" Some text "`). Trim those edges so pasting does
		// not prepend or append a stray space, matching how a browser renders `white-space: normal`.
		if (result.texts !== undefined) {
			return trimBlockEdgeWhitespace(result.texts)
		}
		return result.elements
	}

	private deserializeTextNode(node: Node, cumulativeTextAttrs: TextAttrs): Descendant[] | null {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? ''
			return [{ ...cumulativeTextAttrs, text: text.replace(/[ \t]*(?:\r?\n[ \t]*)+/g, ' ') }]
		} else if (node instanceof HTMLElement) {
			const result = this.processInlinePaste(node, cumulativeTextAttrs)
			if (result !== null) {
				return Array.isArray(result) ? result : [result]
			}
		}

		return null
	}

	private processInlinePaste(element: HTMLElement, cumulativeTextAttrs: TextAttrs): (SlateElement | SlateText)[] | SlateElement | SlateText | null {
		if (ignoredElements.includes(element.tagName)) {
			return []
		}
		if (element.tagName === 'BR') {
			return { ...cumulativeTextAttrs, text: ' ' }
		}
		const next: HtmlDeserializerNextCallback = (list, cta) => {
			const attrs = this.processWithAttributeProcessor(element, cta)
			return this.deserializeInline(list, attrs)
		}
		for (const plugin of this.plugins) {
			const result = plugin.processInlinePaste?.({ element, next, cumulativeTextAttrs, deserializer: this }) ?? null
			if (result !== null) {
				return result
			}
		}
		return null
	}

	private processWithAttributeProcessor(element: Node, cumulativeTextAttrs: TextAttrs): TextAttrs {
		if (!(element instanceof HTMLElement)) {
			return {}
		}
		return this.plugins.reduce(
			(cta, plugin) => plugin.processAttributesPaste?.({ element, cumulativeTextAttrs, deserializer: this }) ?? cta,
			cumulativeTextAttrs,
		)
	}

	private processBlockPaste(element: HTMLElement, cumulativeTextAttrs: TextAttrs): SlateElement[] | SlateElement | null {
		if (ignoredElements.includes(element.tagName)) {
			return []
		}
		const next: HtmlDeserializerNextCallback = (list, cta) =>
			this.deserializeBlocks(Array.from(list), { ...cumulativeTextAttrs, ...cta })

		for (const plugin of this.plugins) {
			const result = plugin.processBlockPaste?.({ element, next, cumulativeTextAttrs, deserializer: this }) ?? null
			if (result !== null) {
				return result
			}
		}
		return null
	}
}

// Trims leading whitespace from the first text leaf and trailing whitespace from the last text leaf
// of a block's inline content, descending through inline wrappers (e.g. anchors) to reach the edge leaf.
const trimBlockEdgeWhitespace = (nodes: Descendant[]): Descendant[] => {
	const trimmedStart = mapEdgeTextLeaf(nodes, 'start', text => text.replace(/^\s+/, ''))
	return mapEdgeTextLeaf(trimmedStart, 'end', text => text.replace(/\s+$/, ''))
}

const mapEdgeTextLeaf = (nodes: Descendant[], edge: 'start' | 'end', map: (text: string) => string): Descendant[] => {
	const index = edge === 'start' ? 0 : nodes.length - 1
	const node = nodes[index]
	if (node === undefined) {
		return nodes
	}
	const mapped: Descendant = SlateText.isText(node)
		? { ...node, text: map(node.text) }
		: { ...node, children: mapEdgeTextLeaf(node.children, edge, map) }
	const copy = nodes.slice()
	copy[index] = mapped
	return copy
}
