import { useMemo } from 'react'
import { useBindxContext } from '@contember/bindx-react'
import { S3UploadClient, type S3UploadClientOptions } from '../uploadClient/S3UploadClient.js'
import { createContentApiS3Signer } from '../utils/urlSigner.js'

/**
 * Creates an S3 upload client using the current Contember GraphQL client.
 * Uses the bindx context to get the GraphQL client for URL signing.
 */
export const useS3Client = (options: Partial<S3UploadClientOptions> = {}): S3UploadClient => {
	const { adapter } = useBindxContext()

	return useMemo(() => {
		// Get the GraphQL client from the adapter
		// ContemberAdapter has a graphQlClient property
		const graphQlClient = (adapter as { graphQlClient?: { execute: (query: string, options?: unknown) => Promise<unknown> } }).graphQlClient
		if (!graphQlClient) {
			throw new Error('useS3Client requires a Contember adapter with GraphQL client')
		}

		return new S3UploadClient({
			signUrl: createContentApiS3Signer(graphQlClient as Parameters<typeof createContentApiS3Signer>[0]),
			...options,
		})
	}, [adapter, options])
}
