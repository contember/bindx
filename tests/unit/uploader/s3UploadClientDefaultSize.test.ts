// Regression test for issue #43 (comment): engines enforcing a per-role S3
// `maxSize` rule reject signing with "File size must be provided" when the
// client omits `size`. `S3UploadClient.upload` must default it to `file.size`.

import { describe, expect, test } from 'bun:test'
import { S3UploadClient } from '@contember/bindx-uploader'
import type { S3FileParameters, S3UploadClientOptions } from '@contember/bindx-uploader'

const createFile = (content: string): File => new File([content], 'test.txt', { type: 'text/plain' })

const captureSignedParameters = async (
	options: Omit<S3UploadClientOptions, 'signUrl'>,
	file: File,
	callOptions: Partial<S3FileParameters> = {},
): Promise<S3FileParameters | undefined> => {
	let captured: S3FileParameters | undefined
	const client = new S3UploadClient({
		...options,
		signUrl: async parameters => {
			captured = parameters
			throw new Error('stop before the actual upload')
		},
	})
	await client
		.upload({ file, signal: new AbortController().signal, onProgress: () => {}, ...callOptions })
		.catch(() => {})
	return captured
}

describe('S3UploadClient default parameters', () => {
	test('defaults size to file.size when nothing overrides it', async () => {
		const file = createFile('hello world')

		const captured = await captureSignedParameters({}, file)

		expect(captured?.size).toBe(file.size)
	})

	test('getUploadOptions can override the default size', async () => {
		const file = createFile('hello world')

		const captured = await captureSignedParameters({ getUploadOptions: () => ({ size: 42 }) }, file)

		expect(captured?.size).toBe(42)
	})

	test('per-call options override both the default and getUploadOptions', async () => {
		const file = createFile('hello world')

		const captured = await captureSignedParameters(
			{ getUploadOptions: () => ({ size: 42 }) },
			file,
			{ size: 7 },
		)

		expect(captured?.size).toBe(7)
	})
})
