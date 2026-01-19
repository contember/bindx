import { useInterceptEntity } from './useBindxEvents.js'

/**
 * Convenience hook to run a callback before an entity is persisted.
 *
 * This is useful for validation, cleanup, or other pre-persist logic.
 * The callback is called before the entity is sent to the server.
 *
 * @example
 * ```tsx
 * function ArticleForm({ article }: { article: EntityRef<Article> }) {
 *   useEntityBeforePersist('Article', article.id, () => {
 *     // Validate or perform cleanup before persist
 *     if (!article.$fields.title.value) {
 *       article.$fields.title.addError('Title is required')
 *     }
 *   })
 *
 *   return <form>...</form>
 * }
 * ```
 */
export function useEntityBeforePersist(
	entityType: string,
	entityId: string,
	callback: () => void,
): void {
	useInterceptEntity('entity:persisting', entityType, entityId, () => {
		callback()
		return { action: 'continue' }
	})
}
