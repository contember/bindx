import { describe, test, expect } from 'bun:test'
import {
	mapMutationError,
	mapValidationError,
	extractMappedErrors,
	isNestedError,
	getErrorPathString,
	type ContemberMutationError,
	type ContemberValidationError,
	type ContemberMutationResult,
} from '@contember/bindx'
import { SchemaRegistry, defineSchema, scalar, hasOne, hasMany } from '@contember/bindx'

// Test schema
interface Author {
	id: string
	name: string
	email: string
	articles: Article[]
}

interface Article {
	id: string
	title: string
	content: string
	author: Author
	tags: Tag[]
}

interface Tag {
	id: string
	name: string
}

const testSchema = defineSchema<{
	Author: Author
	Article: Article
	Tag: Tag
}>({
	entities: {
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				articles: hasMany('Article', { inverse: 'author' }),
			},
		},
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author', { inverse: 'articles' }),
				tags: hasMany('Tag'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const schema = new SchemaRegistry(testSchema)

describe('pathMapper', () => {
	describe('mapMutationError', () => {
		test('should map scalar field error correctly', () => {
			const error: ContemberMutationError = {
				paths: [[{ field: 'title' }]],
				message: 'Title is required',
				type: 'NotNullConstraintViolation',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.type).toBe('field')
			expect(result[0]!.name).toBe('title')
			expect(result[0]!.error.message).toBe('Title is required')
			expect(result[0]!.error.code).toBe('NOT_NULL')
			expect(result[0]!.error.type).toBe('NotNullConstraintViolation')
		})

		test('should map has-one relation error correctly', () => {
			const error: ContemberMutationError = {
				paths: [[{ field: 'author' }]],
				message: 'Author is required',
				type: 'ForeignKeyConstraintViolation',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.type).toBe('relation')
			expect(result[0]!.name).toBe('author')
			expect(result[0]!.error.code).toBe('FOREIGN_KEY')
			expect(result[0]!.path?.isRelation).toBe(true)
			expect(result[0]!.path?.targetEntityType).toBe('Author')
		})

		test('should map has-many relation error correctly', () => {
			const error: ContemberMutationError = {
				paths: [[{ field: 'tags' }]],
				message: 'Invalid tag reference',
				type: 'ForeignKeyConstraintViolation',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.type).toBe('relation')
			expect(result[0]!.name).toBe('tags')
			expect(result[0]!.path?.targetEntityType).toBe('Tag')
		})

		test('should map nested error in has-many relation', () => {
			const error: ContemberMutationError = {
				paths: [[{ field: 'tags' }, { index: 0, alias: null }, { field: 'name' }]],
				message: 'Tag name is required',
				type: 'NotNullConstraintViolation',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.type).toBe('relation')
			expect(result[0]!.name).toBe('tags')
			expect(result[0]!.path?.pathString).toBe('tags[0].name')
			expect(result[0]!.path?.leafField).toBe('name')
			expect(result[0]!.error.message).toContain('at tags[0].name')
			expect(isNestedError(result[0]!)).toBe(true)
		})

		test('should map deeply nested error', () => {
			const error: ContemberMutationError = {
				paths: [[
					{ field: 'author' },
					{ field: 'articles' },
					{ index: 2, alias: null },
					{ field: 'title' },
				]],
				message: 'Title cannot be empty',
				type: 'InvalidDataInput',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.path?.pathString).toBe('author.articles[2].title')
			expect(result[0]!.path?.leafField).toBe('title')
			// Segments: author, articles[2], title (index is merged with field)
			expect(result[0]!.path?.segments).toHaveLength(3)
			expect(result[0]!.path?.segments[1]?.field).toBe('articles')
			expect(result[0]!.path?.segments[1]?.index).toBe(2)
		})

		test('should handle multiple paths in single error', () => {
			const error: ContemberMutationError = {
				paths: [
					[{ field: 'title' }],
					[{ field: 'content' }],
				],
				message: 'Both title and content are required',
				type: 'NotNullConstraintViolation',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(2)
			expect(result[0]!.name).toBe('title')
			expect(result[1]!.name).toBe('content')
		})

		test('should handle unknown field gracefully', () => {
			const error: ContemberMutationError = {
				paths: [[{ field: 'unknownField' }]],
				message: 'Error on unknown field',
				type: 'InvalidDataInput',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.type).toBe('field')
			expect(result[0]!.name).toBe('unknownField')
		})

		test('should create entity-level error for empty paths', () => {
			const error: ContemberMutationError = {
				paths: [],
				message: 'Entity-level error',
				type: 'SqlError',
			}

			const result = mapMutationError(error, 'Article', schema)

			expect(result).toHaveLength(1)
			expect(result[0]!.type).toBe('entity')
			expect(result[0]!.name).toBeUndefined()
		})
	})

	describe('mapValidationError', () => {
		test('should map validation error to field', () => {
			const error: ContemberValidationError = {
				path: [{ field: 'email' }],
				message: { text: 'Invalid email format' },
			}

			const result = mapValidationError(error, 'Author', schema)

			expect(result.type).toBe('field')
			expect(result.name).toBe('email')
			expect(result.error.message).toBe('Invalid email format')
			expect(result.error.code).toBe(undefined) // Validation errors don't have execution error types
		})

		test('should map nested validation error', () => {
			const error: ContemberValidationError = {
				path: [{ field: 'articles' }, { index: 0, alias: null }, { field: 'title' }],
				message: { text: 'Title must be at least 3 characters' },
			}

			const result = mapValidationError(error, 'Author', schema)

			expect(result.type).toBe('relation')
			expect(result.name).toBe('articles')
			expect(result.path?.pathString).toBe('articles[0].title')
		})
	})

	describe('extractMappedErrors', () => {
		test('should extract all errors from mutation result', () => {
			const mutationResult: ContemberMutationResult = {
				ok: false,
				errorMessage: 'Mutation failed',
				errors: [
					{
						paths: [[{ field: 'title' }]],
						message: 'Title is required',
						type: 'NotNullConstraintViolation',
					},
					{
						paths: [[{ field: 'email' }]],
						message: 'Email must be unique',
						type: 'UniqueConstraintViolation',
					},
				],
				validation: {
					valid: false,
					errors: [
						{
							path: [{ field: 'content' }],
							message: { text: 'Content too short' },
						},
					],
				},
			}

			const result = extractMappedErrors(mutationResult, 'Article', schema)

			expect(result).toHaveLength(3)
			expect(result.map(e => e.name)).toEqual(['title', 'email', 'content'])
		})

		test('should handle mutation result with no errors', () => {
			const mutationResult: ContemberMutationResult = {
				ok: true,
				errorMessage: null,
				errors: [],
				validation: {
					valid: true,
					errors: [],
				},
			}

			const result = extractMappedErrors(mutationResult, 'Article', schema)

			expect(result).toHaveLength(0)
		})
	})

	describe('utility functions', () => {
		test('isNestedError should identify nested errors', () => {
			const nestedError: ContemberMutationError = {
				paths: [[{ field: 'tags' }, { index: 0, alias: null }, { field: 'name' }]],
				message: 'Error',
				type: 'InvalidDataInput',
			}

			const shallowError: ContemberMutationError = {
				paths: [[{ field: 'title' }]],
				message: 'Error',
				type: 'InvalidDataInput',
			}

			const nestedResult = mapMutationError(nestedError, 'Article', schema)[0]!
			const shallowResult = mapMutationError(shallowError, 'Article', schema)[0]!

			expect(isNestedError(nestedResult)).toBe(true)
			expect(isNestedError(shallowResult)).toBe(false)
		})

		test('getErrorPathString should return path string', () => {
			const error: ContemberMutationError = {
				paths: [[{ field: 'tags' }, { index: 1, alias: null }, { field: 'name' }]],
				message: 'Error',
				type: 'InvalidDataInput',
			}

			const result = mapMutationError(error, 'Article', schema)[0]!

			expect(getErrorPathString(result)).toBe('tags[1].name')
		})
	})
})

describe('error codes mapping', () => {
	test.each([
		['NotNullConstraintViolation', 'NOT_NULL'],
		['UniqueConstraintViolation', 'UNIQUE_CONSTRAINT'],
		['ForeignKeyConstraintViolation', 'FOREIGN_KEY'],
		['NotFoundOrDenied', 'NOT_FOUND'],
		['NonUniqueWhereInput', 'NON_UNIQUE_WHERE'],
		['InvalidDataInput', 'INVALID_DATA'],
		['SqlError', 'SQL_ERROR'],
	] as const)('should map %s to %s', (type, expectedCode) => {
		const error: ContemberMutationError = {
			paths: [[{ field: 'title' }]],
			message: 'Test error',
			type,
		}

		const result = mapMutationError(error, 'Article', schema)

		expect(result[0]!.error.code).toBe(expectedCode)
	})
})
