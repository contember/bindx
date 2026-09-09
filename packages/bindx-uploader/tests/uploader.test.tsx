import './setup'
import { describe, test, expect, afterEach, mock } from 'bun:test'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	hasMany,
	hasOne,
	scalar,
	useEntity,
} from '@contember/bindx-react'
import {
	MultiUploader,
	Uploader,
	UploaderClientContext,
	UploaderError,
	getFileUrlDataExtractor,
	useUploaderUploadFiles,
	type ErrorEvent,
	type FileType,
	type UploadClient,
} from '../src/index.js'

afterEach(() => {
	cleanup()
})

type Image = {
	id: string
	url: string | null
}

type Asset = {
	id: string
	title: string
	image: Image | null
}

type Block = {
	id: string
	asset: Asset | null
	gallery: Image[]
}

interface MediaSchema {
	Block: Block
	Asset: Asset
	Image: Image
}

const mediaSchema = defineSchema<MediaSchema>({
	entities: {
		Block: {
			fields: {
				id: scalar(),
				asset: hasOne('Asset', { nullable: true }),
				gallery: hasMany('Image'),
			},
		},
		Asset: {
			fields: {
				id: scalar(),
				title: scalar(),
				image: hasOne('Image', { nullable: true }),
			},
		},
		Image: {
			fields: {
				id: scalar(),
				url: scalar(),
			},
		},
	},
})

const entityDefs = {
	Block: entityDef<Block>('Block'),
	Asset: entityDef<Asset>('Asset'),
	Image: entityDef<Image>('Image'),
} as const

const ORIGINAL_URL = 'https://cdn.test/original.jpg'
const UPLOADED_URL = 'https://cdn.test/uploaded.jpg'

const createMediaData = (): Record<string, Record<string, unknown>> => ({
	Block: {
		'block-1': {
			id: 'block-1',
			asset: {
				id: 'asset-1',
				title: 'Shared asset',
				image: { id: 'image-1', url: ORIGINAL_URL },
			},
			gallery: [],
		},
	},
	Asset: {
		'asset-1': {
			id: 'asset-1',
			title: 'Shared asset',
			image: { id: 'image-1', url: ORIGINAL_URL },
		},
	},
	Image: {
		'image-1': { id: 'image-1', url: ORIGINAL_URL },
	},
})

const imageFileType: FileType<Image> = {
	extractors: [getFileUrlDataExtractor<Image>({ urlField: 'url' })],
}

const jpegOnlyFileType: FileType<Image> = {
	accept: { 'image/jpeg': ['.jpg'] },
	extractors: [getFileUrlDataExtractor<Image>({ urlField: 'url' })],
}

const uploadClient: UploadClient = {
	upload: async () => ({ publicUrl: UPLOADED_URL }),
}

const createTestFile = (): File => new File(['binary'], 'photo.jpg', { type: 'image/jpeg' })

const createTextFile = (): File => new File(['text'], 'notes.txt', { type: 'text/plain' })

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function UploadTrigger({ files }: { files: File[] }): ReactNode {
	const uploadFiles = useUploaderUploadFiles()
	return (
		<button data-testid="upload" onClick={() => uploadFiles(files)}>
			upload
		</button>
	)
}

/** Observes the shared asset through its own subscription, independently of the block. */
function SharedAssetProbe(): ReactNode {
	const asset = useEntity(entityDefs.Asset, { by: { id: 'asset-1' } }, e => e.id().title().image(i => i.id().url()))

	if (asset.$isLoading || asset.$isError || asset.$isNotFound) {
		return null
	}

	return (
		<>
			<span data-testid="shared-image-url">{asset.image.url.value ?? ''}</span>
			<span data-testid="shared-image-id">{asset.image.$id}</span>
		</>
	)
}

interface ForkingUploaderProps {
	fileType: FileType<Image>
	files: File[]
	onPrepare: () => void
	onError?: (event: ErrorEvent) => void
}

/** Forks the shared asset in prepareTarget, so the upload must land on the fresh one. */
function ForkingUploader({ fileType, files, onPrepare, onError }: ForkingUploaderProps): ReactNode {
	const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
		e.id().asset(a => a.id().title().image(i => i.id().url())),
	)

	if (block.$isLoading || block.$isError || block.$isNotFound) {
		return null
	}

	return (
		<>
			<Uploader
				entity={block.asset.image}
				fileType={fileType}
				onError={onError}
				prepareTarget={() => {
					onPrepare()
					block.asset.$disconnect()
					block.asset.$create({ title: 'Forked asset' })
					return block.asset.image
				}}
			>
				<UploadTrigger files={files} />
			</Uploader>
			<span data-testid="block-image-url">{block.asset.image.url.value ?? ''}</span>
			<span data-testid="block-image-id">{block.asset.image.$id}</span>
			<span data-testid="block-asset-id">{block.asset.$id}</span>
		</>
	)
}

