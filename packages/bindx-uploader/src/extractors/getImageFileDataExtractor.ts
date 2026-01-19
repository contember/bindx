import type { FieldRef } from '@contember/bindx'
import type { FieldName, FileDataExtractor } from '../types.js'

export interface ImageFileDataExtractorProps<TEntity> {
	widthField?: FieldName<TEntity>
	heightField?: FieldName<TEntity>
}

/**
 * Creates an extractor that extracts image dimensions (width, height).
 */
export const getImageFileDataExtractor = <TEntity extends Record<string, unknown>>({
	widthField,
	heightField,
}: ImageFileDataExtractorProps<TEntity>): FileDataExtractor<TEntity> => ({
	getFieldNames: () => [widthField, heightField].filter((f): f is FieldName<TEntity> => !!f),
	extractFileData: async ({ previewUrl }) => {
		if (!heightField && !widthField) {
			return undefined
		}

		const result = await new Promise<{
			width: number
			height: number
		}>((resolve, reject) => {
			const image = new Image()
			image.addEventListener('load', () => {
				resolve({
					width: image.naturalWidth,
					height: image.naturalHeight,
				})
			})
			image.addEventListener('error', e => {
				reject(e)
			})
			image.src = previewUrl
		})

		return ({ entity }) => {
			const fields = (entity as { $fields: Record<string, FieldRef<unknown>> }).$fields

			if (widthField) {
				fields[widthField]?.setValue(result.width ?? null)
			}
			if (heightField) {
				fields[heightField]?.setValue(result.height ?? null)
			}
		}
	},
})
