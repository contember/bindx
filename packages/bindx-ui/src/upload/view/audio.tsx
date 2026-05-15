import { type ReactNode } from 'react'
import { FileActions, type FileActionsProps } from '#bindx-ui/upload/view/actions'
import { AudioMetadata, type AudioMetadataProps } from '#bindx-ui/upload/view/metadata'

export interface UploadedAudioViewProps extends Omit<FileActionsProps, 'metadata'> {
	url: string
	duration?: number | null
	fileName?: string | null
	fileSize?: number | null
	fileType?: string | null
	lastModified?: string | Date | null
}

export const UploadedAudioView = ({
	url,
	duration,
	fileName,
	fileSize,
	fileType,
	lastModified,
	...actionProps
}: UploadedAudioViewProps): ReactNode => {
	const metadata: AudioMetadataProps = {
		url,
		duration,
		fileName,
		fileSize,
		fileType,
		lastModified,
	}

	return (
		<div className="flex items-end justify-center h-40 max-w-80 rounded-md group relative">
			<audio
				src={url}
				controls
				className="max-w-full max-h-full"
				controlsList="nodownload noremoteplayback noplaybackrate"
			/>
			<FileActions
				{...actionProps}
				metadata={<AudioMetadata {...metadata} />}
			/>
		</div>
	)
}
