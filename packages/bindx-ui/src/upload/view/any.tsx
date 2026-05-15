import { type ReactNode } from 'react'
import { FileIcon } from 'lucide-react'
import { FileActions, type FileActionsProps } from '#bindx-ui/upload/view/actions'
import { Metadata, type MetadataProps } from '#bindx-ui/upload/view/metadata'

export interface UploadedAnyViewProps extends Omit<FileActionsProps, 'metadata'> {
	url: string
	fileName?: string | null
	fileSize?: number | null
	fileType?: string | null
	lastModified?: string | Date | null
}

export const UploadedAnyView = ({
	url,
	fileName,
	fileSize,
	fileType,
	lastModified,
	...actionProps
}: UploadedAnyViewProps): ReactNode => {
	const metadata: MetadataProps = {
		url,
		fileName,
		fileSize,
		fileType,
		lastModified,
	}

	return (
		<div className="flex h-40 w-40 rounded-md group relative">
			<a
				href={url}
				target="_blank"
				rel="noreferrer"
				className="text-blue-600 hover:text-blue-700 underline overflow-hidden whitespace-nowrap text-ellipsis flex flex-col group/anchor flex-1 items-center justify-center"
			>
				<FileIcon className="h-16 w-16 text-gray-400 group-hover/anchor:text-gray-500 transition-all" />
				{fileName && <span className="mt-2 text-sm">{fileName}</span>}
			</a>
			<FileActions
				{...actionProps}
				metadata={<Metadata {...metadata} />}
			/>
		</div>
	)
}
