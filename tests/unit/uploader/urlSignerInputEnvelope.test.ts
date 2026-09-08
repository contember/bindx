// Pins that generateUploadUrl always uses the S3GenerateSignedUploadInput
// envelope, never the legacy top-level-argument shape. See #43.

import { describe, expect, test } from 'bun:test'
import { createContentApiS3Signer } from '@contember/bindx-uploader'
import type { BindxGraphQlClient } from '@contember/bindx-react'

interface CapturedRequest {
	query: string
	variables: Record<string, unknown>
}

const createCapturingClient = (): { client: BindxGraphQlClient; captured: CapturedRequest[] } => {
	const captured: CapturedRequest[] = []
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
	test('uses the envelope and its input variables for a default single upload', async () => {
		const { client, captured } = createCapturingClient()
		const sign = createContentApiS3Signer(client)

		// Matches what a default-configured S3UploadClient sends for an 11-byte file.
		await sign({ contentType: 'text/plain', size: 11 })

		expect(captured).toHaveLength(1)
		const { query, variables } = captured[0]!

		expect(query).toContain('S3GenerateSignedUploadInput')
		expect(query).toContain('generateUploadUrl(input:')
		// …and rejects the legacy top-level arguments ("Unknown type S3Acl").
		expect(query).not.toContain('S3Acl')
		expect(query).not.toContain('contentType: $contentType_0')
		expect(variables).toEqual({ input_0: { contentType: 'text/plain', size: 11 } })
	})

	test('uses the input envelope for every aliased field in a batched mutation', async () => {
		const { client, captured } = createCapturingClient()
		const sign = createContentApiS3Signer(client)

		// Two concurrent requests batch into one mutation; both must use the
		// envelope — a mixed legacy/envelope mutation is rejected as a whole.
		const [first, second] = await Promise.all([
			sign({ contentType: 'text/plain', size: 11 }),
			sign({ contentType: 'image/png', fileName: 'photo.png' }),
		])

		expect(first.method).toBe('PUT')
		expect(second.method).toBe('PUT')
		expect(captured).toHaveLength(1)
		const { query, variables } = captured[0]!
		expect(query).not.toContain('S3Acl')
		const envelopeCalls = [...query.matchAll(/generateUploadUrl\(input:/g)]
		expect(envelopeCalls).toHaveLength(2)
		expect(variables).toEqual({
			input_0: { contentType: 'text/plain', size: 11 },
			input_1: { contentType: 'image/png', fileName: 'photo.png' },
		})
	})
})
