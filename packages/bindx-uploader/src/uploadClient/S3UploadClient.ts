import type { UploadClient, UploadClientUploadArgs } from '../types.js'
import type { S3FileParameters, S3SignedUrlResponse, S3UrlSigner } from './types.js'
import { UploaderError } from '../UploaderError.js'

export interface S3UploadClientOptions {
	signUrl: S3UrlSigner
	getUploadOptions?: (file: File) => Partial<S3FileParameters>
	concurrency?: number
}

export type S3FileOptions = Partial<S3FileParameters>

export class S3UploadClient implements UploadClient<S3FileOptions> {
	private activeCount = 0
	private resolverQueue: Array<() => void> = []

	public constructor(public readonly options: S3UploadClientOptions) {}

	public async upload({
		file,
		signal,
		onProgress,
		...options
	}: UploadClientUploadArgs & S3FileOptions): Promise<{ publicUrl: string }> {
		const parameters: S3FileParameters = {
			contentType: file.type,
			...this.options.getUploadOptions?.(file),
			...options,
		}

		const signedUrl = await this.options.signUrl({ ...parameters, file })
		await this.uploadSingleFile(signedUrl, { file, onProgress, signal })

		return {
			publicUrl: signedUrl.publicUrl,
		}
	}

	private async uploadSingleFile(
		signedUrl: S3SignedUrlResponse,
		options: UploadClientUploadArgs,
	): Promise<void> {
		try {
			if (this.activeCount >= (this.options.concurrency ?? 5)) {
				await new Promise<void>(resolve => this.resolverQueue.push(resolve))
			}
			this.activeCount++

			await xhrAdapter(signedUrl, options)
		} finally {
			this.activeCount--
			this.resolverQueue.shift()?.()
		}
	}
}

const xhrAdapter = async (
	signedUrl: S3SignedUrlResponse,
	{ file, signal, onProgress }: UploadClientUploadArgs,
): Promise<void> => {
	return await new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest()

		signal.addEventListener('abort', () => {
			xhr.abort()
		})

		xhr.open(signedUrl.method, signedUrl.url)

		for (const header of signedUrl.headers) {
			xhr.setRequestHeader(header.key, header.value)
		}

		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve()
			} else {
				reject(
					new UploaderError({
						type: 'httpError',
						developerMessage: `HTTP error: ${xhr.status}`,
					}),
				)
			}
		})

		xhr.addEventListener('error', () => {
			reject(
				new UploaderError({
					type: 'networkError',
				}),
			)
		})
		xhr.addEventListener('abort', () => {
			reject(
				new UploaderError({
					type: 'aborted',
				}),
			)
		})
		xhr.addEventListener('timeout', () => {
			reject(
				new UploaderError({
					type: 'timeout',
				}),
			)
		})

		xhr.upload?.addEventListener('progress', e => {
			onProgress({
				totalBytes: e.total,
				uploadedBytes: e.loaded,
				progress: e.loaded / e.total,
			})
		})

		xhr.send(file)
	})
}
