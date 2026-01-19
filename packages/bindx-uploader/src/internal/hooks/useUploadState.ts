import { useCallback, useMemo, useState } from 'react'
import type {
	AfterUploadEvent,
	BeforeUploadEvent,
	ErrorEvent,
	ProgressEvent,
	StartUploadEvent,
	SuccessEvent,
	UploaderEvents,
	UploaderFileState,
	UploaderState,
} from '../../types.js'

export interface UseUploadStateResult extends UploaderEvents {
	files: UploaderState
	purgeFinal: () => void
	purgeAll: () => void
}

/**
 * Hook that manages the upload state machine.
 * Tracks file states through the upload lifecycle: initial -> uploading -> finalizing -> success/error
 */
export const useUploadState = ({
	onBeforeUpload,
	onStartUpload,
	onSuccess,
	onError,
	onProgress,
	onAfterUpload,
}: UploaderEvents): UseUploadStateResult => {
	const [files, setFiles] = useState<Record<string, UploaderFileState>>({})

	const purgeFinal = useCallback(() => {
		setFiles(files => {
			return Object.fromEntries(
				Object.entries(files).filter(
					([, file]) => file.state !== 'success' && file.state !== 'error',
				),
			)
		})
	}, [])

	const purgeAll = useCallback(() => {
		setFiles({})
	}, [])

	const handleBeforeUpload = useCallback(
		async (event: BeforeUploadEvent) => {
			setFiles(files => ({
				...files,
				[event.file.id]: { state: 'initial', file: event.file },
			}))
			return await onBeforeUpload?.(event)
		},
		[onBeforeUpload],
	)

	const handleStartUpload = useCallback(
		(event: StartUploadEvent) => {
			setFiles(files => ({
				...files,
				[event.file.id]: {
					state: 'uploading',
					file: event.file,
					progress: {
						progress: 0,
						uploadedBytes: 0,
						totalBytes: event.file.file.size,
					},
				},
			}))
			onStartUpload?.(event)
		},
		[onStartUpload],
	)

	const handleProgress = useCallback(
		(event: ProgressEvent) => {
			setFiles(files => ({
				...files,
				[event.file.id]: {
					state: 'uploading',
					file: event.file,
					progress: event.progress,
				},
			}))
			onProgress?.(event)
		},
		[onProgress],
	)

	const handleAfterUpload = useCallback(
		async (event: AfterUploadEvent) => {
			setFiles(files => ({
				...files,
				[event.file.id]: {
					state: 'finalizing',
					file: event.file,
					result: event.result,
				},
			}))
			return await onAfterUpload?.(event)
		},
		[onAfterUpload],
	)

	const handleSuccess = useCallback(
		(event: SuccessEvent) => {
			setFiles(files => ({
				...files,
				[event.file.id]: {
					state: 'success',
					file: event.file,
					result: event.result,
					dismiss: () =>
						setFiles(files => {
							const { [event.file.id]: _, ...rest } = files
							return rest
						}),
				},
			}))
			onSuccess?.(event)
		},
		[onSuccess],
	)

	const handleError = useCallback(
		(event: ErrorEvent) => {
			setFiles(files => ({
				...files,
				[event.file.id]: {
					state: 'error',
					file: event.file,
					error: event.error,
					dismiss: () =>
						setFiles(files => {
							const { [event.file.id]: _, ...rest } = files
							return rest
						}),
				},
			}))
			onError?.(event)
		},
		[onError],
	)

	return {
		files: useMemo(() => Object.values(files), [files]),
		purgeFinal,
		purgeAll,
		onBeforeUpload: handleBeforeUpload,
		onStartUpload: handleStartUpload,
		onProgress: handleProgress,
		onAfterUpload: handleAfterUpload,
		onSuccess: handleSuccess,
		onError: handleError,
	}
}
