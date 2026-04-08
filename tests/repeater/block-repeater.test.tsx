import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	hasMany,
	useEntity,
} from '@contember/bindx-react'
import { BlockRepeater } from '@contember/bindx-repeater'

afterEach(() => {
	cleanup()
})

interface Block {
	id: string
	type: string
	content: string
	order: number
}

interface Page {
	id: string
	title: string
	blocks: Block[]
}

interface TestSchema {
	Page: Page
	Block: Block
}

const schema = defineSchema<TestSchema>({
	entities: {
		Page: {
			fields: {
				id: scalar(),
				title: scalar(),
				blocks: hasMany('Block'),
			},
		},
		Block: {
			fields: {
				id: scalar(),
				type: scalar(),
				content: scalar(),
				order: scalar(),
			},
		},
	},
})

const pageDef = entityDef<Page>('Page')

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function createMockData() {
	return {
		Page: {
			'page-1': {
				id: 'page-1',
				title: 'Test Page',
				blocks: [
					{ id: 'block-1', type: 'text', content: 'Hello', order: 0 },
					{ id: 'block-2', type: 'image', content: 'photo.jpg', order: 1 },
					{ id: 'block-3', type: 'text', content: 'World', order: 2 },
				],
			},
			'page-empty': {
				id: 'page-empty',
				title: 'Empty Page',
				blocks: [],
			},
		},
		Block: {
			'block-1': { id: 'block-1', type: 'text', content: 'Hello', order: 0 },
			'block-2': { id: 'block-2', type: 'image', content: 'photo.jpg', order: 1 },
			'block-3': { id: 'block-3', type: 'text', content: 'World', order: 2 },
		},
	}
}

