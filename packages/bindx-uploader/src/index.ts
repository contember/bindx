// Types
export type {
	// Upload client
	UploadClient,
	FileUploadResult,
	FileUploadProgress,
	UploadClientUploadArgs,
	// File
	FileWithMeta,
	// State
	UploaderFileState,
	UploaderFileStateInitial,
	UploaderFileStateUploading,
	UploaderFileStateFinalizing,
	UploaderFileStateSuccess,
	UploaderFileStateError,
	UploaderState,
	// Events
	BeforeUploadEvent,
	StartUploadEvent,
	ProgressEvent,
	SuccessEvent,
	AfterUploadEvent,
	ErrorEvent,
	UploaderEvents,
	// Extractors
	FileDataExtractor,
	FileDataExtractorPopulator,
	// File type
	FileType,
	DiscriminatedFileType,
	DiscriminatedFileTypeMap,
	// Field name utility type
	FieldName,
	// Options
	UploaderOptions,
	// Errors
	UploaderErrorType,
	UploaderErrorOptions,
} from './types.js'

// Error class
export { UploaderError } from './UploaderError.js'

// Contexts
export {
	UploaderUploadFilesContext,
	useUploaderUploadFiles,
	UploaderStateContext,
	useUploaderState,
	UploaderOptionsContext,
	useUploaderOptions,
	UploaderFileStateContext,
	useUploaderFileState,
	UploaderClientContext,
	useUploaderClient,
	UploaderDropzoneStateContext,
	useUploaderDropzoneState,
} from './contexts.js'

// Upload client
export {
	S3UploadClient,
	type S3UploadClientOptions,
	type S3FileOptions,
	type S3Acl,
	type S3FileParameters,
	type S3SignedUrlResponse,
	type S3UrlSigner,
} from './uploadClient/index.js'

// Utils
export { createContentApiS3Signer, attrAccept, acceptToString } from './utils/index.js'

// Extractors
export {
	getFileUrlDataExtractor,
	type FileUrlDataExtractorProps,
	getGenericFileMetadataExtractor,
	type GenericFileMetadataExtractorProps,
	getImageFileDataExtractor,
	type ImageFileDataExtractorProps,
	getVideoFileDataExtractor,
	type VideoFileDataExtractorProps,
	getAudioFileDataExtractor,
	type AudioFileDataExtractorProps,
} from './extractors/index.js'

// File type creators
export {
	createImageFileType,
	type CreateImageFileTypeProps,
	createVideoFileType,
	type CreateVideoFileTypeProps,
	createAudioFileType,
	type CreateAudioFileTypeProps,
	createAnyFileType,
	type CreateAnyFileTypeProps,
} from './fileTypes/index.js'

// Hooks
export {
	useUploaderStateFiles,
	type StateFilter,
	useS3Client,
} from './hooks/index.js'

// Components
export {
	Uploader,
	UploaderWithMeta,
	type UploaderProps,
	MultiUploader,
	MultiUploaderWithMeta,
	type MultiUploaderProps,
	UploaderEachFile,
	type UploaderEachFileProps,
	UploaderHasFile,
	type UploaderHasFileProps,
	UploaderFileStateSwitch,
	type UploaderFileStateSwitchProps,
	UploaderDropzoneRoot,
	type UploaderDropzoneRootProps,
	UploaderDropzoneArea,
	type UploaderDropzoneAreaProps,
} from './components/index.js'
