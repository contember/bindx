import type { ReactNode } from 'react'
import { Entity } from '@contember/bindx-react'
import { BlockRepeater } from '@contember/bindx-repeater'
import { Uploader, createImageFileType } from '@contember/bindx-uploader'
import {
	InputField,
	BlockRepeater as StyledBlockRepeater,
	UploaderDropzone,
	UploaderProgress,
	UploadedImageView,
} from '@contember/bindx-ui'
import { schema } from '../generated/schema.js'

const imageFileType = createImageFileType<{ imageUrl: string | null }>({
	urlField: 'imageUrl',
})

/**
 * Headless BlockRepeater — full control over rendering.
 * Uses Entity JSX for data binding.
 */
export function HeadlessBlockRepeaterPage({ id }: { id: string }): ReactNode {
	return (
		<Entity
			entity={schema.Article}
			by={{ id }}
			loading={<p>Loading...</p>}
			notFound={<p>Article not found</p>}
		>
			{article => (
				<div data-testid="headless-block-repeater">
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
									<div key={block.id} className="border rounded p-3 relative group" data-testid={`block-item-${info.blockType}`}>
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
												data-testid="move-up"
												>Up</button>
												<button
													className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
													disabled={info.isLast}
													onClick={info.moveDown}
												data-testid="move-down"
												>Down</button>
												<button
													className="text-xs text-red-400 hover:text-red-600"
													onClick={info.remove}
												data-testid="remove-block"
												>Remove</button>
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
										data-testid={`add-block-${b.name}`}
										>
											+ {b.label?.toString() ?? b.name}
										</button>
									))}
								</div>
							</div>
						)}
					</BlockRepeater>
				</div>
			)}
		</Entity>
	)
}

/**
 * Styled BlockRepeater — inline mode (DnD enabled).
 * Uses Entity JSX for data binding.
 */
export function StyledBlockRepeaterPage({ id }: { id: string }): ReactNode {
	return (
		<Entity
			entity={schema.Article}
			by={{ id }}
			loading={<p>Loading...</p>}
			notFound={<p>Article not found</p>}
		>
			{article => (
				<div>
					<h3 className="font-medium mb-2">Inline mode (DnD + inline editing)</h3>
					<StyledBlockRepeater
						field={article.blocks}
						discriminationField="blockType"
						sortableBy="order"
						blocks={{
							text: {
								label: 'Text',
								render: block => (
									<InputField field={block.textContent} label="Text content" />
								),
							},
							image: {
								label: 'Image',
								render: block => (
									<Uploader entity={block} fileType={imageFileType}>
										<div className="flex flex-col gap-3">
											{block.imageUrl.value
												? <UploadedImageView url={block.imageUrl.value} onRemove={() => block.imageUrl.setValue(null)} />
												: <UploaderDropzone />
											}
											<UploaderProgress />
										</div>
									</Uploader>
								),
							},
						}}
					/>
				</div>
			)}
		</Entity>
	)
}

/**
 * Styled BlockRepeater — dual mode (preview + sheet edit).
 * Uses Entity JSX for data binding.
 */
export function DualModeBlockRepeaterPage({ id }: { id: string }): ReactNode {
	return (
		<Entity
			entity={schema.Article}
			by={{ id }}
			loading={<p>Loading...</p>}
			notFound={<p>Article not found</p>}
		>
			{article => (
				<div>
					<h3 className="font-medium mb-2">Dual mode (preview + sheet edit)</h3>
					<p className="text-sm text-gray-500 mb-2">Click a block to edit in a side sheet. Drag the handle to reorder.</p>
					<StyledBlockRepeater
						field={article.blocks}
						discriminationField="blockType"
						sortableBy="order"
						blocks={{
							text: {
								label: 'Text',
								render: block => (
									<div className="py-1">
										<p className="text-sm text-gray-600">
											{block.textContent.value || <span className="italic text-gray-400">Empty text block</span>}
										</p>
									</div>
								),
								form: block => (
									<InputField field={block.textContent} label="Text content" />
								),
							},
							image: {
								label: 'Image',
								render: block => (
									<div className="py-1">
										{block.imageUrl.value ? (
											<img src={block.imageUrl.value} alt="Block image" className="max-h-24 rounded object-contain" />
										) : (
											<p className="text-sm italic text-gray-400">No image</p>
										)}
									</div>
								),
								form: block => (
									<Uploader entity={block} fileType={imageFileType}>
										<div className="flex flex-col gap-3">
											{block.imageUrl.value
												? <UploadedImageView url={block.imageUrl.value} onRemove={() => block.imageUrl.setValue(null)} />
												: <UploaderDropzone />
											}
											<UploaderProgress />
										</div>
									</Uploader>
								),
							},
						}}
					/>
				</div>
			)}
		</Entity>
	)
}

/**
 * Combined block repeater page showing all variants.
 */
export function BlockRepeaterPage({ id }: { id: string }): ReactNode {
	return (
		<>
			<HeadlessBlockRepeaterPage id={id} />
			<hr className="my-4" />
			<StyledBlockRepeaterPage id={id} />
			<hr className="my-4" />
			<DualModeBlockRepeaterPage id={id} />
		</>
	)
}
