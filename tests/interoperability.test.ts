/**
 * Interoperability Tests
 *
 * These tests verify that fragments, useEntity, Entity, and createComponent
 * work correctly together at runtime, ensuring data flows properly through
 * the selection system.
 */

import { describe, test, expect, beforeAll, afterEach } from 'bun:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { EntityRef, FluentFragment, SelectionBuilder } from '@contember/bindx-react'
import {
	createFragment,
	createComponent,
	defineSchema,
	entityDef,
	scalar,
	hasOne,
	hasMany,
	BindxProvider,
	MockAdapter,
	Field,
	HasMany,
	HasOne,
	mergeFragments,
	SchemaRegistry,
} from '@contember/bindx-react'

// ============================================================================
// Test Entity Types
// ============================================================================

interface Author {
	id: string
	name: string
	email: string
	bio: string
}

interface Tag {
	id: string
	name: string
	color: string
}

interface Article {
	id: string
	title: string
	content: string
	published: boolean
	author: Author
	tags: Tag[]
}

// ============================================================================
// Schema Setup
// ============================================================================

const schema = defineSchema<{
	Author: Author
	Tag: Tag
	Article: Article
}>({
	entities: {
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
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				published: scalar(),
				author: hasOne('Author'),
				tags: hasMany('Tag'),
			},
		},
	},
})

const entityDefs = {
	Author: entityDef<Author>('Author'),
	Tag: entityDef<Tag>('Tag'),
	Article: entityDef<Article>('Article'),
} as const

// ============================================================================
// Fragment Interoperability Tests
// ============================================================================

describe('Fragment Interoperability', () => {
	describe('createFragment + createFragment composition', () => {
		test('fragment can be nested in another fragment', () => {
			const AuthorFragment = createFragment<Author>()(e => e.id().name())

			const ArticleFragment = createFragment<Article>()(e =>
				e.title().author(AuthorFragment),
			)

			// Verify nested structure
			const authorField = ArticleFragment.__meta.fields.get('author')
			expect(authorField).toBeDefined()
			expect(authorField?.nested?.fields.has('id')).toBe(true)
			expect(authorField?.nested?.fields.has('name')).toBe(true)
			expect(authorField?.nested?.fields.has('email')).toBe(false)
		})

		test('multiple fragments can be merged', () => {
			const NameFragment = createFragment<Author>()(e => e.name())
			const EmailFragment = createFragment<Author>()(e => e.email())

			const MergedFragment = mergeFragments(NameFragment, EmailFragment)

			expect(MergedFragment.__meta.fields.has('name')).toBe(true)
			expect(MergedFragment.__meta.fields.has('email')).toBe(true)
		})

		test('has-many with fragment', () => {
			const TagFragment = createFragment<Tag>()(e => e.id().name())

			const ArticleFragment = createFragment<Article>()(e => e.title().tags(TagFragment))

			const tagsField = ArticleFragment.__meta.fields.get('tags')
			expect(tagsField?.nested?.fields.has('id')).toBe(true)
			expect(tagsField?.nested?.fields.has('name')).toBe(true)
			expect(tagsField?.nested?.fields.has('color')).toBe(false)
		})
	})

	describe('createComponent + createFragment composition', () => {
		test('component can use fluent fragment in props', () => {
			// Create a fluent fragment
			const AuthorFragment = createFragment<Author>()(e => e.id().name().email())

			// Create a component with explicit selection
			const ArticleHeader = createComponent()
				.entity('article', entityDefs.Article, e => e.title().author(a => a.id().name().email()))
				.render(({ article }) => {
					void article.title
					void article.author
					return null
				})

			// Both should have compatible selection metadata
			expect(ArticleHeader.$article).toBeDefined()
			expect(AuthorFragment.__meta.fields.has('id')).toBe(true)
			expect(AuthorFragment.__meta.fields.has('name')).toBe(true)
		})

		test('component $propName matches declared selection', () => {
			const TagCard = createComponent()
				.entity('tag', entityDefs.Tag, e => e.name().color())
				.render(({ tag }) => {
					void tag.name
					void tag.color
					return null
				})

			// The $tag fragment should exist and have metadata
			expect(TagCard.$tag).toBeDefined()
			expect(TagCard.$tag.__isFragment).toBe(true)

			// Verify type brands
			const fragment = TagCard.$tag as FluentFragment<Tag, { name: string; color: string }>
			expect(fragment.__isFragment).toBe(true)
		})
	})

	describe('mergeFragments with createComponent', () => {
		test('can merge component fragment with fluent fragment', () => {
			// Component with explicit selection
			const AuthorCard = createComponent()
				.entity('author', entityDefs.Author, e => e.name())
				.render(({ author }) => {
					void author.name
					return null
				})

			// Fluent fragment
			const AuthorEmailFragment = createFragment<Author>()(e => e.email())

			// Merge them
			const MergedFragment = mergeFragments(AuthorCard.$author, AuthorEmailFragment)

			// Should have both fields
			expect(MergedFragment.__meta.fields.has('name')).toBe(true)
			expect(MergedFragment.__meta.fields.has('email')).toBe(true)
		})

		test('can merge multiple component fragment props', () => {
			const AuthorName = createComponent()
				.entity('author', entityDefs.Author, e => e.name())
				.render(({ author }) => {
					void author.name
					return null
				})

			const AuthorEmail = createComponent()
				.entity('author', entityDefs.Author, e => e.email())
				.render(({ author }) => {
					void author.email
					return null
				})

			const Combined = mergeFragments(AuthorName.$author, AuthorEmail.$author)

			expect(Combined.__meta.fields.has('name')).toBe(true)
			expect(Combined.__meta.fields.has('email')).toBe(true)
		})
	})
})

