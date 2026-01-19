import type { FieldName, FileType, UploadClient } from '../types.js'
import { getFileUrlDataExtractor } from '../extractors/getFileUrlDataExtractor.js'
import { getGenericFileMetadataExtractor } from '../extractors/getGenericFileMetadataExtractor.js'
import { getAudioFileDataExtractor } from '../extractors/getAudioFileDataExtractor.js'

export interface CreateAudioFileTypeProps<TEntity> {
	/** Upload client to use */
	uploader?: UploadClient<unknown>
	/** Field name for the URL */
	urlField: FieldName<TEntity>
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

const DEFAULT_AUDIO_ACCEPT = {
	'audio/*': ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.aiff'],
}

/**
 * Creates a file type configuration for audio uploads.
 * Includes extractors for URL, audio duration, and generic metadata.
 */
export const createAudioFileType = <TEntity extends Record<string, unknown>>({
	uploader,
	urlField,
	durationField,
	fileNameField,
	fileSizeField,
	fileTypeField,
	lastModifiedField,
	extractors = [],
	acceptFile,
	accept = DEFAULT_AUDIO_ACCEPT,
}: CreateAudioFileTypeProps<TEntity>): FileType<TEntity> => ({
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
		getAudioFileDataExtractor<TEntity>({
			durationField,
		}),
		getFileUrlDataExtractor<TEntity>({
			urlField,
		}),
		...extractors,
	],
})
