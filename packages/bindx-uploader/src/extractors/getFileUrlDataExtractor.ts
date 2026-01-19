import type { FieldRef } from '@contember/bindx'
import type { FieldName, FileDataExtractor } from '../types.js'

export interface FileUrlDataExtractorProps<TEntity> {
	urlField: FieldName<TEntity>
}

/**
 * Creates an extractor that populates the URL field with the upload result's public URL.
 */
export const getFileUrlDataExtractor = <TEntity extends Record<string, unknown>>({
	urlField,
}: FileUrlDataExtractorProps<TEntity>): FileDataExtractor<TEntity> => ({
	getFieldNames: () => [urlField],
	populateFields: ({ entity, result }) => {
		const fields = (entity as { $fields: Record<string, FieldRef<unknown>> }).$fields
		const field = fields[urlField]
		if (field) {
			field.setValue(result.publicUrl ?? null)
		}
	},
})
