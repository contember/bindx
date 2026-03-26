import { type ReactNode } from 'react'
import { XIcon, CheckIcon } from 'lucide-react'
import {
	UploaderEachFile,
	UploaderFileStateSwitch,
	useUploaderFileState,
	UploaderError,
	type UploaderFileStateInitial,
	type UploaderFileStateUploading,
	type UploaderFileStateFinalizing,
	type UploaderFileStateError,
	type UploaderFileStateSuccess,
} from '@contember/bindx-uploader'
import { Progress } from '#bindx-ui/ui/progress'
import { Button } from '#bindx-ui/ui/button'
import { dict } from '../dict.js'
import {
	UploaderFileProgressWrapperUI,
	UploaderFileProgressInfoUI,
	UploaderFileProgressFileNameUI,
	UploaderFileProgressActionsUI,
	UploaderFileProgressErrorUI,
	UploaderFileProgressSuccessUI,
} from '#bindx-ui/upload/ui'

export interface UploaderFileProgressUIProps {
	file: File
	progress?: number
	actions?: ReactNode
	info?: ReactNode
}

export const UploaderFileProgressUI = ({
	file,
	progress,
	actions,
	info,
}: UploaderFileProgressUIProps): ReactNode => (
	<UploaderFileProgressWrapperUI>
		<UploaderFileProgressInfoUI>
			<UploaderFileProgressFileNameUI>{file.name}</UploaderFileProgressFileNameUI>
			<UploaderFileProgressActionsUI>
				{actions}
			</UploaderFileProgressActionsUI>
		</UploaderFileProgressInfoUI>
		{progress !== undefined && (
			<Progress value={progress} />
		)}
		{info}
	</UploaderFileProgressWrapperUI>
)

const InitialProgress = ({ state }: { state: UploaderFileStateInitial }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		actions={<AbortButton />}
	/>
)

const UploadingProgress = ({ state }: { state: UploaderFileStateUploading }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		progress={state.progress.progress}
		actions={<AbortButton />}
	/>
)

const FinalizingProgress = ({ state }: { state: UploaderFileStateFinalizing }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		actions={<AbortButton />}
	/>
)

const ErrorProgress = ({ state }: { state: UploaderFileStateError }): ReactNode => {
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

const SuccessProgress = ({ state }: { state: UploaderFileStateSuccess }): ReactNode => (
	<UploaderFileProgressUI
		file={state.file.file}
		actions={<DismissButton />}
		info={<UploaderFileProgressSuccessUI><CheckIcon className="inline h-4 w-4" /> {dict.uploader.done}</UploaderFileProgressSuccessUI>}
	/>
)

export const UploaderProgress = (): ReactNode => (
	<UploaderEachFile>
		<UploaderFileStateSwitch
			initial={InitialProgress}
			uploading={UploadingProgress}
			finalizing={FinalizingProgress}
			success={SuccessProgress}
			error={ErrorProgress}
		/>
	</UploaderEachFile>
)

export const AbortButton = (): ReactNode => {
	const state = useUploaderFileState()

	const handleAbort = (): void => {
		state.file.abortController.abort()
	}

	return (
		<Button
			variant="ghost"
			size="xs"
			onClick={handleAbort}
			className="text-gray-500 hover:text-gray-700"
		>
			<XIcon className="h-4 w-4" />
		</Button>
	)
}

export const DismissButton = (): ReactNode => {
	const state = useUploaderFileState()

	if (state.state !== 'success' && state.state !== 'error') {
		return null
	}

	return (
		<Button
			variant="ghost"
			size="xs"
			onClick={state.dismiss}
			className="text-gray-500 hover:text-gray-700"
		>
			<XIcon className="h-4 w-4" />
		</Button>
	)
}
