import { type ReactNode } from 'react'
import {
	UploaderEachFile,
	UploaderFileStateSwitch,
} from '@contember/bindx-uploader'
import { Progress } from '#bindx-ui/ui/progress'
import {
	UploaderFileProgressWrapperUI,
	UploaderFileProgressInfoUI,
	UploaderFileProgressFileNameUI,
	UploaderFileProgressActionsUI,
} from '#bindx-ui/upload/ui'
import {
	InitialProgress,
	UploadingProgress,
	FinalizingProgress,
	SuccessProgress,
	ErrorProgress,
} from '#bindx-ui/upload/progress-states'

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

// Re-export for convenience
export { AbortButton } from '#bindx-ui/upload/abort-button'
export { DismissButton } from '#bindx-ui/upload/dismiss-button'
