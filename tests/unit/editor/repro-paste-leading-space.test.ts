// Regression test for https://github.com/contember/bindx/issues/60
import { describe, expect, test } from 'bun:test'
import { HtmlDeserializer } from '@contember/bindx-editor'
import type { Descendant } from 'slate'

// The paste pipeline (withPaste) builds an HtmlDeserializer with a default-element
// factory and no extra plugins, then feeds it the parsed clipboard HTML via
// `deserializeBlocks`. We exercise that same path directly.
const createDeserializer = () =>
	new HtmlDeserializer((children: Descendant[]) => ({ type: 'paragraph', children }) as any, [])

const deserializeHtml = (html: string): Descendant[] => {
	const doc = new DOMParser().parseFromString(html, 'text/html')
	return createDeserializer().deserializeBlocks(Array.from(doc.body.childNodes), {})
}

// Collect every text leaf's string, in document order.
const gatherText = (nodes: Descendant[]): string =>
	nodes
		.map(node => ('text' in node ? (node.text as string) : gatherText((node as any).children ?? [])))
		.join('')

describe('HtmlDeserializer paste whitespace', () => {
	test('should not prepend a leading space when pasting indented block HTML', () => {
		// Copying from any pretty-printed / indented HTML source yields text nodes
		// like "\n\t\tSome text\n". The deserializer collapses the leading newline +
		// indentation, but must not leave it as a stray leading space at the block edge.
		const result = deserializeHtml('<p>\n\t\tSome text\n</p>')
		const text = gatherText(result)

		expect(text.startsWith(' ')).toBe(false)
		expect(text.endsWith(' ')).toBe(false)
		expect(text).toBe('Some text')
	})

	test('should still collapse internal whitespace runs to a single space', () => {
		// Trimming block edges must not break the CSS `white-space: normal` collapsing
		// of interior whitespace between words.
		const result = deserializeHtml('<p>\n\tfoo\n\t\tbar\n</p>')
		expect(gatherText(result)).toBe('foo bar')
	})
})
