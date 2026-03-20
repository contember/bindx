import { type ReactNode } from 'react'
import { useEntity } from '@contember/bindx-react'
import { BlockRepeater } from '@contember/bindx-repeater'
import { InputField, DefaultBlockRepeater } from '@contember/bindx-ui'
import { schema } from '../../generated/schema.js'

/**
 * Headless BlockRepeater example — full control over rendering
 */
export function HeadlessBlockRepeaterExample({ id }: { id: string }): ReactNode {
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e.id().title().blocks(b => b.id().blockType().order().textContent().imageUrl()),
	)

	if (article.isLoading) return <p>Loading...</p>
	if (article.isError || article.isNotFound) return <p>Error loading article</p>

	return (
		<div>
			<h3 className="font-medium mb-2">Headless BlockRepeater</h3>
			<BlockRepeater
				field={article.blocks}
				discriminationField="blockType"
				sortableBy="order"
				blocks={{
					text: { label: 'Text' },
					image: { label: 'Image' },
				}}
			>
				{(items, methods) => (
					<div className="flex flex-col gap-2">
						{methods.isEmpty && (
							<p className="italic text-sm text-gray-500">No blocks yet. Add one below.</p>
						)}

						{items.map((block, info) => (
							<div key={block.id} className="border rounded p-3 relative group">
								<div className="flex items-center gap-2 mb-2">
									<span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
										{info.blockType}
									</span>
									<span className="text-xs text-gray-400">#{info.index}</span>
									<div className="ml-auto flex gap-1">
										<button
											className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
											disabled={info.isFirst}
											onClick={info.moveUp}
										>
											Up
										</button>
										<button
											className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
											disabled={info.isLast}
											onClick={info.moveDown}
										>
											Down
										</button>
										<button
											className="text-xs text-red-400 hover:text-red-600"
											onClick={info.remove}
										>
											Remove
										</button>
									</div>
								</div>

								{info.blockType === 'text' && (
									<InputField field={block.textContent} label="Content" />
								)}
								{info.blockType === 'image' && (
									<InputField field={block.imageUrl} label="Image URL" />
								)}
							</div>
						))}

						<div className="flex gap-2 mt-1">
							{methods.blockList.map(b => (
								<button
									key={b.name}
									className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
									onClick={() => methods.addItem(b.name)}
								>
									+ {b.label?.toString() ?? b.name}
								</button>
							))}
						</div>
					</div>
				)}
			</BlockRepeater>
		</div>
	)
}

/**
 * Styled DefaultBlockRepeater — inline mode (no form, DnD enabled)
 */
export function StyledBlockRepeaterExample({ id }: { id: string }): ReactNode {
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e.id().title().blocks(b => b.id().blockType().order().textContent().imageUrl()),
	)

	if (article.isLoading) return <p>Loading...</p>
	if (article.isError || article.isNotFound) return <p>Error loading article</p>

	return (
		<div>
			<h3 className="font-medium mb-2">Inline mode (DnD + inline editing)</h3>
			<DefaultBlockRepeater
				field={article.blocks}
				discriminationField="blockType"
				sortableBy="order"
				blocks={{
					text: {
						label: 'Text',
						render: (block) => (
							<InputField field={block.textContent} label="Text content" />
						),
					},
					image: {
						label: 'Image',
						render: (block) => (
							<InputField field={block.imageUrl} label="Image URL" />
						),
					},
				}}
			/>
		</div>
	)
}

/**
 * Styled DefaultBlockRepeater — dual mode (render preview + form in sheet)
 */
export function DualModeBlockRepeaterExample({ id }: { id: string }): ReactNode {
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e.id().title().blocks(b => b.id().blockType().order().textContent().imageUrl()),
	)

	if (article.isLoading) return <p>Loading...</p>
	if (article.isError || article.isNotFound) return <p>Error loading article</p>

	return (
		<div>
			<h3 className="font-medium mb-2">Dual mode (preview + sheet edit)</h3>
			<p className="text-sm text-gray-500 mb-2">Click a block to edit in a side sheet. Drag the handle to reorder.</p>
			<DefaultBlockRepeater
				field={article.blocks}
				discriminationField="blockType"
				sortableBy="order"
				blocks={{
					text: {
						label: 'Text',
						render: (block) => (
							<div className="py-1">
								<p className="text-sm text-gray-600">
									{block.textContent.value || <span className="italic text-gray-400">Empty text block</span>}
								</p>
							</div>
						),
						form: (block) => (
							<InputField field={block.textContent} label="Text content" />
						),
					},
					image: {
						label: 'Image',
						render: (block) => (
							<div className="py-1">
								{block.imageUrl.value ? (
									<p className="text-sm text-blue-600 underline">{block.imageUrl.value}</p>
								) : (
									<p className="text-sm italic text-gray-400">No image URL</p>
								)}
							</div>
						),
						form: (block) => (
							<InputField field={block.imageUrl} label="Image URL" />
						),
					},
				}}
			/>
		</div>
	)
}
