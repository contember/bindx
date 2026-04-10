/**
 * Shared test schema definitions
 *
 * This module provides common test schemas that can be reused across different test files.
 * Each schema variant is exported for specific testing scenarios.
 */
import {
	defineSchema,
	entityDef,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx-react'

// ============================================================================
// Core Entity Types
// ============================================================================

export interface Author {
	id: string
	name: string
	email: string
	bio?: string
}

export interface Tag {
	id: string
	name: string
	color: string
}

export interface Location {
	id: string
	label: string
	lat: number
	lng: number
}

export interface Article {
	id: string
	title: string
	content: string
	published?: boolean | null
	status?: string
	views?: number | null
	rating?: number | null
	publishedAt?: string | null
	createdAt?: string | null
	author: Author | null
	location?: Location | null
	tags: Tag[]
}

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Full test schema with all entities and relations
 */
export interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
	Location: Location
}

export const testSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				published: scalar(),
				status: scalar(),
				views: scalar(),
				rating: scalar(),
				publishedAt: scalar(),
				createdAt: scalar(),
				author: hasOne('Author', { nullable: true }),
				location: hasOne('Location', { nullable: true }),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				bio: scalar(),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
			},
		},
		Location: {
			fields: {
				id: scalar(),
				label: scalar(),
				lat: scalar(),
				lng: scalar(),
			},
		},
	},
})

/**
 * Entity definitions for type-safe hooks
 */
export const schema = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
	Tag: entityDef<Tag>('Tag'),
	Location: entityDef<Location>('Location'),
} as const

// ============================================================================
// Minimal Schema (Article + Author only)
// ============================================================================

export interface MinimalArticle {
	id: string
	title: string
	author: MinimalAuthor | null
}

export interface MinimalAuthor {
	id: string
	name: string
	email: string
}

export interface MinimalSchema {
	Article: MinimalArticle
	Author: MinimalAuthor
}

export const minimalSchema = defineSchema<MinimalSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author', { nullable: true }),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
	},
})

export const minimalEntityDefs = {
	Article: entityDef<MinimalArticle>('Article'),
	Author: entityDef<MinimalAuthor>('Author'),
} as const

// ============================================================================
// HasMany-focused Schema (Article + Tags only)
// ============================================================================

export interface HasManyArticle {
	id: string
	title: string
	tags: HasManyTag[]
}

export interface HasManyTag {
	id: string
	name: string
	color: string
}

export interface HasManySchema {
	Article: HasManyArticle
	Tag: HasManyTag
}

export const hasManySchema = defineSchema<HasManySchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				tags: hasMany('Tag'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
			},
		},
	},
})

export const hasManyEntityDefs = {
	Article: entityDef<HasManyArticle>('Article'),
	Tag: entityDef<HasManyTag>('Tag'),
} as const
