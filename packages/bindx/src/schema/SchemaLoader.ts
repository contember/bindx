/**
 * Loads schema from Contember Content API via GraphQL introspection.
 */

import { ContemberSchema, type RawContemberSchema } from './ContemberSchema.js'

export interface SchemaLoaderClient {
	execute<T>(query: string, options?: unknown): Promise<T>
	apiUrl?: string
}

const SCHEMA_QUERY = `query {
  schema {
    enums {
      name
      values
    }
    entities {
      name
      customPrimaryAllowed
      unique {
        fields
      }
      fields {
        __typename
        name
        type
        nullable
        ... on _Column {
          enumName
          defaultValue
        }
        ... on _Relation {
          side
          targetEntity
          ownedBy
          inversedBy
          onDelete
          orphanRemoval
          orderBy {
            path
            direction
          }
        }
      }
    }
  }
}`

/**
 * Loads and caches schema from Contember Content API.
 */
export class SchemaLoader {
	private static readonly cache = new Map<string, Promise<ContemberSchema>>()

	/**
	 * Loads schema from the API, with caching per API URL.
	 */
	static async loadSchema(
		client: SchemaLoaderClient,
		options?: unknown,
	): Promise<ContemberSchema> {
		const cacheKey = client.apiUrl ?? 'default'

		const existing = this.cache.get(cacheKey)
		if (existing) {
			return existing
		}

		const promise = (async () => {
			const response = await client.execute<{ schema: RawContemberSchema }>(SCHEMA_QUERY, options)
			return ContemberSchema.fromRaw(response.schema)
		})()

		this.cache.set(cacheKey, promise)
		return promise
	}

	/**
	 * Clears the schema cache.
	 */
	static clearCache(): void {
		this.cache.clear()
	}

	/**
	 * Clears cache for a specific API URL.
	 */
	static clearCacheFor(apiUrl: string): void {
		this.cache.delete(apiUrl)
	}
}
