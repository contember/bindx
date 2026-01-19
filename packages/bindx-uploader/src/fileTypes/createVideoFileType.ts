import type { FieldName, FileType, UploadClient } from '../types.js'
import { getFileUrlDataExtractor } from '../extractors/getFileUrlDataExtractor.js'
import { getGenericFileMetadataExtractor } from '../extractors/getGenericFileMetadataExtractor.js'
import { getVideoFileDataExtractor } from '../extractors/getVideoFileDataExtractor.js'

export interface CreateVideoFileTypeProps<TEntity> {
	/** Upload client to use */
	uploader?: UploadClient<unknown>
	/** Field name for the URL */
	urlField: FieldName<TEntity>
	/** Field name for width (optional) */
	widthField?: FieldName<TEntity>
	/** Field name for height (optional) */
	heightField?: FieldName<TEntity>
	/** Field name for duration (optional) */
	durationField?: FieldName<TEntity>
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
	/** Override default accept MIME types */
	accept?: FileType<TEntity>['accept']
}

const DEFAULT_VIDEO_ACCEPT = {
	'video/*': ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.wmv', '.mkv', '.3gp'],
}

/**
 * Creates a file type configuration for video uploads.
 * Includes extractors for URL, video dimensions, duration, and generic metadata.
 */
export const createVideoFileType = <TEntity extends Record<string, unknown>>({
	uploader,
	urlField,
	widthField,
	heightField,
	durationField,
	fileNameField,
	fileSizeField,
	fileTypeField,
	lastModifiedField,
	extractors = [],
	acceptFile,
	accept = DEFAULT_VIDEO_ACCEPT,
}: CreateVideoFileTypeProps<TEntity>): FileType<TEntity> => ({
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
		getVideoFileDataExtractor<TEntity>({
			widthField,
			heightField,
			durationField,
		}),
		getFileUrlDataExtractor<TEntity>({
			urlField,
		}),
		...extractors,
	],
})
