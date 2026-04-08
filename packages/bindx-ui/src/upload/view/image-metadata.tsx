import { type ReactNode } from 'react'
import { Metadata, DimensionsMeta, type MetadataProps } from '#bindx-ui/upload/view/metadata-base'

export interface ImageMetadataProps extends MetadataProps {
	width?: number | null
	height?: number | null
}

export const ImageMetadata = ({ width, height, ...props }: ImageMetadataProps): ReactNode => (
	<Metadata {...props}>
		<DimensionsMeta width={width} height={height} />
	</Metadata>
)
