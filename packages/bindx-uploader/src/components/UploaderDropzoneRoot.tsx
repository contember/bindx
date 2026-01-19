import { type ReactNode } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploaderDropzoneStateContext } from '../contexts.js'
import { useUploaderOptions, useUploaderUploadFiles } from '../contexts.js'

export interface UploaderDropzoneRootProps {
	children: ReactNode
	noInput?: boolean
	disabled?: boolean
}

export const UploaderDropzoneRoot = ({ children, noInput, disabled }: UploaderDropzoneRootProps): ReactNode => {
	const onDrop = useUploaderUploadFiles()
	const { multiple, accept } = useUploaderOptions()

	const dropzoneState = useDropzone({
		onDrop,
		disabled,
		accept,
		multiple,
		noKeyboard: true, // Keyboard navigation handled by button inside
	})

	return (
		<UploaderDropzoneStateContext.Provider value={dropzoneState}>
			{noInput ? null : (
				<input {...dropzoneState.getInputProps()} />
			)}
			{children}
		</UploaderDropzoneStateContext.Provider>
	)
}
