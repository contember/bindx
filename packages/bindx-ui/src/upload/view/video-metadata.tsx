import { type ReactNode } from 'react'
import { Metadata, DurationMeta, DimensionsMeta, type MetadataProps } from '#bindx-ui/upload/view/metadata-base'

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
