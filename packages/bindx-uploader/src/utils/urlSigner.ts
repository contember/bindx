import type { GraphQlClient } from '@contember/graphql-client'
import type { S3FileParameters, S3SignedUrlResponse } from '../uploadClient/types.js'

/**
 * Creates an S3 URL signer that batches requests to reduce API calls.
 * Uses microtask scheduling to batch concurrent signing requests into a single GraphQL mutation.
 */
export const createContentApiS3Signer = (
	client: GraphQlClient,
): ((parameters: S3FileParameters) => Promise<S3SignedUrlResponse>) => {
	let uploadUrlBatchParameters: S3FileParameters[] = []
	let uploadUrlBatchResult: null | Promise<Record<string, S3SignedUrlResponse>> = null

	return async (parameters: S3FileParameters): Promise<S3SignedUrlResponse> => {
		const index = uploadUrlBatchParameters.length
		uploadUrlBatchParameters.push(parameters)

		if (uploadUrlBatchResult === null) {
			uploadUrlBatchResult = (async () => {
				// Wait for microtask to batch concurrent requests
				await new Promise(resolve => setTimeout(resolve, 0))

				const currentParams = uploadUrlBatchParameters
				uploadUrlBatchResult = null
				uploadUrlBatchParameters = []

				const mutation = buildGenerateUploadUrlMutation(
					Object.fromEntries(currentParams.map((p, i) => [`url_${i}`, p])),
				)

				return await client.execute<Record<string, S3SignedUrlResponse>>(mutation.query, {
					variables: mutation.variables,
				})
			})()
		}

		const result = (await uploadUrlBatchResult)[`url_${index}`]
		if (!result) {
			throw new Error(`Failed to get signed URL for index ${index}`)
		}
		return result
	}
}

/**
 * Builds a GraphQL mutation for generating S3 upload URLs.
 */
function buildGenerateUploadUrlMutation(
	parameters: Record<string, S3FileParameters>,
): { query: string; variables: Record<string, unknown> } {
	const fields: string[] = []
	const variables: Record<string, unknown> = {}
	const variableDefinitions: string[] = []

	let varIndex = 0
	for (const alias in parameters) {
		const params = parameters[alias]
		if (!params) continue

		const hasNewFormat = params.suffix || params.fileName || params.extension

		if (hasNewFormat) {
			const inputVarName = `input_${varIndex}`
			variableDefinitions.push(`$${inputVarName}: S3GenerateSignedUploadInput`)
			variables[inputVarName] = {
				contentType: params.contentType,
				prefix: params.prefix,
				expiration: params.expiration,
				acl: params.acl,
				size: params.size,
				suffix: params.suffix,
				fileName: params.fileName,
				extension: params.extension,
			}
			fields.push(`${alias}: generateUploadUrl(input: $${inputVarName}) {
				url
				publicUrl
				method
				headers { key value }
			}`)
		} else {
			const contentTypeVar = `contentType_${varIndex}`
			const expirationVar = `expiration_${varIndex}`
			const prefixVar = `prefix_${varIndex}`
			const aclVar = `acl_${varIndex}`

			variableDefinitions.push(`$${contentTypeVar}: String`)
			variableDefinitions.push(`$${expirationVar}: Int`)
			variableDefinitions.push(`$${prefixVar}: String`)
			variableDefinitions.push(`$${aclVar}: S3Acl`)

			variables[contentTypeVar] = params.contentType
			variables[expirationVar] = params.expiration
			variables[prefixVar] = params.prefix
			variables[aclVar] = params.acl

			fields.push(`${alias}: generateUploadUrl(
				contentType: $${contentTypeVar}
				expiration: $${expirationVar}
				prefix: $${prefixVar}
				acl: $${aclVar}
			) {
				url
				publicUrl
				method
				headers { key value }
			}`)
		}
		varIndex++
	}

	const query = `mutation${variableDefinitions.length > 0 ? `(${variableDefinitions.join(', ')})` : ''} {
		${fields.join('\n')}
	}`

	return { query, variables }
}