// ============================================================================
// Selection Resolution Tests
// ============================================================================

describe('Selection Resolution', () => {
	test('fluent definer creates correct selection', () => {
		const fragment = createFragment<Article>()(e =>
			e
				.id()
				.title()
				.author(a => a.name())
				.tags(t => t.name()),
		)

		expect(fragment.__meta.fields.has('id')).toBe(true)
		expect(fragment.__meta.fields.has('title')).toBe(true)
		expect(fragment.__meta.fields.has('author')).toBe(true)
		expect(fragment.__meta.fields.has('tags')).toBe(true)
		expect(fragment.__meta.fields.has('content')).toBe(false)
	})

	test('alias selection works correctly', () => {
		const fragment = createFragment<Article>()(e => e.title({ as: 'headline' }))

		expect(fragment.__meta.fields.has('headline')).toBe(true)
		const headlineField = fragment.__meta.fields.get('headline')
		expect(headlineField?.fieldName).toBe('title')
		expect(headlineField?.alias).toBe('headline')
	})

	test('has-many with options', () => {
		const fragment = createFragment<Article>()(e =>
			e.tags({ filter: { color: { eq: 'red' } }, limit: 5 }, t => t.name()),
		)

		// Find the tags field by fieldName (key is auto-generated alias with params)
		const tagsField = [...fragment.__meta.fields.values()].find(f => f.fieldName === 'tags')
		expect(tagsField?.hasManyParams?.filter).toEqual({ color: { eq: 'red' } })
		expect(tagsField?.hasManyParams?.limit).toBe(5)
	})
})

// ============================================================================
// Type Inference Chain Tests
// ============================================================================

describe('Type Inference Chain', () => {
	test('selection builder accumulates types correctly', () => {
		// Each call adds to the accumulated type
		const fragment = createFragment<Article>()(e => {
			// Start with empty selection
			const b1 = e.id()
			// b1 type: SelectionBuilder<Article, { id: string }>

			const b2 = b1.title()
			// b2 type: SelectionBuilder<Article, { id: string; title: string }>

			const b3 = b2.author(a => a.name())
			// b3 type: SelectionBuilder<Article, { id: string; title: string; author: { name: string } }>

			return b3
		})

		// Verify all fields are captured
		expect(fragment.__meta.fields.has('id')).toBe(true)
		expect(fragment.__meta.fields.has('title')).toBe(true)
		expect(fragment.__meta.fields.has('author')).toBe(true)
	})

	test('nested selection preserves full path', () => {
		const fragment = createFragment<Article>()(e =>
			e.author(a => a.name().email()),
		)

		const authorField = fragment.__meta.fields.get('author')
		expect(authorField?.path).toEqual(['author'])
		expect(authorField?.isRelation).toBe(true)

		const nameField = authorField?.nested?.fields.get('name')
		expect(nameField?.path).toEqual(['name'])
		expect(nameField?.fieldName).toBe('name')
	})
})

// ============================================================================
// Component Integration Tests
// ============================================================================

describe('Component Integration', () => {
	test('createComponent creates valid React component', () => {
		const AuthorView = createComponent()
			.entity('author', entityDefs.Author, e => e.name())
			.render(({ author }) => {
				void author.name
				return React.createElement('div', null, 'Author View')
			})

		// Should be a valid React component type
		expect(typeof AuthorView).toBe('object') // memo returns object
		// memo() wraps the component, so we just check it's defined
		expect(AuthorView).toBeDefined()
	})

	test('multiple components with different selections', () => {
		const AuthorName = createComponent()
			.entity('author', entityDefs.Author, e => e.name())
			.render(({ author }) => {
				void author.name
				return null
			})

		const AuthorFull = createComponent()
			.entity('author', entityDefs.Author, e => e.name().email().bio())
			.render(({ author }) => {
				void author.name
				void author.email
				void author.bio
				return null
			})

		// Each should have its own fragment with different fields
		expect(AuthorName.$author.__meta.fields.has('name')).toBe(true)
		expect(AuthorFull.$author.__meta.fields.has('name')).toBe(true)
		expect(AuthorFull.$author.__meta.fields.has('email')).toBe(true)
		expect(AuthorFull.$author.__meta.fields.has('bio')).toBe(true)
	})
})

// ============================================================================
// Schema Compatibility Tests
// ============================================================================

describe('Schema Compatibility', () => {
	test('schema registry is accessible from SchemaRegistry constructor', () => {
		const schemaRef = new SchemaRegistry(schema)

		expect(schemaRef).toBeDefined()
		expect(schemaRef.getEntityNames()).toContain('Author')
		expect(schemaRef.getEntityNames()).toContain('Article')
		expect(schemaRef.getEntityNames()).toContain('Tag')
	})

	test('schema field definitions match entity types', () => {
		const schemaRef = new SchemaRegistry(schema)

		// Author fields
		const authorFields = schemaRef.getAllFields('Author')
		expect(authorFields).toContain('id')
		expect(authorFields).toContain('name')
		expect(authorFields).toContain('email')
		expect(authorFields).toContain('bio')

		// Article relations
		const authorRelation = schemaRef.getFieldDef('Article', 'author')
		expect(authorRelation?.type).toBe('hasOne')

		const tagsRelation = schemaRef.getFieldDef('Article', 'tags')
		expect(tagsRelation?.type).toBe('hasMany')
	})
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
	test('mergeFragments requires at least one fragment', () => {
		expect(() => {
			// @ts-expect-error - Testing runtime error
			mergeFragments()
		}).toThrow('mergeFragments requires at least one fragment')
	})

	test('single fragment returns itself', () => {
		const fragment = createFragment<Author>()(e => e.name())
		const merged = mergeFragments(fragment)

		expect(merged).toBe(fragment)
	})
})
