import { createFragment } from '@contember/bindx-react'
import type { Author, Location, Tag, Article } from './types.js'

/**
 * Fragment for author fields - reusable across components
 */
export const AuthorFragment = createFragment<Author>()(e => e.id().name().email())

/**
 * Fragment for location fields
 */
export const LocationFragment = createFragment<Location>()(e => e.id().lat().lng().label())

/**
 * Fragment for tag fields
 */
export const TagFragment = createFragment<Tag>()(e => e.id().name().color())

/**
 * Full article fragment composing other fragments
 */
export const ArticleFragment = createFragment<Article>()(e =>
	e
		.id()
		.title()
		.content()
		.publishedAt()
		.author(AuthorFragment)
		.location(LocationFragment)
		.tags(TagFragment),
)

/**
 * Minimal article fragment for list views
 */
export const ArticleListFragment = createFragment<Article>()(e =>
	e.id().title().author(a => a.name()),
)
