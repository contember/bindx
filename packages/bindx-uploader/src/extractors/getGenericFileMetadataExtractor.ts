import type { FieldRef } from '@contember/bindx'
import type { FieldName, FileDataExtractor } from '../types.js'

export interface GenericFileMetadataExtractorProps<TEntity> {
	fileNameField?: FieldName<TEntity>
	lastModifiedField?: FieldName<TEntity>
	fileSizeField?: FieldName<TEntity>
	fileTypeField?: FieldName<TEntity>
}

/**
 * Creates an extractor that populates generic file metadata fields.
 */
export const getGenericFileMetadataExtractor = <TEntity extends Record<string, unknown>>({
	fileNameField,
	fileSizeField,
	fileTypeField,
	lastModifiedField,
}: GenericFileMetadataExtractorProps<TEntity>): FileDataExtractor<TEntity> => ({
	getFieldNames: () => [fileNameField, fileSizeField, fileTypeField, lastModifiedField].filter((f): f is FieldName<TEntity> => !!f),
	extractFileData: ({ file }) => {
		return ({ entity }) => {
			const fields = (entity as { $fields: Record<string, FieldRef<unknown>> }).$fields

			if (fileNameField) {
				fields[fileNameField]?.setValue(file.name)
			}
			if (fileSizeField) {
				fields[fileSizeField]?.setValue(file.size)
			}
			if (fileTypeField) {
				fields[fileTypeField]?.setValue(file.type)
			}
			if (lastModifiedField) {
				// Convert to ISO string for Date/DateTime fields
				fields[lastModifiedField]?.setValue(new Date(file.lastModified).toISOString())
			}
		}
	},
})
