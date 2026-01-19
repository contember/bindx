import type { FieldName, FileType, UploadClient } from '../types.js'
import { getFileUrlDataExtractor } from '../extractors/getFileUrlDataExtractor.js'
import { getGenericFileMetadataExtractor } from '../extractors/getGenericFileMetadataExtractor.js'
import { getImageFileDataExtractor } from '../extractors/getImageFileDataExtractor.js'

export interface CreateImageFileTypeProps<TEntity> {
	/** Upload client to use */
	uploader?: UploadClient<unknown>
	/** Field name for the URL */
	urlField: FieldName<TEntity>
	/** Field name for width (optional) */
	widthField?: FieldName<TEntity>
	/** Field name for height (optional) */
	heightField?: FieldName<TEntity>
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

const DEFAULT_IMAGE_ACCEPT = {
	'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
}

/**
 * Creates a file type configuration for image uploads.
 * Includes extractors for URL, image dimensions, and generic metadata.
 *
 * @example
 * ```tsx
 * interface Image {
 *   id: string
 *   url: string
 *   width: number
 *   height: number
 * }
 *
 * const imageFileType = createImageFileType<Image>({
 *   urlField: 'url',      // Type-checked: must be keyof Image
 *   widthField: 'width',  // Type-checked
 *   heightField: 'height',
 * })
 * ```
 */
export const createImageFileType = <TEntity extends Record<string, unknown>>({
	uploader,
	urlField,
	widthField,
	heightField,
	fileNameField,
	fileSizeField,
	fileTypeField,
	lastModifiedField,
	extractors = [],
	acceptFile,
	accept = DEFAULT_IMAGE_ACCEPT,
}: CreateImageFileTypeProps<TEntity>): FileType<TEntity> => ({
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
		getImageFileDataExtractor<TEntity>({
			widthField,
			heightField,
		}),
		getFileUrlDataExtractor<TEntity>({
			urlField,
		}),
		...extractors,
	],
})
