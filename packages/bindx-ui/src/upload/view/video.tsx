import { type ReactNode } from 'react'
import { FileActions, type FileActionsProps } from '#bindx-ui/upload/view/actions'
import { VideoMetadata, type VideoMetadataProps } from '#bindx-ui/upload/view/metadata'

export interface UploadedVideoViewProps extends Omit<FileActionsProps, 'metadata'> {
	url: string
	width?: number | null
	height?: number | null
	duration?: number | null
	fileName?: string | null
	fileSize?: number | null
	fileType?: string | null
	lastModified?: string | Date | null
}

export const UploadedVideoView = ({
	url,
	width,
	height,
	duration,
	fileName,
	fileSize,
	fileType,
	lastModified,
	...actionProps
}: UploadedVideoViewProps): ReactNode => {
	const metadata: VideoMetadataProps = {
		url,
		width,
		height,
		duration,
		fileName,
		fileSize,
		fileType,
		lastModified,
	}

	return (
		<div className="flex items-center justify-center h-40 max-w-60 rounded-md group relative">
			<video
				src={url}
				controls
				className="max-w-full max-h-full"
				controlsList="nodownload noremoteplayback noplaybackrate"
			/>
			<FileActions
				{...actionProps}
				metadata={<VideoMetadata {...metadata} />}
			/>
		</div>
	)
}
