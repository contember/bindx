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
