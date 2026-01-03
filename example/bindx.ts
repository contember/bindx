import { createBindx } from '../src/index.js'
import type { Article, Author, Tag, Location } from './types.js'

// Re-export JSX components for examples
export { Entity, Field, HasMany, HasOne, If, Show } from '../src/index.js'
export type { EntityRef, FieldRef, HasManyRef, HasOneRef } from '../src/index.js'

/**
 * Schema mapping entity names to their types.
 * This enables type-safe entity name autocomplete and automatic model inference.
 */
export interface Schema {
	Article: Article
	Author: Author
	Tag: Tag
	Location: Location
}

/**
 * Type-safe bindx hooks for this project's schema.
 *
 * Usage:
 * ```ts
 * const article = useEntity('Article', { id }, e => ({
 *   title: e.title,
 *   author: { name: e.author.name },
 * }))
 *
 * const authors = useEntityList('Author', {}, e => ({
 *   id: e.id,
 *   name: e.name,
 * }))
 * ```
 *
 * - Entity name ('Article') is autocompleted
 * - `e` is automatically typed as ModelProxy<Article>
 * - Result fields are fully typed
 */
export const { useEntity, useEntityList, } = createBindx<Schema>()
