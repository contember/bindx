import { createBindx, defineSchema, scalar, hasOne, hasMany } from '@contember/bindx-react'
import type { Article, Author, Tag, Location } from './types.js'

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
 * Schema definition with field types and relations.
 */
const schema = defineSchema<Schema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				publishedAt: scalar(),
				author: hasOne('Author'),
				location: hasOne('Location'),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				bio: scalar(),
				articles: hasMany('Article'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
				articles: hasMany('Article'),
			},
		},
		Location: {
			fields: {
				id: scalar(),
				lat: scalar(),
				lng: scalar(),
				label: scalar(),
			},
		},
	},
})

/**
 * Type-safe bindx hooks and components for this project's schema.
 *
 * Usage with hooks:
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
 * Usage with JSX component:
 * ```tsx
 * <Entity name="Article" id={articleId}>
 *   {article => (
 *     <div>
 *       <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </Entity>
 * ```
 *
 * - Entity name ('Article') is autocompleted
 * - `e` is automatically typed as ModelProxy<Article>
 * - Result fields are fully typed
 */
export const { useEntity, useEntityList, Entity, createComponent } = createBindx(schema)
