import { type ReactNode, useMemo } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { useUploaderDropzoneState, useUploaderState } from '../contexts.js'

const dataAttribute = (value: unknown): '' | undefined => value ? '' : undefined

export interface UploaderDropzoneAreaProps {
	children: ReactNode
}

export const UploaderDropzoneArea = ({ children }: UploaderDropzoneAreaProps): ReactNode => {
	const { getRootProps, isDragActive, isDragAccept, isDragReject, isFocused, isFileDialogActive } = useUploaderDropzoneState()
	const files = useUploaderState()
	const isUploading = useMemo(() => files.some(it => it.state === 'uploading' || it.state === 'initial'), [files])

	return (
		<Slot
			{...getRootProps()}
			data-dropzone-active={dataAttribute(isDragActive)}
			data-dropzone-accept={dataAttribute(isDragAccept)}
			data-dropzone-reject={dataAttribute(isDragReject)}
			data-dropzone-focused={dataAttribute(isFocused)}
			data-dropzone-file-dialog-active={dataAttribute(isFileDialogActive)}
			data-dropzone-uploading={dataAttribute(isUploading)}
		>
			{children}
		</Slot>
	)
}
