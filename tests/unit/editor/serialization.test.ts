import { describe, expect, test } from 'bun:test'
import type { Editor } from 'slate'
import type { SerializableEditorNode } from '@contember/bindx-editor'

// Minimal mock editor for serialization tests (avoids Slate/React runtime)
const createMockEditor = (formatVersion = 1): Editor => {
	return {
		formatVersion,
		defaultElementType: 'paragraph',
		createDefaultElement: (children: any[]) => ({ type: 'paragraph', children }),
		upgradeFormatBySingleVersion: (node: any, _version: number) => node,
	} as unknown as Editor
}

// Import the pure functions directly
// We need to test these through the BindxEditor namespace since they depend on editor methods
describe('serialization', () => {
	test('serializeNodes produces SerializableEditorNode with formatVersion', async () => {
		const { serializeNodes } = await import('@contember/bindx-editor')
		const editor = createMockEditor()
		const nodes = [{ type: 'paragraph', children: [{ text: 'Hello world' }] }]

		const result = serializeNodes(editor, nodes as any)

		expect(result.formatVersion).toBe(1)
		expect(result.children).toHaveLength(1)
		expect(result.children[0]).toEqual({ type: 'paragraph', children: [{ text: 'Hello world' }] })
	})

	test('permissivelyDeserializeNodes accepts JSON object directly', async () => {
		const { permissivelyDeserializeNodes } = await import('@contember/bindx-editor')
		const editor = createMockEditor()
		const input: SerializableEditorNode = {
			formatVersion: 1,
			children: [{ type: 'paragraph', children: [{ text: 'Test' }] }] as any,
		}

		const result = permissivelyDeserializeNodes(editor, input)
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({ type: 'paragraph', children: [{ text: 'Test' }] })
	})

	test('permissivelyDeserializeNodes parses valid JSON string', async () => {
		const { permissivelyDeserializeNodes } = await import('@contember/bindx-editor')
		const editor = createMockEditor()
		const input = JSON.stringify({
			formatVersion: 1,
			children: [{ type: 'paragraph', children: [{ text: 'Test' }] }],
		})

		const result = permissivelyDeserializeNodes(editor, input)
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({ type: 'paragraph', children: [{ text: 'Test' }] })
	})

	test('permissivelyDeserializeNodes wraps plain text in default element', async () => {
		const { permissivelyDeserializeNodes } = await import('@contember/bindx-editor')
		const editor = createMockEditor()

		const result = permissivelyDeserializeNodes(editor, 'just some text')
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			type: 'paragraph',
			children: [{ text: 'just some text' }],
		})
	})

	test('permissivelyDeserializeNodes handles invalid JSON', async () => {
		const { permissivelyDeserializeNodes } = await import('@contember/bindx-editor')
		const editor = createMockEditor()

		const result = permissivelyDeserializeNodes(editor, '{invalid json')
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			type: 'paragraph',
			children: [{ text: '{invalid json' }],
		})
	})

	test('toLatestFormat passes through matching version', async () => {
		const { toLatestFormat } = await import('@contember/bindx-editor')
		const editor = createMockEditor(2)
		const node: SerializableEditorNode = {
			formatVersion: 2,
			children: [{ type: 'paragraph', children: [{ text: '' }] }] as any,
		}

		const result = toLatestFormat(editor, node)
		expect(result).toBe(node) // Same reference — no transformation needed
	})

	test('toLatestFormat upgrades older version', async () => {
		const { toLatestFormat } = await import('@contember/bindx-editor')
		const editor = createMockEditor(2)
		editor.upgradeFormatBySingleVersion = (node: any, _version: number) => ({
			...node,
			upgraded: true,
		})

		const node: SerializableEditorNode = {
			formatVersion: 1,
			children: [{ type: 'paragraph', children: [{ text: '' }] }] as any,
		}

		const result = toLatestFormat(editor, node)
		expect(result.formatVersion).toBe(2)
		expect((result.children[0] as any).upgraded).toBe(true)
	})

	test('toLatestFormat passes through newer version', async () => {
		const { toLatestFormat } = await import('@contember/bindx-editor')
		const editor = createMockEditor(1)
		const node: SerializableEditorNode = {
			formatVersion: 3,
			children: [{ type: 'paragraph', children: [{ text: '' }] }] as any,
		}

		const result = toLatestFormat(editor, node)
		expect(result).toBe(node) // Same reference — no downgrade
	})
})
