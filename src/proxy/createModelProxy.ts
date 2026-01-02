import {
	type ModelProxy,
	type ModelProxyArray,
	type ModelProxyArrayResult,
	type ProxyMeta,
	PROXY_META,
} from './types.js'

/**
 * Creates a type-safe proxy for building queries.
 *
 * The proxy intercepts property access to track which fields are being selected.
 * Each access returns a new proxy with the extended path.
 *
 * @example
 * ```ts
 * const proxy = createModelProxy<Article>()
 * proxy.title                    // path: ['title']
 * proxy.author.name              // path: ['author', 'name']
 * proxy.tags.map(t => t.name)    // path: ['tags'] with mapped fields
 * ```
 */
export function createModelProxy<T>(path: string[] = []): ModelProxy<T> {
	const meta: ProxyMeta = { path }

	const handler: ProxyHandler<object> = {
		get(_target, prop: string | symbol) {
			// Return metadata for introspection
			if (prop === PROXY_META) {
				return meta
			}

			// Skip internal symbols
			if (typeof prop === 'symbol') {
				return undefined
			}

			// Handle .map() for arrays
			if (prop === 'map') {
				return createMapFunction(path)
			}

			// Create nested proxy for property access
			const newPath = [...path, prop]
			return createModelProxy<unknown>(newPath)
		},
		has(_target, prop: string | symbol) {
			// Support 'in' operator for PROXY_META check
			if (prop === PROXY_META) {
				return true
			}
			return false
		},
	}

	return new Proxy({}, handler) as ModelProxy<T>
}

/**
 * Creates the map function for array proxies.
 * When called, it creates a proxy for the item type and passes it to the callback.
 */
function createMapFunction<T>(parentPath: string[]) {
	return <TResult>(fn: (item: ModelProxy<T>) => TResult): ModelProxyArrayResult<TResult> => {
		// Create a proxy for the array item
		const itemProxy = createModelProxy<T>([])
		// Execute the callback to get the shape and track accessed fields
		const result = fn(itemProxy)

		// Return a special proxy that holds both the path and the mapped result
		return {
			[PROXY_META]: {
				path: parentPath,
				__arrayResult: result,
				__isArrayMap: true as const,
			},
		} as ModelProxyArrayResult<TResult>
	}
}

/**
 * Extracts the path from a proxy or proxy result
 */
export function getProxyPath(proxy: unknown): string[] {
	if (proxy && typeof proxy === 'object' && PROXY_META in proxy) {
		return (proxy[PROXY_META] as ProxyMeta).path
	}
	return []
}

/**
 * Checks if a value is a ModelProxy
 */
export function isModelProxy(value: unknown): value is { [PROXY_META]: ProxyMeta } {
	return value !== null && typeof value === 'object' && PROXY_META in value
}

/**
 * Checks if a value is a result of .map() call
 */
export function isArrayMapResult(value: unknown): value is ModelProxyArrayResult<unknown> {
	if (!isModelProxy(value)) return false
	const meta = value[PROXY_META] as ProxyMeta & { __isArrayMap?: boolean }
	return meta.__isArrayMap === true
}

/**
 * Gets the mapped result from an array map proxy
 */
export function getArrayMapResult<T>(proxy: ModelProxyArrayResult<T>): T {
	const meta = proxy[PROXY_META] as ProxyMeta & { __arrayResult: T }
	return meta.__arrayResult
}
