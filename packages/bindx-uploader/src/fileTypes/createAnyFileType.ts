import type { FieldName, FileType, UploadClient } from '../types.js'
import { getFileUrlDataExtractor } from '../extractors/getFileUrlDataExtractor.js'
import { getGenericFileMetadataExtractor } from '../extractors/getGenericFileMetadataExtractor.js'

export interface CreateAnyFileTypeProps<TEntity> {
	/** Upload client to use */
	uploader?: UploadClient<unknown>
	/** Field name for the URL */
	urlField: FieldName<TEntity>
	/** Field name for file name (optional) */
	fileNameField?: FieldName<TEntity>
	/** Field name for file size (optional) */
	fileSizeField?: FieldName<TEntity>
	/** Field name for file type/MIME (optional) */
	fileTypeField?: FieldName<TEntity>
	/** Field name for last modified (optional) */
	lastModifiedField?: FieldName<TEntity>
	/** Additional extractors */
	extractors?: FileType<TEntity>['extractors']
	/** Custom file validator */
	acceptFile?: FileType<TEntity>['acceptFile']
	/** Accept MIME types (optional - defaults to any) */
	accept?: FileType<TEntity>['accept']
}

/**
 * Creates a file type configuration for any file upload.
 * Includes extractors for URL and generic metadata only.
 */
export const createAnyFileType = <TEntity extends Record<string, unknown>>({
	uploader,
	urlField,
	fileNameField,
	fileSizeField,
	fileTypeField,
	lastModifiedField,
	extractors = [],
	acceptFile,
	accept,
}: CreateAnyFileTypeProps<TEntity>): FileType<TEntity> => ({
	accept,
	acceptFile,
	uploader,
	extractors: [
		getGenericFileMetadataExtractor<TEntity>({
			fileNameField,
			fileSizeField,
			fileTypeField,
			lastModifiedField,
		}),
		getFileUrlDataExtractor<TEntity>({
			urlField,
		}),
		...extractors,
	],
})
