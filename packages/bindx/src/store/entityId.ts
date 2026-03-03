/**
 * Entity ID type detection and generation utilities.
 *
 * IDs in Bindx can be:
 * - Persisted: server-assigned UUIDs
 * - Temporary: locally created, prefixed with "__temp_"
 * - Placeholder: disconnected relation placeholders, prefixed with "__placeholder_"
 */

/**
 * Checks if an ID is a temporary ID (created locally, not yet persisted).
 */
export function isTempId(id: string): boolean {
	return id.startsWith('__temp_')
}

/**
 * Checks if an ID is a placeholder ID (disconnected relation placeholder).
 */
export function isPlaceholderId(id: string): boolean {
	return id.startsWith('__placeholder_')
}

/**
 * Checks if an ID is a persisted/real ID from the server.
 */
export function isPersistedId(id: string): boolean {
	return !isTempId(id) && !isPlaceholderId(id)
}

/**
 * Generates a new placeholder ID.
 */
export function generatePlaceholderId(): string {
	return `__placeholder_${crypto.randomUUID()}`
}

/**
 * Generates a new temporary ID.
 */
export function generateTempId(): string {
	return `__temp_${crypto.randomUUID()}`
}
