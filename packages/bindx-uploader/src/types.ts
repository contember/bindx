import type { EntityRef, FieldRef, HasManyRef, HasOneRef } from '@contember/bindx'

// ============================================================================
// Upload Client Types
// ============================================================================

export interface UploadClient<
	Options = unknown,
	Result extends FileUploadResult = FileUploadResult,
> {
	upload: (args: UploadClientUploadArgs & Omit<Options, keyof UploadClientUploadArgs>) => Promise<Result>
}

export interface FileUploadResult {
	publicUrl: string
}

export interface FileUploadProgress {
	progress: number
	uploadedBytes: number
	totalBytes: number
}

export interface UploadClientUploadArgs {
	file: File
	signal: AbortSignal
	onProgress: (progress: FileUploadProgress) => void
}

// ============================================================================
// File Types
// ============================================================================

export interface FileWithMeta {
	id: string
	file: File
	previewUrl: string
	abortController: AbortController
}

// ============================================================================
// Upload State Types
// ============================================================================

export interface UploaderFileStateInitial {
	state: 'initial'
	file: FileWithMeta
}

export interface UploaderFileStateUploading {
	state: 'uploading'
	file: FileWithMeta
	progress: FileUploadProgress
}

export interface UploaderFileStateFinalizing {
	state: 'finalizing'
	file: FileWithMeta
	result: FileUploadResult
}

export interface UploaderFileStateSuccess {
	state: 'success'
	file: FileWithMeta
	result: FileUploadResult
	dismiss: () => void
}

export interface UploaderFileStateError {
	state: 'error'
	file: FileWithMeta
	error: unknown
	dismiss: () => void
}

export type UploaderFileState =
	| UploaderFileStateInitial
	| UploaderFileStateUploading
	| UploaderFileStateFinalizing
	| UploaderFileStateSuccess
	| UploaderFileStateError

export type UploaderState = UploaderFileState[]

// ============================================================================
// Event Types
// ============================================================================

export interface BeforeUploadEvent {
	file: FileWithMeta
	reject: (reason: string) => never
}

export interface StartUploadEvent {
	file: FileWithMeta
	fileType: FileType
}

export interface ProgressEvent {
	file: FileWithMeta
	progress: FileUploadProgress
	fileType: FileType
}

export interface SuccessEvent {
	file: FileWithMeta
	result: FileUploadResult
	fileType: FileType
}

export interface AfterUploadEvent {
	file: FileWithMeta
	result: FileUploadResult
	fileType: FileType
}

export interface ErrorEvent {
	file: FileWithMeta
	error: unknown
	fileType?: FileType
}

export interface UploaderEvents {
	onBeforeUpload: (event: BeforeUploadEvent) => Promise<FileType | undefined>
	onStartUpload: (event: StartUploadEvent) => void
	onProgress: (event: ProgressEvent) => void
	onAfterUpload: (event: AfterUploadEvent) => Promise<void> | void
	onSuccess: (event: SuccessEvent) => void
	onError: (event: ErrorEvent) => void
}

// ============================================================================
// Extractor Types
// ============================================================================

/**
 * Extract string keys from entity type (field names).
 */
export type FieldName<TEntity> = keyof TEntity & string

/**
 * Result from file data extraction that can populate entity fields
 */
export type FileDataExtractorPopulator<TEntity> = (options: {
	entity: EntityRef<TEntity>
	result: FileUploadResult
}) => void

/**
 * File data extractor interface for bindx.
 * Provides field names for selection collection and data extraction/population methods.
 */
export interface FileDataExtractor<TEntity = Record<string, unknown>> {
	/**
	 * Returns the field names this extractor will populate.
	 * Used by the selection system to know which fields to fetch.
	 */
	getFieldNames: () => FieldName<TEntity>[]

	/**
	 * Extract data from the file (async, e.g., image dimensions)
	 */
	extractFileData?: (file: FileWithMeta) => Promise<FileDataExtractorPopulator<TEntity> | undefined> | FileDataExtractorPopulator<TEntity> | undefined

	/**
	 * Populate entity fields synchronously (e.g., URL field from upload result)
	 */
	populateFields?: (options: { entity: EntityRef<TEntity>; result: FileUploadResult }) => void
}

// ============================================================================
// File Type Definition
// ============================================================================

/**
 * Configuration for a file type that defines how files are handled.
 */
export interface FileType<TEntity = Record<string, unknown>> {
	/**
	 * Accepted MIME types and extensions.
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/window/showOpenFilePicker#accept
	 * undefined means "any mime type"
	 */
	accept?: Record<string, string[]> | undefined

	/**
	 * Custom file validation. Optionally reject with rejection reason.
	 */
	acceptFile?: ((file: FileWithMeta) => boolean | Promise<void>) | undefined

	/**
	 * Data extractors for this file type
	 */
	extractors?: FileDataExtractor<TEntity>[]

	/**
	 * Custom upload client (overrides default)
	 */
	uploader?: UploadClient<unknown>
}

/**
 * File type with optional base field for discriminated uploads.
 */
export interface DiscriminatedFileType<TEntity = Record<string, unknown>> extends FileType<TEntity> {
	/**
	 * Base field name for has-one relation (e.g., 'image' for article.image)
	 */
	baseField?: string
}

/**
 * Map of discriminator values to file types for polymorphic file handling.
 */
export type DiscriminatedFileTypeMap<TEntity = Record<string, unknown>> = Record<string, DiscriminatedFileType<TEntity>>

// ============================================================================
// Options Types
// ============================================================================

export interface UploaderOptions {
	accept?: Record<string, string[]>
	multiple: boolean
}

// ============================================================================
// Error Types
// ============================================================================

export type UploaderErrorType =
	| 'fileRejected'
	| 'networkError'
	| 'httpError'
	| 'aborted'
	| 'timeout'

export interface UploaderErrorOptions {
	type: UploaderErrorType
	endUserMessage?: string
	developerMessage?: string
	error?: unknown
}
