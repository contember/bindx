import type { ErrorEvent } from '../../types.js'
import { UploaderError } from '../../UploaderError.js'

/**
 * Default error handler that filters out expected errors (fileRejected, aborted)
 * and logs unexpected errors.
 */
export const uploaderErrorHandler = (event: ErrorEvent): void => {
	if (event.error instanceof UploaderError) {
		if (event.error.options.type === 'fileRejected' || event.error.options.type === 'aborted') {
			return
		}
	}
	console.error('Upload error:', event.error)
}