describe('BlockRepeater', () => {
	test('renders items and passes correct blockType in info', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-1' } }, e =>
				e.id().title().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					sortableBy="order"
					blocks={{
						text: { label: 'Text Block' },
						image: { label: 'Image Block' },
					}}
				>
					{(items) => (
						<>
							{items.map((block, info) => (
								<div key={block.id} data-testid={`block-${block.id}`}>
									<span data-testid={`type-${block.id}`}>{info.blockType}</span>
									<span data-testid={`label-${block.id}`}>{info.block?.label?.toString() ?? 'none'}</span>
									<span data-testid={`content-${block.id}`}>{block.content.value}</span>
								</div>
							))}
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'block-block-1')).not.toBeNull()
		})

		expect(getByTestId(container, 'type-block-1').textContent).toBe('text')
		expect(getByTestId(container, 'type-block-2').textContent).toBe('image')
		expect(getByTestId(container, 'type-block-3').textContent).toBe('text')

		expect(getByTestId(container, 'label-block-1').textContent).toBe('Text Block')
		expect(getByTestId(container, 'label-block-2').textContent).toBe('Image Block')

		expect(getByTestId(container, 'content-block-1').textContent).toBe('Hello')
		expect(getByTestId(container, 'content-block-2').textContent).toBe('photo.jpg')
		expect(getByTestId(container, 'content-block-3').textContent).toBe('World')
	})

	test('addItem creates item with discrimination field set', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-1' } }, e =>
				e.id().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					sortableBy="order"
					blocks={{
						text: { label: 'Text' },
						image: { label: 'Image' },
					}}
				>
					{(items, methods) => (
						<>
							<span data-testid="count">{items.length}</span>
							{items.map((block, info) => (
								<div key={block.id} data-testid={`block-${block.id}`}>
									<span data-testid={`type-${block.id}`}>{info.blockType}</span>
								</div>
							))}
							<button data-testid="add-text" onClick={() => methods.addItem('text')}>Add Text</button>
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'count')).not.toBeNull()
		})

		expect(getByTestId(container, 'count').textContent).toBe('3')

		act(() => {
			;(getByTestId(container, 'add-text') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'count').textContent).toBe('4')

		// The new item should have type 'text'
		const typeElements = container.querySelectorAll('[data-testid^="type-"]')
		const lastType = typeElements[typeElements.length - 1]
		expect(lastType?.textContent).toBe('text')
	})

	test('adding different types sets correct values', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-empty' } }, e =>
				e.id().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					blocks={{
						text: { label: 'Text' },
						image: { label: 'Image' },
					}}
				>
					{(items, methods) => (
						<>
							<span data-testid="count">{items.length}</span>
							{items.map((block, info) => (
								<div key={block.id} data-testid={`block-${info.index}`}>
									<span data-testid={`type-${info.index}`}>{info.blockType}</span>
								</div>
							))}
							<button data-testid="add-text" onClick={() => methods.addItem('text')}>Add Text</button>
							<button data-testid="add-image" onClick={() => methods.addItem('image')}>Add Image</button>
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'count')).not.toBeNull()
		})

		expect(getByTestId(container, 'count').textContent).toBe('0')

		act(() => {
			;(getByTestId(container, 'add-text') as HTMLButtonElement).click()
		})

		act(() => {
			;(getByTestId(container, 'add-image') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'count').textContent).toBe('2')
		expect(getByTestId(container, 'type-0').textContent).toBe('text')
		expect(getByTestId(container, 'type-1').textContent).toBe('image')
	})

	test('remove works', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-1' } }, e =>
				e.id().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					sortableBy="order"
					blocks={{
						text: { label: 'Text' },
						image: { label: 'Image' },
					}}
				>
					{(items) => (
						<>
							<span data-testid="count">{items.length}</span>
							{items.map((block, info) => (
								<div key={block.id}>
									<span data-testid={`content-${block.id}`}>{block.content.value}</span>
									<button data-testid={`remove-${block.id}`} onClick={info.remove}>Remove</button>
								</div>
							))}
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'count')).not.toBeNull()
		})

		expect(getByTestId(container, 'count').textContent).toBe('3')

		act(() => {
			;(getByTestId(container, 'remove-block-2') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'count').textContent).toBe('2')
		expect(queryByTestId(container, 'content-block-2')).toBeNull()
	})

	test('blockList contains all defined blocks', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-1' } }, e =>
				e.id().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					blocks={{
						text: { label: 'Text Block' },
						image: { label: 'Image Block' },
						video: { label: 'Video Block' },
					}}
				>
					{(_items, methods) => (
						<>
							<span data-testid="block-count">{methods.blockList.length}</span>
							{methods.blockList.map(b => (
								<div key={b.name} data-testid={`blocklist-${b.name}`}>
									<span data-testid={`blocklist-label-${b.name}`}>{b.label?.toString()}</span>
								</div>
							))}
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'block-count')).not.toBeNull()
		})

		expect(getByTestId(container, 'block-count').textContent).toBe('3')
		expect(queryByTestId(container, 'blocklist-text')).not.toBeNull()
		expect(queryByTestId(container, 'blocklist-image')).not.toBeNull()
		expect(queryByTestId(container, 'blocklist-video')).not.toBeNull()

		expect(getByTestId(container, 'blocklist-label-text').textContent).toBe('Text Block')
		expect(getByTestId(container, 'blocklist-label-image').textContent).toBe('Image Block')
		expect(getByTestId(container, 'blocklist-label-video').textContent).toBe('Video Block')
	})

	test('unknown block type results in info.block being undefined', async () => {
		const adapter = new MockAdapter({
			Page: {
				'page-1': {
					id: 'page-1',
					title: 'Test',
					blocks: [
						{ id: 'block-1', type: 'unknown_type', content: 'Mystery', order: 0 },
					],
				},
			},
			Block: {
				'block-1': { id: 'block-1', type: 'unknown_type', content: 'Mystery', order: 0 },
			},
		}, { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-1' } }, e =>
				e.id().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					blocks={{
						text: { label: 'Text' },
						image: { label: 'Image' },
					}}
				>
					{(items) => (
						<>
							{items.map((block, info) => (
								<div key={block.id} data-testid="block">
									<span data-testid="block-type">{info.blockType}</span>
									<span data-testid="has-block">{info.block !== undefined ? 'yes' : 'no'}</span>
								</div>
							))}
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'block')).not.toBeNull()
		})

		expect(getByTestId(container, 'block-type').textContent).toBe('unknown_type')
		expect(getByTestId(container, 'has-block').textContent).toBe('no')
	})

	test('sorting with sortableBy works', async () => {
		const adapter = new MockAdapter({
			Page: {
				'page-1': {
					id: 'page-1',
					title: 'Test',
					blocks: [
						{ id: 'block-3', type: 'text', content: 'Third', order: 2 },
						{ id: 'block-1', type: 'text', content: 'First', order: 0 },
						{ id: 'block-2', type: 'image', content: 'Second', order: 1 },
					],
				},
			},
			Block: {},
		}, { delay: 0 })

		function TestComponent() {
			const page = useEntity(pageDef, { by: { id: 'page-1' } }, e =>
				e.id().blocks(b => b.id().type().content().order()),
			)

			if (page.$isLoading) return <div data-testid="loading">Loading</div>
			if (page.$isError || page.$isNotFound) return <div>Error</div>

			return (
				<BlockRepeater
					field={page.blocks}
					discriminationField="type"
					sortableBy="order"
					blocks={{
						text: { label: 'Text' },
						image: { label: 'Image' },
					}}
				>
					{(items) => (
						<>
							{items.map((block, info) => (
								<div key={block.id} data-testid={`item-${info.index}`}>
									<span>{block.content.value}</span>
								</div>
							))}
						</>
					)}
				</BlockRepeater>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'item-0')).not.toBeNull()
		})

		expect(getByTestId(container, 'item-0').textContent).toBe('First')
		expect(getByTestId(container, 'item-1').textContent).toBe('Second')
		expect(getByTestId(container, 'item-2').textContent).toBe('Third')
	})

	test('selection collection includes discrimination field', async () => {
		const { BlockRepeater: BlockRepeaterWithMeta } = await import('@contember/bindx-repeater')
		const { SelectionScope } = await import('@contember/bindx')
		const { createCollectorProxy } = await import('@contember/bindx-react')

		const scope = new SelectionScope()
		const proxy = createCollectorProxy<Page>(scope)

		const getSelection = (BlockRepeaterWithMeta as any).getSelection as (
			props: any,
			collectNested: (children: any) => any,
		) => any

		const result = getSelection(
			{
				field: proxy.blocks,
				discriminationField: 'type',
				blocks: {
					text: { label: 'Text' },
					image: { label: 'Image' },
				},
				children: (items: any) => {
					items.map((block: any) => {
						// Access content field to track it
						void block.content
						return null
					})
					return null
				},
			},
			() => ({ fields: new Map() }),
		)

		// When field is a collector proxy (has SCOPE_REF), getSelection merges into scope and returns null
		expect(result).toBeNull()

		// The discrimination field and accessed fields should be in the scope tree
		const selection = scope.toSelectionMeta()
		const blocksField = selection.fields.get('blocks')
		expect(blocksField).toBeDefined()
		expect(blocksField!.isRelation).toBe(true)

		const typeField = blocksField!.nested!.fields.get('type')
		expect(typeField).toBeDefined()
		expect(typeField!.fieldName).toBe('type')
		expect(typeField!.isRelation).toBe(false)

		// Content field should also be in the selection
		const contentField = blocksField!.nested!.fields.get('content')
		expect(contentField).toBeDefined()
	})

	test('selection collection discovers render/form functions on blocks', async () => {
		const { BlockRepeater: BR } = await import('@contember/bindx-repeater')
		const { SelectionScope } = await import('@contember/bindx')
		const { createCollectorProxy, collectSelection } = await import('@contember/bindx-react')

		const scope = new SelectionScope()
		const proxy = createCollectorProxy<Page>(scope)

		const getSelection = (BR as any).getSelection as (
			props: any,
			collectNested: (children: any) => any,
		) => any

		const result = getSelection(
			{
				field: proxy.blocks,
				discriminationField: 'type',
				blocks: {
					text: {
						label: 'Text',
						render: (entity: any) => {
							void entity.content
							return null
						},
					},
					image: {
						label: 'Image',
						render: (entity: any) => {
							void entity.imageUrl
							return null
						},
						form: (entity: any) => {
							void entity.imageCaption
							return null
						},
					},
				},
				// No children — blocks have render/form functions
			},
			(jsx: any) => collectSelection(jsx),
		)

		expect(result).toBeNull()

		const selection = scope.toSelectionMeta()
		const blocksField = selection.fields.get('blocks')
		expect(blocksField).toBeDefined()

		// Fields from render functions should be collected
		expect(blocksField!.nested!.fields.has('content')).toBe(true)
		expect(blocksField!.nested!.fields.has('imageUrl')).toBe(true)
		expect(blocksField!.nested!.fields.has('imageCaption')).toBe(true)

		// Discrimination field should be added
		expect(blocksField!.nested!.fields.has('type')).toBe(true)
	})
})
