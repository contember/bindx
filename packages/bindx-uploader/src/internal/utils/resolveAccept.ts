import type { FileType, FileWithMeta } from '../../types.js'
import { attrAccept } from '../../utils/attrAccept.js'

/**
 * Checks if a file is accepted by a single file type.
 * Returns false if rejected, true if accepted.
 */
export const resolveAcceptingSingleType = async (
	file: FileWithMeta,
	fileType: FileType,
): Promise<boolean> => {
	// Check MIME type
	if (fileType.accept && !attrAccept(file.file, fileType.accept)) {
		return false
	}

	// Run custom validator
	if (fileType.acceptFile) {
		const result = await fileType.acceptFile(file)
		if (result === false) {
			return false
		}
	}

	return true
}
