import type { FieldRef } from '@contember/bindx'
import type { FieldName, FileDataExtractor } from '../types.js'

export interface VideoFileDataExtractorProps<TEntity> {
	widthField?: FieldName<TEntity>
	heightField?: FieldName<TEntity>
	durationField?: FieldName<TEntity>
}

/**
 * Creates an extractor that extracts video metadata (dimensions, duration).
 */
export const getVideoFileDataExtractor = <TEntity extends Record<string, unknown>>({
	widthField,
	heightField,
	durationField,
}: VideoFileDataExtractorProps<TEntity>): FileDataExtractor<TEntity> => ({
	getFieldNames: () => [widthField, heightField, durationField].filter((f): f is FieldName<TEntity> => !!f),
	extractFileData: async ({ previewUrl }) => {
		if (!heightField && !widthField && !durationField) {
			return undefined
		}

		const result = await new Promise<{
			width: number
			height: number
			duration: number
		}>((resolve, reject) => {
			const video = document.createElement('video')
			video.preload = 'metadata'

			video.addEventListener('loadedmetadata', () => {
				resolve({
					width: video.videoWidth,
					height: video.videoHeight,
					duration: video.duration,
				})
			})
			video.addEventListener('error', e => {
				reject(e)
			})
			video.src = previewUrl
		})

		return ({ entity }) => {
			const fields = (entity as { $fields: Record<string, FieldRef<unknown>> }).$fields

			if (widthField) {
				fields[widthField]?.setValue(result.width ?? null)
			}
			if (heightField) {
				fields[heightField]?.setValue(result.height ?? null)
			}
			if (durationField) {
				// Round duration for integer fields
				fields[durationField]?.setValue(Math.round(result.duration))
			}
		}
	},
})
