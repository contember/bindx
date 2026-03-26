import { type ReactNode } from 'react'
import { formatBytes, formatDate, formatDuration, truncateUrl } from '#bindx-ui/upload/view/utils'

export interface MetadataProps {
	url?: string | null
	fileSize?: number | null
	fileName?: string | null
	fileType?: string | null
	lastModified?: string | Date | null
	children?: ReactNode
}

export const Metadata = ({
	url,
	fileSize,
	fileName,
	fileType,
	lastModified,
	children,
}: MetadataProps): ReactNode => (
	<div className="grid grid-cols-[6rem_1fr] gap-2 text-sm">
		{fileSize != null && fileSize > 0 && (
			<>
				<span className="font-semibold text-right">Size:</span>
				<span>{formatBytes(fileSize)}</span>
			</>
		)}
		{fileType && (
			<>
				<span className="font-semibold text-right">Type:</span>
				<span>{fileType}</span>
			</>
		)}
		{fileName && (
			<>
				<span className="font-semibold text-right">File name:</span>
				<span>{fileName}</span>
			</>
		)}
		{children}
		{lastModified && (
			<>
				<span className="font-semibold text-right">Date:</span>
				<span>{formatDate(lastModified)}</span>
			</>
		)}
		{url && (
			<>
				<span className="font-semibold text-right">URL:</span>
				<span>
					<a
						href={url}
						target="_blank"
						rel="noreferrer"
						className="text-blue-600 underline overflow-hidden whitespace-nowrap text-ellipsis"
					>
						{truncateUrl(url)}
					</a>
				</span>
			</>
		)}
	</div>
)

export interface DimensionsMetaProps {
	width?: number | null
	height?: number | null
}

export const DimensionsMeta = ({ width, height }: DimensionsMetaProps): ReactNode => {
	if (!width || !height) {
		return null
	}
	return (
		<>
			<span className="font-semibold text-right">Dimensions:</span>
			<span>{width} x {height} px</span>
		</>
	)
}

export interface DurationMetaProps {
	duration?: number | null
}

export const DurationMeta = ({ duration }: DurationMetaProps): ReactNode => {
	if (!duration) {
		return null
	}
	return (
		<>
			<span className="font-semibold text-right">Duration:</span>
			<span>{formatDuration(duration)}</span>
		</>
	)
}

export interface ImageMetadataProps extends MetadataProps {
	width?: number | null
	height?: number | null
}

export const ImageMetadata = ({ width, height, ...props }: ImageMetadataProps): ReactNode => (
	<Metadata {...props}>
		<DimensionsMeta width={width} height={height} />
	</Metadata>
)

export interface AudioMetadataProps extends MetadataProps {
	duration?: number | null
}

export const AudioMetadata = ({ duration, ...props }: AudioMetadataProps): ReactNode => (
	<Metadata {...props}>
		<DurationMeta duration={duration} />
	</Metadata>
)

export interface VideoMetadataProps extends MetadataProps {
	width?: number | null
	height?: number | null
	duration?: number | null
}

export const VideoMetadata = ({ width, height, duration, ...props }: VideoMetadataProps): ReactNode => (
	<Metadata {...props}>
		<DurationMeta duration={duration} />
		<DimensionsMeta width={width} height={height} />
	</Metadata>
)
