# 011: Static schema cache in SchemaLoader

**Severity:** Important
**Category:** Architecture
**Reported by:** delta

## Location

`packages/bindx/src/schema/SchemaLoader.ts:54, 82-84`

## Description

`SchemaLoader` uses a static class-level `Map` shared across the entire process lifetime:

```typescript
export class SchemaLoader {
    private static readonly cache = new Map<string, Promise<ContemberSchema>>()

    static async loadSchema(...): Promise<ContemberSchema> {
        const cacheKey = client.apiUrl ?? 'default'
        const existing = this.cache.get(cacheKey)
        ...
    }
}
```

## Impact

- In multi-tenant scenarios, schemas for different APIs/tenants can collide if they share an API URL pattern
- In tests, schemas from previous test runs persist unless `clearCache()` is called explicitly
- The cache grows unbounded in long-running processes (SSR servers)
- No cache invalidation mechanism beyond manual `clearCache()`

## Fix

Options:
1. Make the cache instance-level and scope it to a provider/context
2. Add TTL-based cache invalidation
3. For tests, add automatic cleanup in `afterEach` hooks
