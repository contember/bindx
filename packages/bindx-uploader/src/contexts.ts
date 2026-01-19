import { createContext, useContext } from 'react'
import type { DropzoneState } from 'react-dropzone'
import type { UploaderFileState, UploaderOptions, UploaderState, UploadClient } from './types.js'

// ============================================================================
// Context Creation Helpers
// ============================================================================

function createRequiredContext<T>(name: string): [React.Context<T | null>, () => T] {
	const Context = createContext<T | null>(null)
	Context.displayName = name

	const useContextHook = (): T => {
		const value = useContext(Context)
		if (value === null) {
			throw new Error(`${name} must be used within its Provider`)
		}
		return value
	}

	return [Context, useContextHook]
}

// ============================================================================
// Public Contexts
// ============================================================================

/**
 * Context for the upload function
 */
export const [UploaderUploadFilesContext, useUploaderUploadFiles] =
	createRequiredContext<(files: File[]) => void>('UploaderUploadFiles')

/**
 * Context for current upload state
 */
export const [UploaderStateContext, useUploaderState] =
	createRequiredContext<UploaderState>('UploaderState')

/**
 * Context for uploader options (accept, multiple)
 */
export const [UploaderOptionsContext, useUploaderOptions] =
	createRequiredContext<UploaderOptions>('UploaderOptions')

/**
 * Context for current file state (within UploaderEachFile)
 */
export const [UploaderFileStateContext, useUploaderFileState] =
	createRequiredContext<UploaderFileState>('UploaderFileState')

/**
 * Context for the default upload client
 */
export const UploaderClientContext = createContext<UploadClient<unknown> | null>(null)
UploaderClientContext.displayName = 'UploaderClient'

export const useUploaderClient = (): UploadClient<unknown> | null => {
	return useContext(UploaderClientContext)
}

// ============================================================================
// Internal Contexts
// ============================================================================

/**
 * Context for multi-uploader entity to file state mapping
 */
export const MultiUploaderEntityToFileStateMapContext = createContext<Map<string, string> | null>(null)
MultiUploaderEntityToFileStateMapContext.displayName = 'MultiUploaderEntityToFileStateMap'

/**
 * Context for dropzone state from react-dropzone
 */
export const [UploaderDropzoneStateContext, useUploaderDropzoneState] =
	createRequiredContext<DropzoneState>('UploaderDropzoneState')
