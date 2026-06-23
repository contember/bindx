/**
 * Derives the parent composite key ("parentType:parentId") from a relation key
 * ("parentType:parentId:fieldName") by dropping the trailing field segment.
 * Entity ids and field names never contain ':', so the parent key is everything
 * before the last separator.
 */
export function parentKeyFromRelationKey(relationKey: string): string {
	const lastSeparator = relationKey.lastIndexOf(':')
	return relationKey.slice(0, lastSeparator)
}

/**
 * Derives the parent composite key ("parentType:parentId") from an owner key
 * prefix ("parentType:parentId:") by dropping the trailing separator. Callers
 * pass the owner prefix used for relation-key lookups; this maps it to the key
 * the {@link RelationEdgeIndex} stores edges under.
 */
export function parentKeyFromOwnerPrefix(ownerPrefix: string): string {
	return ownerPrefix.endsWith(':') ? ownerPrefix.slice(0, -1) : ownerPrefix
}
