import { describe, expect, test } from 'bun:test'
import { SchemaLoader, type SchemaLoaderClient } from '@contember/bindx-client'

describe('SchemaLoader', () => {
	test('should ask again after a failed load instead of keeping the failure', async () => {
		let attempts = 0
		const client: SchemaLoaderClient = {
			apiUrl: 'https://api.example/content',
			// Parses a response body the way a GraphQL client does.
			execute: () => {
				attempts++
				if (attempts === 1) return Promise.reject(new Error('offline'))
				return new Response(JSON.stringify({ schema: { enums: [], entities: [] } })).json()
			},
		}
		const loader = new SchemaLoader()

		await expect(loader.loadSchema(client)).rejects.toThrow('offline')
		const schema = await loader.loadSchema(client)

		expect(attempts).toBe(2)
		expect(schema.getEntity('Anything')).toBeUndefined()
	})
})
