import type { FieldRef } from '@contember/bindx'
import type { FieldName, FileDataExtractor } from '../types.js'

export interface AudioFileDataExtractorProps<TEntity> {
	durationField?: FieldName<TEntity>
}

/**
 * Creates an extractor that extracts audio duration.
 */
export const getAudioFileDataExtractor = <TEntity extends Record<string, unknown>>({
	durationField,
}: AudioFileDataExtractorProps<TEntity>): FileDataExtractor<TEntity> => ({
	getFieldNames: () => durationField ? [durationField] : [],
	extractFileData: async ({ previewUrl }) => {
		if (!durationField) {
			return undefined
		}

		const result = await new Promise<{ duration: number }>((resolve, reject) => {
			const audio = document.createElement('audio')
			audio.preload = 'metadata'

			audio.addEventListener('canplay', () => {
				resolve({
					duration: audio.duration,
				})
			})
			audio.addEventListener('error', e => {
				reject(e)
			})
			audio.src = previewUrl
		})

		return ({ entity }) => {
			const fields = (entity as { $fields: Record<string, FieldRef<unknown>> }).$fields

			if (durationField) {
				// Round duration for integer fields
				fields[durationField]?.setValue(Math.round(result.duration))
			}
		}
	},
})