const uploadFile = async (container: Element): Promise<void> => {
	await act(async () => {
		fireEvent.click(getByTestId(container, 'upload'))
	})
}

const renderMedia = async (children: ReactNode): Promise<{ container: Element }> => {
	const adapter = new MockAdapter(createMediaData(), { delay: 0 })
	const { container } = render(
		<BindxProvider adapter={adapter} schema={mediaSchema}>
			<UploaderClientContext.Provider value={uploadClient}>{children}</UploaderClientContext.Provider>
		</BindxProvider>,
	)

	await waitFor(() => {
		expect(container.querySelector('[data-testid="upload"]')).not.toBeNull()
	})

	return { container }
}

describe('Uploader events', () => {
	test('a user onBeforeUpload can reject a file, and onError receives the rejection', async () => {
		const onBeforeUpload = mock(async ({ reject }: { reject: (reason: string) => never }) => reject('file too large'))
		const errors: ErrorEvent[] = []

		function TestApp(): ReactNode {
			const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
				e.id().asset(a => a.id().title().image(i => i.id().url())),
			)

			if (block.$isLoading || block.$isError || block.$isNotFound) {
				return null
			}

			return (
				<>
					<Uploader
						entity={block.asset.image}
						fileType={imageFileType}
						onBeforeUpload={onBeforeUpload}
						onError={event => errors.push(event)}
					>
						<UploadTrigger files={[createTestFile()]} />
					</Uploader>
					<span data-testid="block-image-url">{block.asset.image.url.value ?? ''}</span>
				</>
			)
		}

		const { container } = await renderMedia(<TestApp />)
		await uploadFile(container)

		expect(onBeforeUpload).toHaveBeenCalledTimes(1)
		expect(errors).toHaveLength(1)
		expect(errors[0]?.error).toBeInstanceOf(UploaderError)
		expect(getByTestId(container, 'block-image-url').textContent).toBe(ORIGINAL_URL)
	})

	test('user handlers compose with the internal fill instead of replacing it', async () => {
		const calls: string[] = []

		function TestApp(): ReactNode {
			const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
				e.id().asset(a => a.id().title().image(i => i.id().url())),
			)

			if (block.$isLoading || block.$isError || block.$isNotFound) {
				return null
			}

			return (
				<>
					<Uploader
						entity={block.asset.image}
						fileType={imageFileType}
						onBeforeUpload={async () => {
							calls.push('before')
							return undefined
						}}
						onStartUpload={() => calls.push('start')}
						onAfterUpload={() => {
							calls.push('after')
						}}
						onSuccess={() => calls.push('success')}
					>
						<UploadTrigger files={[createTestFile()]} />
					</Uploader>
					<span data-testid="block-image-url">{block.asset.image.url.value ?? ''}</span>
				</>
			)
		}

		const { container } = await renderMedia(<TestApp />)
		await uploadFile(container)

		await waitFor(() => {
			expect(getByTestId(container, 'block-image-url').textContent).toBe(UPLOADED_URL)
		})
		expect(calls).toEqual(['before', 'start', 'after', 'success'])
	})

	test('without event props the upload still fills the passed target', async () => {
		function TestApp(): ReactNode {
			const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
				e.id().asset(a => a.id().title().image(i => i.id().url())),
			)

			if (block.$isLoading || block.$isError || block.$isNotFound) {
				return null
			}

			return (
				<>
					<Uploader entity={block.asset.image} fileType={imageFileType}>
						<UploadTrigger files={[createTestFile()]} />
					</Uploader>
					<span data-testid="block-image-url">{block.asset.image.url.value ?? ''}</span>
					<span data-testid="block-asset-id">{block.asset.$id}</span>
				</>
			)
		}

		const { container } = await renderMedia(<TestApp />)
		await uploadFile(container)

		await waitFor(() => {
			expect(getByTestId(container, 'block-image-url').textContent).toBe(UPLOADED_URL)
		})
		expect(getByTestId(container, 'block-asset-id').textContent).toBe('asset-1')
	})
})

