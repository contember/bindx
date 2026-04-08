import { type ReactNode, type MouseEvent } from 'react'
import { TrashIcon, InfoIcon } from 'lucide-react'
import { Button } from '#bindx-ui/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'
import { ImageMetadata, type ImageMetadataProps } from '#bindx-ui/upload/view/metadata'

export interface UploadedImageViewProps {
	url: string
	width?: number | null
	height?: number | null
	fileName?: string | null
	fileSize?: number | null
	fileType?: string | null
	lastModified?: string | Date | null
	alt?: string
	onRemove?: () => void
	onEdit?: () => void
	editContent?: ReactNode
	actions?: ReactNode
}

export const UploadedImageView = ({
	url,
	width,
	height,
	fileName,
	fileSize,
	fileType,
	lastModified,
	alt,
	onRemove,
	actions,
}: UploadedImageViewProps): ReactNode => {
	const metadata: ImageMetadataProps = {
		url,
		width,
		height,
		fileName,
		fileSize,
		fileType,
		lastModified,
	}

	return (
		<div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
			<div className="flex items-center justify-center bg-gray-50 p-4 min-h-36">
				<img
					src={url}
					alt={alt ?? fileName ?? 'Uploaded image'}
					className="max-w-full max-h-48 object-contain rounded"
				/>
			</div>
			<div className="flex items-center gap-1 px-3 py-2 border-t border-gray-100 bg-white">
				{fileName && (
					<span className="text-xs text-gray-500 truncate flex-1">{fileName}</span>
				)}
				{!fileName && <span className="flex-1" />}
				{actions}
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="xs"
							className="h-7 w-7 text-gray-400 hover:text-gray-600"
							onClick={(e: MouseEvent) => e.stopPropagation()}
						>
							<InfoIcon className="h-3.5 w-3.5" />
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						<div className="text-sm">
							<ImageMetadata {...metadata} />
						</div>
					</PopoverContent>
				</Popover>
				{onRemove && (
					<Button
						variant="ghost"
						size="xs"
						className="h-7 w-7 text-gray-400 hover:text-red-600"
						onClick={(e: MouseEvent) => {
							e.stopPropagation()
							onRemove()
						}}
					>
						<TrashIcon className="h-3.5 w-3.5" />
					</Button>
				)}
			</div>
		</div>
	)
}
