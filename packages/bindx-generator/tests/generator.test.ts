/**
 * Tests for bindx schema generator
 */
import { describe, test, expect } from 'bun:test'
import { Model, Acl } from '@contember/schema'
import {
	BindxGenerator,
	generate,
	EntityTypeSchemaGenerator,
	EnumTypeSchemaGenerator,
	NameSchemaGenerator,
	RoleSchemaGenerator,
	RoleNameSchemaGenerator,
} from '../src/index'

// Test model schema
const testModel: Model.Schema = {
	enums: {
		PostStatus: ['draft', 'published', 'archived'],
	},
	entities: {
		Author: {
			name: 'Author',
			primary: 'id',
			primaryColumn: 'id',
			tableName: 'author',
			fields: {
				id: {
					name: 'id',
					type: Model.ColumnType.Uuid,
					columnType: 'uuid',
					nullable: false,
					columnName: 'id',
				},
				name: {
					name: 'name',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: false,
					columnName: 'name',
				},
				email: {
					name: 'email',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: true,
					columnName: 'email',
				},
				salary: {
					name: 'salary',
					type: Model.ColumnType.Int,
					columnType: 'integer',
					nullable: true,
					columnName: 'salary',
				},
				posts: {
					name: 'posts',
					type: Model.RelationType.OneHasMany,
					target: 'Post',
					ownedBy: 'author',
				},
			},
			unique: [],
			indexes: [],
			eventLog: { enabled: true },
		},
		Post: {
			name: 'Post',
			primary: 'id',
			primaryColumn: 'id',
			tableName: 'post',
			fields: {
				id: {
					name: 'id',
					type: Model.ColumnType.Uuid,
					columnType: 'uuid',
					nullable: false,
					columnName: 'id',
				},
				title: {
					name: 'title',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: false,
					columnName: 'title',
				},
				content: {
					name: 'content',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: true,
					columnName: 'content',
				},
				status: {
					name: 'status',
					type: Model.ColumnType.Enum,
					columnType: 'PostStatus',
					nullable: false,
					columnName: 'status',
				},
				author: {
					name: 'author',
					type: Model.RelationType.ManyHasOne,
					target: 'Author',
					inversedBy: 'posts',
					nullable: false,
					joiningColumn: {
						columnName: 'author_id',
						onDelete: Model.OnDelete.restrict,
					},
				},
				tags: {
					name: 'tags',
					type: Model.RelationType.ManyHasMany,
					target: 'Tag',
					inversedBy: 'posts',
					joiningTable: {
						tableName: 'post_tags',
						joiningColumn: { columnName: 'post_id', onDelete: Model.OnDelete.cascade },
						inverseJoiningColumn: { columnName: 'tag_id', onDelete: Model.OnDelete.cascade },
						eventLog: { enabled: true },
					},
				},
			},
			unique: [],
			indexes: [],
			eventLog: { enabled: true },
		},
		Tag: {
			name: 'Tag',
			primary: 'id',
			primaryColumn: 'id',
			tableName: 'tag',
			fields: {
				id: {
					name: 'id',
					type: Model.ColumnType.Uuid,
					columnType: 'uuid',
					nullable: false,
					columnName: 'id',
				},
				name: {
					name: 'name',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: false,
					columnName: 'name',
				},
				posts: {
					name: 'posts',
					type: Model.RelationType.ManyHasMany,
					target: 'Post',
					ownedBy: 'tags',
				},
			},
			unique: [],
			indexes: [],
			eventLog: { enabled: true },
		},
	},
}

// Test ACL schema with multiple roles
const testAcl: Acl.Schema = {
	roles: {
		public: {
			stages: '*',
			entities: {
				Post: {
					predicates: {},
					operations: {
						read: {
							id: true,
							title: true,
							status: true,
							// No content, author, tags
						},
					},
				},
				Tag: {
					predicates: {},
					operations: {
						read: {
							id: true,
							name: true,
						},
					},
				},
				// Author is NOT accessible to public
			},
			variables: {},
		},
		editor: {
			stages: '*',
			entities: {
				Author: {
					predicates: {},
					operations: {
						read: {
							id: true,
							name: true,
							email: true,
							posts: true,
							// No salary
						},
					},
				},
				Post: {
					predicates: {},
					operations: {
						read: {
							id: true,
							title: true,
							content: true,
							status: true,
							author: true,
							tags: true,
						},
					},
				},
				Tag: {
					predicates: {},
					operations: {
						read: {
							id: true,
							name: true,
							posts: true,
						},
					},
				},
			},
			variables: {},
		},
		admin: {
			stages: '*',
			entities: {
				Author: {
					predicates: {},
					operations: {
						read: {
							id: true,
							name: true,
							email: true,
							salary: true,
							posts: true,
						},
					},
				},
				Post: {
					predicates: {},
					operations: {
						read: {
							id: true,
							title: true,
							content: true,
							status: true,
							author: true,
							tags: true,
						},
					},
				},
				Tag: {
					predicates: {},
					operations: {
						read: {
							id: true,
							name: true,
							posts: true,
						},
					},
				},
			},
			variables: {},
		},
	},
}

describe('EnumTypeSchemaGenerator', () => {
	test('generates enum types', () => {
		const generator = new EnumTypeSchemaGenerator()
		const code = generator.generate(testModel)

		expect(code).toContain("export type PostStatusEnum = 'draft' | 'published' | 'archived'")
		expect(code).toContain("export const PostStatusValues = ['draft', 'published', 'archived'] as const")
	})
})

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
		expect(schema.entities['Post']?.fields['title']).toEqual({ type: 'column' })
		expect(schema.enums['PostStatus']).toEqual(['draft', 'published', 'archived'])
	})
})

