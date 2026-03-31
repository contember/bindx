/**
 * Tests for entity and name schema generators
 */
import { describe, test, expect } from 'bun:test'
import { EntityTypeSchemaGenerator, NameSchemaGenerator } from '../src/index'
import { testModel } from './shared'

describe('NameSchemaGenerator', () => {
	test('generates schema names', () => {
		const generator = new NameSchemaGenerator()
		const schema = generator.generate(testModel)

		expect(schema.entities['Author']?.name).toBe('Author')
		expect(schema.entities['Author']?.scalars).toContain('id')
		expect(schema.entities['Author']?.scalars).toContain('name')
		expect(schema.entities['Author']?.fields['posts']).toEqual({ type: 'many', entity: 'Post' })

		expect(schema.entities['Post']?.fields['author']).toEqual({ type: 'one', entity: 'Author' })
		expect(schema.entities['Post']?.fields['tags']).toEqual({ type: 'many', entity: 'Tag' })
		expect(schema.entities['Post']?.fields['title']).toEqual({ type: 'column', columnType: 'text' })
		expect(schema.enums['PostStatus']).toEqual(['draft', 'published', 'archived'])
	})
})

describe('EntityTypeSchemaGenerator', () => {
	test('generates entity types', () => {
		const generator = new EntityTypeSchemaGenerator()
		const code = generator.generate(testModel)

		// Check Author entity
		expect(code).toContain('export type Author = {')
		expect(code).toContain('id: string')
		expect(code).toContain('name: string')
		expect(code).toContain('email: string | null')
		expect(code).toContain('posts: Post[]')

		// Check Post entity
		expect(code).toContain('export type Post = {')
		expect(code).toContain('author: Author')
		expect(code).toContain('tags: Tag[]')
		expect(code).toContain('status: PostStatusEnum')

		// Check schema types
		expect(code).toContain('export interface BindxEntities {')
		expect(code).toContain('Author: Author')
		expect(code).toContain('Post: Post')
		expect(code).toContain('Tag: Tag')
	})
})