describe('Uploader prepareTarget', () => {
	test('fills the target returned by prepareTarget and leaves the original untouched', async () => {
		function TestApp(): ReactNode {
			const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
				e.id().asset(a => a.id().title().image(i => i.id().url())),
			)

			if (block.$isLoading || block.$isError || block.$isNotFound) {
				return null
			}

			return (
				<>
					<Uploader
						entity={block.asset.image}
						fileType={imageFileType}
						prepareTarget={() => {
							block.asset.$disconnect()
							block.asset.$create({ title: 'Forked asset' })
							return block.asset.image
						}}
					>
						<UploadTrigger files={[createTestFile()]} />
					</Uploader>
					<span data-testid="block-image-url">{block.asset.image.url.value ?? ''}</span>
					<span data-testid="block-asset-id">{block.asset.$id}</span>
					<span data-testid="block-asset-title">{block.asset.title.value ?? ''}</span>
				</>
			)
		}

		const { container } = await renderMedia(
			<>
				<TestApp />
				<SharedAssetProbe />
			</>,
		)
		await uploadFile(container)

		await waitFor(() => {
			expect(getByTestId(container, 'block-image-url').textContent).toBe(UPLOADED_URL)
		})
		expect(getByTestId(container, 'block-asset-title').textContent).toBe('Forked asset')
		expect(getByTestId(container, 'block-asset-id').textContent).not.toBe('asset-1')

		expect(getByTestId(container, 'shared-image-url').textContent).toBe(ORIGINAL_URL)
		expect(getByTestId(container, 'shared-image-id').textContent).toBe('image-1')
	})

	test('prepareTarget runs after the accept check and before the target is written', async () => {
		const order: string[] = []

		function TestApp(): ReactNode {
			const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
				e.id().asset(a => a.id().title().image(i => i.id().url())),
			)

			if (block.$isLoading || block.$isError || block.$isNotFound) {
				return null
			}

			return (
				<>
					<Uploader
						entity={block.asset.image}
						fileType={imageFileType}
						prepareTarget={async () => {
							await Promise.resolve()
							order.push('prepare')
							return undefined
						}}
						onBeforeUpload={async () => {
							order.push('before')
							return undefined
						}}
						onStartUpload={() => order.push('start')}
					>
						<UploadTrigger files={[createTestFile()]} />
					</Uploader>
					<span data-testid="block-image-url">{block.asset.image.url.value ?? ''}</span>
				</>
			)
		}

		const { container } = await renderMedia(<TestApp />)
		await uploadFile(container)

		await waitFor(() => {
			expect(getByTestId(container, 'block-image-url').textContent).toBe(UPLOADED_URL)
		})
		expect(order).toEqual(['before', 'prepare', 'start'])
	})

	test('a batch rejected by the accept check never forks the target', async () => {
		const onPrepare = mock(() => {})
		const errors: ErrorEvent[] = []

		const { container } = await renderMedia(
			<>
				<ForkingUploader
					fileType={jpegOnlyFileType}
					files={[createTextFile()]}
					onPrepare={onPrepare}
					onError={event => errors.push(event)}
				/>
				<SharedAssetProbe />
			</>,
		)
		await uploadFile(container)

		expect(errors).toHaveLength(1)
		expect(errors[0]?.error).toBeInstanceOf(UploaderError)
		expect(onPrepare).toHaveBeenCalledTimes(0)
		expect(getByTestId(container, 'block-asset-id').textContent).toBe('asset-1')
		expect(getByTestId(container, 'block-image-id').textContent).toBe('image-1')
		expect(getByTestId(container, 'block-image-url').textContent).toBe(ORIGINAL_URL)
		expect(getByTestId(container, 'shared-image-url').textContent).toBe(ORIGINAL_URL)
	})

	test('a mixed batch forks once and lands the accepted file on the prepared target', async () => {
		const onPrepare = mock(() => {})
		const errors: ErrorEvent[] = []

		const { container } = await renderMedia(
			<>
				<ForkingUploader
					fileType={jpegOnlyFileType}
					files={[createTestFile(), createTextFile()]}
					onPrepare={onPrepare}
					onError={event => errors.push(event)}
				/>
				<SharedAssetProbe />
			</>,
		)
		await uploadFile(container)

		await waitFor(() => {
			expect(getByTestId(container, 'block-image-url').textContent).toBe(UPLOADED_URL)
		})
		expect(errors).toHaveLength(1)
		expect(onPrepare).toHaveBeenCalledTimes(1)
		expect(getByTestId(container, 'block-asset-id').textContent).not.toBe('asset-1')
		expect(getByTestId(container, 'shared-image-url').textContent).toBe(ORIGINAL_URL)
		expect(getByTestId(container, 'shared-image-id').textContent).toBe('image-1')
	})
})

describe('MultiUploader events', () => {
	test('forwards user handlers while still creating and filling an item', async () => {
		const calls: string[] = []

		function TestApp(): ReactNode {
			const block = useEntity(entityDefs.Block, { by: { id: 'block-1' } }, e =>
				e.id().gallery(g => g.id().url()),
			)

			if (block.$isLoading || block.$isError || block.$isNotFound) {
				return null
			}

			return (
				<>
					<MultiUploader
						field={block.gallery}
						fileType={imageFileType}
						onStartUpload={() => calls.push('start')}
						onAfterUpload={() => {
							calls.push('after')
						}}
						onSuccess={() => calls.push('success')}
					>
						<UploadTrigger files={[createTestFile()]} />
					</MultiUploader>
					<span data-testid="gallery-urls">{block.gallery.items.map(it => it.url.value ?? '').join(',')}</span>
				</>
			)
		}

		const { container } = await renderMedia(<TestApp />)
		await uploadFile(container)

		await waitFor(() => {
			expect(getByTestId(container, 'gallery-urls').textContent).toBe(UPLOADED_URL)
		})
		expect(calls).toEqual(['start', 'after', 'success'])
	})
})
