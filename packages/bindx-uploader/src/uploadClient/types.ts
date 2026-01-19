/**
 * S3 upload URL signing types.
 * These types mirror @contember/client's GenerateUploadUrlMutationBuilder types
 * but are self-contained for bindx-uploader.
 */

export type S3Acl = 'PUBLIC_READ' | 'PRIVATE' | 'NONE'

export interface S3FileParameters {
	contentType: string
	expiration?: number
	size?: number
	prefix?: string
	extension?: string
	suffix?: string
	fileName?: string
	acl?: S3Acl
}

export interface S3SignedUrlResponse {
	url: string
	publicUrl: string
	method: string
	headers: Array<{
		key: string
		value: string
	}>
}

export type S3UrlSigner = (args: S3FileParameters & { file: File }) => Promise<S3SignedUrlResponse>
