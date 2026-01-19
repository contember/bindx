import type { EntityRef } from '@contember/bindx'
import type { FileType, FileWithMeta, FileUploadResult } from '../../types.js'

interface ExecuteExtractorsArgs {
	fileType: FileType
	file: FileWithMeta
	result: FileUploadResult
}

/**
 * Executes all extractors for a file type and returns a populator function
 * that can be used to fill entity fields.
 */
export const executeExtractors = async ({
	fileType,
	file,
	result,
}: ExecuteExtractorsArgs): Promise<((options: { entity: EntityRef<unknown> }) => void) | undefined> => {
	const extractorsResult =
		fileType.extractors?.map(it => {
			return it.extractFileData?.(file)
		}) ?? []

	const extractionResult = await Promise.allSettled(extractorsResult)

	if (file.abortController.signal.aborted) {
		return undefined
	}

	return ({ entity }) => {
		// Cast entity to the expected type - extractors use runtime field access via $fields proxy
		const typedEntity = entity as EntityRef<Record<string, unknown>>

		// First populate fields synchronously
		fileType.extractors?.forEach(it => {
			it.populateFields?.({ entity: typedEntity, result })
		})

		// Then populate from async extractors
		extractionResult.forEach(it => {
			if (it.status === 'fulfilled' && it.value) {
				it.value({ entity: typedEntity, result })
			}
		})
	}
}
