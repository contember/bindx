import { describe, test, expect } from 'bun:test'
import {
	resolveErrorPath,
	resolveAllErrors,
	type PathElement,
	type ContemberMutationResult,
	SchemaRegistry,
	SnapshotStore,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx'

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

function createContext(store: SnapshotStore) {
	return { schema, store }
}

describe('errorPathResolver', () => {
	describe('resolveErrorPath', () => {
		test('should resolve scalar field on root entity', () => {
			const store = new SnapshotStore()
			const path: PathElement[] = [{ field: 'title' }]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'title',
				type: 'field',
			})
		})

		test('should resolve has-one then scalar (author.name)', () => {
			const store = new SnapshotStore()
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const path: PathElement[] = [{ field: 'author' }, { field: 'name' }]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Author',
				entityId: 'auth-1',
				fieldName: 'name',
				type: 'field',
			})
		})

		test('should resolve has-many with alias then scalar (tags[0].name)', () => {
			const store = new SnapshotStore()

			const path: PathElement[] = [
				{ field: 'tags' },
				{ index: 0, alias: 'tag-42' },
				{ field: 'name' },
			]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Tag',
				entityId: 'tag-42',
				fieldName: 'name',
				type: 'field',
			})
		})

		test('should resolve has-many without alias using index-based lookup', () => {
			const store = new SnapshotStore()
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-10', 'tag-20'])

			const path: PathElement[] = [
				{ field: 'tags' },
				{ index: 1, alias: null },
				{ field: 'name' },
			]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Tag',
				entityId: 'tag-20',
				fieldName: 'name',
				type: 'field',
			})
		})

		test('should return relation error when has-one is the last element', () => {
			const store = new SnapshotStore()

			const path: PathElement[] = [{ field: 'author' }]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'author',
				type: 'relation',
			})
		})

		test('should return entity-level error for empty path', () => {
			const store = new SnapshotStore()

			const result = resolveErrorPath([], 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				type: 'entity',
			})
		})

		test('should fallback to relation error when has-one relation is null', () => {
			const store = new SnapshotStore()
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: null,
				serverId: null,
				state: 'disconnected',
				serverState: 'disconnected',
				placeholderData: {},
			})

			const path: PathElement[] = [{ field: 'author' }, { field: 'name' }]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'author',
				type: 'relation',
			})
		})

		test('should fallback to field error for unknown field', () => {
			const store = new SnapshotStore()

			const path: PathElement[] = [{ field: 'nonexistent' }]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'nonexistent',
				type: 'field',
			})
		})

		test('should fallback when has-many index is out of bounds and no alias', () => {
			const store = new SnapshotStore()
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1'])

			const path: PathElement[] = [
				{ field: 'tags' },
				{ index: 99, alias: null },
				{ field: 'name' },
			]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			// Can't resolve the index, falls back to relation error on parent
			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'tags',
				type: 'relation',
			})
		})

		test('should resolve deep nesting: has-one -> has-many with alias -> scalar', () => {
			const store = new SnapshotStore()
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const path: PathElement[] = [
				{ field: 'author' },
				{ field: 'articles' },
				{ index: 0, alias: 'art-5' },
				{ field: 'title' },
			]

			const result = resolveErrorPath(path, 'Article', 'a-1', createContext(store))

			expect(result).toEqual({
				entityType: 'Article',
				entityId: 'art-5',
				fieldName: 'title',
				type: 'field',
			})
		})
	})

	describe('resolveAllErrors', () => {
		test('should resolve mutation errors to specific entities', () => {
			const store = new SnapshotStore()
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const mutationResult: ContemberMutationResult = {
				ok: false,
				errorMessage: null,
				errors: [{
					paths: [[{ field: 'author' }, { field: 'name' }]],
					message: 'Name is required',
					type: 'NotNullConstraintViolation',
				}],
				validation: { valid: true, errors: [] },
			}

			const resolved = resolveAllErrors(mutationResult, 'Article', 'a-1', createContext(store))

			expect(resolved).toHaveLength(1)
			expect(resolved[0]!.target).toEqual({
				entityType: 'Author',
				entityId: 'auth-1',
				fieldName: 'name',
				type: 'field',
			})
			expect(resolved[0]!.error.message).toBe('Name is required')
			expect(resolved[0]!.error.source).toBe('server')
		})

		test('should resolve validation errors to specific entities', () => {
			const store = new SnapshotStore()

			const mutationResult: ContemberMutationResult = {
				ok: false,
				errorMessage: null,
				errors: [],
				validation: {
					valid: false,
					errors: [{
						path: [
							{ field: 'tags' },
							{ index: 0, alias: 'tag-1' },
							{ field: 'name' },
						],
						message: { text: 'Tag name must be unique' },
					}],
				},
			}

			const resolved = resolveAllErrors(mutationResult, 'Article', 'a-1', createContext(store))

			expect(resolved).toHaveLength(1)
			expect(resolved[0]!.target).toEqual({
				entityType: 'Tag',
				entityId: 'tag-1',
				fieldName: 'name',
				type: 'field',
			})
			expect(resolved[0]!.error.code).toBe('VALIDATION_ERROR')
		})

		test('should handle error with no paths as entity-level error', () => {
			const store = new SnapshotStore()

			const mutationResult: ContemberMutationResult = {
				ok: false,
				errorMessage: null,
				errors: [{
					paths: [],
					message: 'Something went wrong',
					type: 'SqlError',
				}],
				validation: { valid: true, errors: [] },
			}

			const resolved = resolveAllErrors(mutationResult, 'Article', 'a-1', createContext(store))

			expect(resolved).toHaveLength(1)
			expect(resolved[0]!.target).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				type: 'entity',
			})
		})

		test('should resolve multiple errors to different entities', () => {
			const store = new SnapshotStore()
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const mutationResult: ContemberMutationResult = {
				ok: false,
				errorMessage: null,
				errors: [
					{
						paths: [[{ field: 'title' }]],
						message: 'Title is required',
						type: 'NotNullConstraintViolation',
					},
					{
						paths: [[{ field: 'author' }, { field: 'email' }]],
						message: 'Email must be unique',
						type: 'UniqueConstraintViolation',
					},
				],
				validation: { valid: true, errors: [] },
			}

			const resolved = resolveAllErrors(mutationResult, 'Article', 'a-1', createContext(store))

			expect(resolved).toHaveLength(2)

			expect(resolved[0]!.target).toEqual({
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'title',
				type: 'field',
			})

			expect(resolved[1]!.target).toEqual({
				entityType: 'Author',
				entityId: 'auth-1',
				fieldName: 'email',
				type: 'field',
			})
		})
	})
})
