import { useCallback } from 'react'
import type { FileWithMeta, UploaderEvents } from '../../types.js'
import { UploaderError } from '../../UploaderError.js'
import { useUploaderClient } from '../../contexts.js'
import { useGetPreviewUrls } from './useGetPreviewUrls.js'

/**
 * Hook that orchestrates the file upload process.
 * Handles file preparation, validation, and upload execution.
 */
export const useUploaderDoUpload = ({
	onBeforeUpload,
	onError,
	onProgress,
	onSuccess,
	onStartUpload,
	onAfterUpload,
}: UploaderEvents): ((files: File[]) => Promise<void>) => {
	const getPreviewUrl = useGetPreviewUrls()
	const defaultUploader = useUploaderClient()

	return useCallback(
		async (files: File[]) => {
			// Prepare files with metadata
			const fileWithMeta = files.map((file): FileWithMeta => {
				const abortController = new AbortController()
				const previewUrl = getPreviewUrl(file)
				abortController.signal.addEventListener('abort', () => {
					URL.revokeObjectURL(previewUrl)
				}, { once: true })

				return {
					id: Math.random().toString(36).substring(7),
					file,
					previewUrl,
					abortController,
				}
			})

			// Validate and prepare files
			const preparePromises = await Promise.allSettled(
				fileWithMeta.map(async file => {
					try {
						const result = await onBeforeUpload?.({
							file,
							reject: (reason: string): never => {
								throw new UploaderError({
									type: 'fileRejected',
									endUserMessage: reason,
								})
							},
						})
						if (!result) {
							throw new UploaderError({ type: 'fileRejected' })
						}
						return {
							file,
							fileType: result,
						}
					} catch (e) {
						onError?.({ file, error: e })
						return Promise.reject(e)
					}
				}),
			)

			// Filter successful preparations
			const preparedFiles = preparePromises
				.filter(
					<T extends PromiseFulfilledResult<unknown>>(
						p: T | PromiseRejectedResult,
					): p is T => p.status === 'fulfilled',
				)
				.map(p => p.value)

			// Upload files
			await Promise.allSettled(
				preparedFiles.map(async ({ file, fileType }) => {
					try {
						if (file.abortController.signal.aborted) {
							return
						}

						onStartUpload?.({ file, fileType })

						const uploader = fileType.uploader ?? defaultUploader
						if (!uploader) {
							throw new Error(
								'No uploader. Please specify the uploader in FileType or using UploaderClientContext.',
							)
						}

						const result = await uploader.upload({
							file: file.file,
							signal: file.abortController.signal,
							onProgress: progress => {
								onProgress?.({ file, progress, fileType })
							},
						})

						if (file.abortController.signal.aborted) {
							throw new UploaderError({ type: 'aborted' })
						}

						await onAfterUpload?.({ file, result, fileType })

						if (file.abortController.signal.aborted) {
							throw new UploaderError({ type: 'aborted' })
						}

						onSuccess?.({ file, result, fileType })
					} catch (e) {
						onError?.({ file, error: e, fileType })
					}
				}),
			)
		},
		[
			defaultUploader,
			getPreviewUrl,
			onAfterUpload,
			onBeforeUpload,
			onError,
			onProgress,
			onStartUpload,
			onSuccess,
		],
	)
}
