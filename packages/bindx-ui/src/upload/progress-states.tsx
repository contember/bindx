import { type ReactNode } from 'react'
import { CheckIcon } from 'lucide-react'
import {
	UploaderError,
	type UploaderFileStateInitial,
	type UploaderFileStateUploading,
	type UploaderFileStateFinalizing,
	type UploaderFileStateError,
	type UploaderFileStateSuccess,
} from '@contember/bindx-uploader'
import { dict } from '../dict.js'
import { UploaderFileProgressUI } from '#bindx-ui/upload/progress'
import { AbortButton } from '#bindx-ui/upload/abort-button'
import { DismissButton } from '#bindx-ui/upload/dismiss-button'
import { UploaderFileProgressErrorUI, UploaderFileProgressSuccessUI } from '#bindx-ui/upload/ui'

export const InitialProgress = ({ state }: { state: UploaderFileStateInitial }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		actions={<AbortButton />}
	/>
)

export const UploadingProgress = ({ state }: { state: UploaderFileStateUploading }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		progress={state.progress.progress}
		actions={<AbortButton />}
	/>
)

export const FinalizingProgress = ({ state }: { state: UploaderFileStateFinalizing }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		actions={<AbortButton />}
	/>
)

export const ErrorProgress = ({ state }: { state: UploaderFileStateError }): ReactNode => {
	const errorMessage = state.error instanceof UploaderError
		? (state.error.options.endUserMessage ?? dict.uploader.uploadErrors[state.error.options.type] ?? dict.uploader.unknownError)
		: dict.uploader.unknownError

	return (
		<UploaderFileProgressUI
			file={state.file.file}
			actions={<DismissButton />}
			info={<UploaderFileProgressErrorUI>{errorMessage}</UploaderFileProgressErrorUI>}
		/>
	)
}

export const SuccessProgress = ({ state }: { state: UploaderFileStateSuccess }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		actions={<DismissButton />}
		info={<UploaderFileProgressSuccessUI><CheckIcon className="inline h-4 w-4" /> {dict.uploader.done}</UploaderFileProgressSuccessUI>}
	/>
)
