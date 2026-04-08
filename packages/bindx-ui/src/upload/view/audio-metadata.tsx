import { type ReactNode } from 'react'
import { Metadata, DurationMeta, type MetadataProps } from '#bindx-ui/upload/view/metadata-base'

export interface AudioMetadataProps extends MetadataProps {
	duration?: number | null
}

export const AudioMetadata = ({ duration, ...props }: AudioMetadataProps): ReactNode => (
	<Metadata {...props}>
		<DurationMeta duration={duration} />
	</Metadata>
)
