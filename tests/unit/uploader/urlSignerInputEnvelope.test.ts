// Regression test for <issue-url — filled in after Step 7>
//
// `createContentApiS3Signer` must always request the signed upload URL via the
// `generateUploadUrl(input: S3GenerateSignedUploadInput)` envelope. The legacy
// shape (top-level `contentType` / `expiration` / `prefix` / `acl` arguments)
// is no longer accepted by the Contember engine (2.1.x rejects it with
// "Unknown type S3Acl" / "ACL is not supported"), yet the signer silently
// falls back to it whenever the parameters lack `suffix` / `fileName` /
// `extension` — which is exactly what a default-configured `S3UploadClient`
// produces (`{ contentType: file.type }`). Every default upload therefore
// fails against current engines.

import { describe, expect, test } from 'bun:test'
import { createContentApiS3Signer } from '@contember/bindx-uploader'
import type { BindxGraphQlClient } from '@contember/bindx-react'

const createCapturingClient = () => {
	const captured: { query: string; variables: Record<string, unknown> }[] = []
	const client = {
		execute: async (query: string, options?: { variables?: Record<string, unknown> }) => {
			captured.push({ query, variables: options?.variables ?? {} })
			// One signed-URL response per alias present in the query.
			const aliases = [...query.matchAll(/(url_\d+):\s*generateUploadUrl/g)].map(m => m[1])
			return Object.fromEntries(aliases.map(alias => [alias, {
				url: `https://s3.example.test/${alias}`,
				publicUrl: `https://cdn.example.test/${alias}`,
				method: 'PUT',
				headers: [],
			}]))
		},
	} as unknown as BindxGraphQlClient
	return { client, captured }
}

describe('createContentApiS3Signer', () => {
	test('should use the S3GenerateSignedUploadInput envelope when parameters carry only contentType', async () => {
		const { client, captured } = createCapturingClient()
		const sign = createContentApiS3Signer(client)

		// Default `S3UploadClient` parameters: nothing but the content type —
		// no suffix / fileName / extension (see S3UploadClient.upload()).
		await sign({ contentType: 'text/plain' })

		expect(captured).toHaveLength(1)
		const { query } = captured[0]!

		// The engine only accepts the input envelope…
		expect(query).toContain('S3GenerateSignedUploadInput')
		expect(query).toContain('generateUploadUrl(input:')
		// …and rejects the legacy top-level arguments ("Unknown type S3Acl").
		expect(query).not.toContain('S3Acl')
		expect(query).not.toContain('contentType: $contentType_0')
	})

	test('should use the input envelope for every aliased field in a batched mutation', async () => {
		const { client, captured } = createCapturingClient()
		const sign = createContentApiS3Signer(client)

		// Two concurrent requests batch into one mutation; the second one carries
		// a fileName (new-format trigger), the first one does not. Both aliases
		// must still use the envelope — a mixed legacy/envelope mutation is
		// rejected by the engine as a whole.
		const [first, second] = await Promise.all([
			sign({ contentType: 'text/plain' }),
			sign({ contentType: 'image/png', fileName: 'photo.png' }),
		])

		expect(first?.method).toBe('PUT')
		expect(second?.method).toBe('PUT')
		expect(captured).toHaveLength(1)
		const { query } = captured[0]!
		expect(query).not.toContain('S3Acl')
		const envelopeCalls = [...query.matchAll(/generateUploadUrl\(input:/g)]
		expect(envelopeCalls).toHaveLength(2)
	})
})