describe('EntityTypeSchemaGenerator', () => {
	test('generates entity types', () => {
		const generator = new EntityTypeSchemaGenerator()
		const code = generator.generate(testModel)

		// Check Author entity
		expect(code).toContain('export interface Author {')
		expect(code).toContain('id: string')
		expect(code).toContain('name: string')
		expect(code).toContain('email: string | null')
		expect(code).toContain('posts: Post[]')

		// Check Post entity
		expect(code).toContain('export interface Post {')
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

describe('RoleSchemaGenerator', () => {
	test('generates role-filtered entity types', () => {
		const generator = new RoleSchemaGenerator()
		const code = generator.generate(testModel, testAcl)

		// Public role - limited access
		expect(code).toContain('export interface PublicPost {')
		expect(code).toContain('id: string')
		expect(code).toContain('title: string')
		
		// Extract PublicPost interface to check it specifically
		const publicPostMatch = code.match(/export interface PublicPost \{[\s\S]*?^\}/m)
		expect(publicPostMatch).toBeTruthy()
		// Public Post should NOT have content (only accessible to editor/admin)
		expect(publicPostMatch![0]).not.toContain('content:')
		
		// Public should have Tag but not Author
		expect(code).toContain('export interface PublicTag {')
		expect(code).not.toContain('export interface PublicAuthor {')

		// Editor role - more access
		expect(code).toContain('export interface EditorPost {')
		expect(code).toContain('export interface EditorAuthor {')
		expect(code).toContain('export interface EditorTag {')
		
		// Editor Post should have content
		const editorPostMatch = code.match(/export interface EditorPost \{[\s\S]*?^\}/m)
		expect(editorPostMatch).toBeTruthy()
		expect(editorPostMatch![0]).toContain('content:')

		// Admin role - full access including salary
		expect(code).toContain('export interface AdminAuthor {')
		// Admin should have salary field
		expect(code).toMatch(/AdminAuthor[\s\S]*?salary/)

		// RoleSchemas mapping
		expect(code).toContain('export type RoleSchemas = {')
		expect(code).toContain('public: PublicSchema')
		expect(code).toContain('editor: EditorSchema')
		expect(code).toContain('admin: AdminSchema')
	})

	test('filters out relations to inaccessible entities', () => {
		const generator = new RoleSchemaGenerator()
		const code = generator.generate(testModel, testAcl)

		// Public Post should NOT have author relation (Author not accessible)
		const publicPostMatch = code.match(/export interface PublicPost \{[\s\S]*?^\}/m)
		expect(publicPostMatch).toBeTruthy()
		expect(publicPostMatch![0]).not.toContain('author:')
	})
})

describe('RoleNameSchemaGenerator', () => {
	test('generates role-filtered name schemas', () => {
		const generator = new RoleNameSchemaGenerator()
		const schemas = generator.generate(testModel, testAcl)

		// Public role
		expect(schemas['public']?.entities['Post']).toBeDefined()
		expect(schemas['public']?.entities['Post']?.scalars).toContain('id')
		expect(schemas['public']?.entities['Post']?.scalars).toContain('title')
		expect(schemas['public']?.entities['Post']?.scalars).not.toContain('content')
		expect(schemas['public']?.entities['Author']).toBeUndefined()
		// Editor role
		expect(schemas['editor']?.entities['Author']).toBeDefined()
		expect(schemas['editor']?.entities['Author']?.scalars).toContain('email')
		expect(schemas['editor']?.entities['Author']?.scalars).not.toContain('salary')
		// Admin role
		expect(schemas['admin']?.entities['Author']?.scalars).toContain('salary')
	})
})

describe('BindxGenerator', () => {
	test('generates files without ACL', () => {
		const generator = new BindxGenerator()
		const files = generator.generate(testModel)

		expect(files['entities.ts']).toBeDefined()
		expect(files['names.ts']).toBeDefined()
		expect(files['enums.ts']).toBeDefined()
		expect(files['types.ts']).toBeDefined()
		expect(files['index.ts']).toBeDefined()

		expect(files['index.ts']).toContain('createBindx')
		expect(files['index.ts']).toContain('useEntity')
	})

	test('generates files with role-based ACL', () => {
		const generator = new BindxGenerator()
		const files = generator.generateWithRoles(testModel, testAcl)

		expect(files['entities.ts']).toContain('RoleSchemas')
		expect(files['entities.ts']).toContain('PublicSchema')
		expect(files['entities.ts']).toContain('EditorSchema')
		expect(files['entities.ts']).toContain('AdminSchema')

		// names.ts is no longer generated for role-aware schemas
		expect(files['names.ts']).toBeUndefined()

		// index.ts now exports a factory function instead of the bindx instance directly
		expect(files['index.ts']).toContain('createRoleAwareBindx')
		expect(files['index.ts']).toContain('createBindx')
		expect(files['index.ts']).toContain('SchemaInput')
		expect(files['index.ts']).toContain('RoleAwareBindx<RoleSchemas>')
	})
})

describe('generate function', () => {
	test('generates without ACL', () => {
		const files = generate(testModel)
		expect(files['entities.ts']).toContain('BindxSchema')
	})

	test('generates with ACL', () => {
		const files = generate(testModel, testAcl)
		expect(files['entities.ts']).toContain('RoleSchemas')
	})
})
