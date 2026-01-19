/**
 * Tests for role-based schema type safety.
 *
 * These tests verify that the TypeScript type system correctly
 * narrows entity types based on roles.
 */

import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import React from 'react'
import { render, waitFor, cleanup } from '@testing-library/react'

afterEach(() => {
	cleanup()
})
import {
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	type SchemaDefinition,
	type RoleSchemaDefinitions,
	RoleSchemaRegistry,
	type IntersectRoleSchemas,
	type EntityForRoles,
	type RolesAreSubset,
	type EntityRef,
	AnyBrand,
} from '@contember/bindx'
import {
	createRoleAwareBindx,
	BindxProvider,
	MockAdapter,
} from '@contember/react-bindx'

/**
 * Helper to create mock EntityRef with $ prefixed properties.
 * This is needed because EntityRef interface now requires $ prefixed properties.
 */
function mockEntityRef<T extends object, TResult = T>(obj: T): TResult {
	const objWithAliases = obj as Record<string, unknown>
	// Add $ prefixed aliases for standard properties
	if ('data' in obj) objWithAliases['$data'] = objWithAliases['data']
	if ('fields' in obj) objWithAliases['$fields'] = objWithAliases['fields']
	if ('isDirty' in obj) objWithAliases['$isDirty'] = objWithAliases['isDirty']
	if ('isNew' in obj) objWithAliases['$isNew'] = objWithAliases['isNew']
	if ('persistedId' in obj) objWithAliases['$persistedId'] = objWithAliases['persistedId']
	if ('errors' in obj) objWithAliases['$errors'] = objWithAliases['errors']
	if ('hasError' in obj) objWithAliases['$hasError'] = objWithAliases['hasError']
	return obj as unknown as TResult
}

// ============================================================================
// Test Schema Definitions
// ============================================================================

// Public view - minimal fields
interface PublicArticle {
	id: string
	title: string
}

interface PublicAuthor {
	id: string
	name: string
}

// Editor view - more fields
interface EditorArticle {
	id: string
	title: string
	content: string
	author: EditorAuthor
}

interface EditorAuthor {
	id: string
	name: string
	email: string
}

// Admin view - all fields
interface AdminArticle {
	id: string
	title: string
	content: string
	author: AdminAuthor
	internalNotes: string
}

interface AdminAuthor {
	id: string
	name: string
	email: string
	salary: number
}

// Role schema mapping
interface RoleSchemas {
	public: {
		Article: PublicArticle
		Author: PublicAuthor
	}
	editor: {
		Article: EditorArticle
		Author: EditorAuthor
	}
	admin: {
		Article: AdminArticle
		Author: AdminAuthor
	}
}

// Schema definitions
const publicSchema = defineSchema<RoleSchemas['public']>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const editorSchema = defineSchema<RoleSchemas['editor']>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author'),
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

const adminSchema = defineSchema<RoleSchemas['admin']>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author'),
				internalNotes: scalar(),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				salary: scalar(),
			},
		},
	},
})

// ============================================================================
// Type-Level Tests
// ============================================================================

describe('Role Schema Types', () => {
	test('IntersectRoleSchemas creates correct intersection type', () => {
		// This is a compile-time test - if it compiles, the types are correct

		// Single role - should be exactly that role's schema
		type PublicOnly = IntersectRoleSchemas<RoleSchemas, ['public']>
		// @ts-expect-error - content doesn't exist on PublicArticle
		const _publicArticleContent: PublicOnly['Article']['content'] = 'test'

		// PublicArticle has title
		const _publicArticleTitle: PublicOnly['Article']['title'] = 'test'

		expect(true).toBe(true) // Compile-time test passed
	})

	test('EntityForRoles extracts correct entity type', () => {
		// Single role
		type PublicArticleType = EntityForRoles<RoleSchemas, ['public'], 'Article'>
		const publicArticle: PublicArticleType = { id: '1', title: 'Test' }

		// @ts-expect-error - content doesn't exist on PublicArticle
		const _badPublicArticle: PublicArticleType = { id: '1', title: 'Test', content: 'nope' }

		expect(publicArticle.title).toBe('Test')
	})

	test('HasRole type constrains roles to available scope', () => {
		// This is a compile-time test for HasRoleComponent type constraint
		// Available roles are now extracted from EntityRef, not passed separately
		// The constraint is enforced when calling HasRole with an entity that has specific available roles

		// Type-level test: HasRoleComponent takes just RoleSchemas
		type TestHasRole = import('@contember/react-bindx').HasRoleComponent<RoleSchemas>

		// HasRoleComponent is properly typed
		const _hasRole: TestHasRole = (() => null) as TestHasRole

		expect(true).toBe(true) // Compile-time test passed
	})

	test('RoleSchemaRegistry correctly manages schemas', () => {
		const schemas: RoleSchemaDefinitions<RoleSchemas> = {
			public: publicSchema,
			editor: editorSchema,
			admin: adminSchema,
		}

		const registry = new RoleSchemaRegistry(schemas)

		// Check role names
		expect(registry.getRoleNames()).toContain('public')
		expect(registry.getRoleNames()).toContain('editor')
		expect(registry.getRoleNames()).toContain('admin')

		// Check fields for single role
		const publicFields = registry.getFieldsForRoles(['public'], 'Article')
		expect(publicFields).toContain('id')
		expect(publicFields).toContain('title')
		expect(publicFields).not.toContain('content')
		expect(publicFields).not.toContain('internalNotes')

		// Check fields for editor
		const editorFields = registry.getFieldsForRoles(['editor'], 'Article')
		expect(editorFields).toContain('id')
		expect(editorFields).toContain('title')
		expect(editorFields).toContain('content')
		expect(editorFields).toContain('author')
		expect(editorFields).not.toContain('internalNotes')

		// Check intersection (public AND editor = only common fields)
		const intersectionFields = registry.getFieldsForRoles(['public', 'editor'], 'Article')
		expect(intersectionFields).toContain('id')
		expect(intersectionFields).toContain('title')
		// content is only in editor, not in public
		expect(intersectionFields).not.toContain('content')
	})

	test('isFieldAccessible correctly checks field access', () => {
		const schemas: RoleSchemaDefinitions<RoleSchemas> = {
			public: publicSchema,
			editor: editorSchema,
			admin: adminSchema,
		}

		const registry = new RoleSchemaRegistry(schemas)

		// Public can access title
		expect(registry.isFieldAccessible(['public'], 'Article', 'title')).toBe(true)

		// Public cannot access content
		expect(registry.isFieldAccessible(['public'], 'Article', 'content')).toBe(false)

		// Editor can access content
		expect(registry.isFieldAccessible(['editor'], 'Article', 'content')).toBe(true)

		// Admin can access internalNotes
		expect(registry.isFieldAccessible(['admin'], 'Article', 'internalNotes')).toBe(true)

		// Editor cannot access internalNotes
		expect(registry.isFieldAccessible(['editor'], 'Article', 'internalNotes')).toBe(false)
	})
})

// ============================================================================
// Component Tests
// ============================================================================

describe('createRoleAwareBindx', () => {
	test('creates role-aware bindx instance', () => {
		// Use the admin schema (most complete) as the single schema
		const { schemaRegistry, RoleAwareProvider, Entity, HasRole, useEntity } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		expect(schemaRegistry).toBeDefined()
		expect(RoleAwareProvider).toBeInstanceOf(Function)
		// Entity is memo-wrapped
		expect(Entity).toBeDefined()
		expect((Entity as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
		// HasRole is also memo-wrapped
		expect(HasRole).toBeDefined()
		expect((HasRole as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
		expect(useEntity).toBeInstanceOf(Function)
	})

	test('Entity with roles provides typed entity', async () => {
		const { RoleAwareProvider, Entity, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const mockData = {
			Article: {
				'article-1': {
					id: 'article-1',
					title: 'Test Article',
					content: 'Test content',
					internalNotes: 'Secret notes',
					author: { id: 'author-1' },
				},
			},
			Author: {
				'author-1': {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
					salary: 50000,
				},
			},
		}

		const adapter = new MockAdapter(mockData)
		const userRoles = new Set(['editor']) // User only has editor role, not admin

		function TestComponent() {
			return (
				<BindxProvider adapter={adapter}>
					<RoleAwareProvider hasRole={(role) => userRoles.has(role)}>
						<Entity name="Article" by={{ id: 'article-1' }} roles={['editor', 'admin'] as const}>
							{(article) => (
								<div>
									<span data-testid="title">{article.$data?.title}</span>
									{/* article has intersection of editor ∩ admin */}
									<span data-testid="content">{article.$data?.content}</span>

									{/* HasRole narrows to just admin - but user doesn't have it */}
									<HasRole roles={['admin']} entity={article}>
										{(adminArticle) => (
											<span data-testid="admin-notes">
												{adminArticle.$data?.internalNotes}
											</span>
										)}
									</HasRole>
								</div>
							)}
						</Entity>
					</RoleAwareProvider>
				</BindxProvider>
			)
		}

		const { container } = render(<TestComponent />)

		// Wait for data to load
		await waitFor(() => {
			const title = container.querySelector('[data-testid="title"]')
			expect(title).toBeTruthy()
		})

		// HasRole should not render because user doesn't have admin role
		const adminNotes = container.querySelector('[data-testid="admin-notes"]')
		expect(adminNotes).toBeFalsy()
	})

	test('HasRole renders when user has the role', async () => {
		const { RoleAwareProvider, Entity, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const mockData = {
			Article: {
				'article-1': {
					id: 'article-1',
					title: 'Test Article',
					content: 'Test content',
					internalNotes: 'Secret notes',
				},
			},
		}

		const adapter = new MockAdapter(mockData)
		const userRoles = new Set(['editor', 'admin']) // User has both roles

		function TestComponent() {
			return (
				<BindxProvider adapter={adapter}>
					<RoleAwareProvider hasRole={(role) => userRoles.has(role)}>
						<Entity name="Article" by={{ id: 'article-1' }} roles={['editor', 'admin']}>
							{(article) => (
								<div>
									<span data-testid="title">{article.title.value}</span>
									{/* internalNotes is NOT in editor schema, only in admin - with intersection it should error */}
									{/* @ts-expect-error - internalNotes doesn't exist in intersection of editor ∩ admin (editor doesn't have it) */}
									<span data-testid="title">{article.$data?.internalNotes}</span>

									<HasRole roles={['admin']} entity={article}>
										{(adminArticle) => (
											<span data-testid="admin-notes">
												{adminArticle.$data?.internalNotes}
											</span>
										)}
									</HasRole>

									<HasRole roles={['editor']} entity={article}>
										{(editorArticle) => (
											<span data-testid="editor-content">
												{/* EditorArticle has content but not internalNotes */}
												{editorArticle.$data?.content}
											</span>
										)}
									</HasRole>
								</div>
							)}
						</Entity>
					</RoleAwareProvider>
				</BindxProvider>
			)
		}

		const { container } = render(<TestComponent />)

		// Wait for data to load
		await waitFor(() => {
			const title = container.querySelector('[data-testid="title"]')
			expect(title).toBeTruthy()
		})

		// HasRole SHOULD render because user has admin role
		await waitFor(() => {
			const adminNotes = container.querySelector('[data-testid="admin-notes"]')
			expect(adminNotes).toBeTruthy()
		})
	})

	test('RoleSchemaRegistry validates available roles', () => {
		// Test the underlying validation logic via RoleSchemaRegistry
		const schemas: RoleSchemaDefinitions<RoleSchemas> = {
			public: publicSchema,
			editor: editorSchema,
			admin: adminSchema,
		}

		const registry = new RoleSchemaRegistry(schemas)

		// Test that fields are only accessible when role is available
		// public role only has id and title for Article
		expect(registry.isFieldAccessible(['public'], 'Article', 'title')).toBe(true)
		expect(registry.isFieldAccessible(['public'], 'Article', 'content')).toBe(false)
		expect(registry.isFieldAccessible(['public'], 'Article', 'internalNotes')).toBe(false)

		// admin role has internalNotes
		expect(registry.isFieldAccessible(['admin'], 'Article', 'internalNotes')).toBe(true)

		// intersection of public + admin = only fields in BOTH = id, title
		expect(registry.isFieldAccessible(['public', 'admin'], 'Article', 'title')).toBe(true)
		expect(registry.isFieldAccessible(['public', 'admin'], 'Article', 'internalNotes')).toBe(false)
	})

	test('nested HasRole restricts available roles', async () => {
		const { RoleAwareProvider, Entity, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const mockData = {
			Article: {
				'article-1': {
					id: 'article-1',
					title: 'Test Article',
					content: 'Content',
					internalNotes: 'Notes',
				},
			},
		}

		const adapter = new MockAdapter(mockData)
		const userRoles = new Set(['public', 'editor', 'admin'])

		function TestComponent() {
			return (
				<BindxProvider adapter={adapter}>
					<RoleAwareProvider hasRole={(role) => userRoles.has(role)}>
						<Entity name="Article" by={{ id: 'article-1' }} roles={['public', 'editor', 'admin'] as const}>
							{(article) => (
								<div>
									<span data-testid="title">{article.$data?.title}</span>

									{/* First HasRole narrows to editor+admin */}
									<HasRole roles={['editor', 'admin']} entity={article}>
										{(editorAdminArticle) => (
											<div>
												<span data-testid="content">{editorAdminArticle.$data?.content}</span>

												{/* Nested HasRole - can only use editor or admin, not public */}
												<HasRole roles={['admin']} entity={editorAdminArticle}>
													{(adminArticle) => (
														<span data-testid="notes">{adminArticle.$data?.internalNotes}</span>
													)}
												</HasRole>
											</div>
										)}
									</HasRole>
								</div>
							)}
						</Entity>
					</RoleAwareProvider>
				</BindxProvider>
			)
		}

		const { container } = render(<TestComponent />)

		// Wait for data and check nested content renders
		await waitFor(() => {
			expect(container.querySelector('[data-testid="title"]')).toBeTruthy()
			expect(container.querySelector('[data-testid="content"]')).toBeTruthy()
			expect(container.querySelector('[data-testid="notes"]')).toBeTruthy()
		})
	})
})

// ============================================================================
// Role-Aware createComponent Tests
// ============================================================================

describe('Role-aware createComponent', () => {
	test('RolesAreSubset type utility works correctly', () => {
		// Compile-time test - if it compiles, the types are correct

		// ['admin'] is subset of ['admin']
		type Test1 = RolesAreSubset<['admin'], ['admin']>
		const _test1: Test1 = true

		// ['admin'] is subset of ['editor', 'admin']
		type Test2 = RolesAreSubset<['admin'], ['editor', 'admin']>
		const _test2: Test2 = true

		// [] is subset of any
		type Test3 = RolesAreSubset<[], ['editor', 'admin']>
		const _test3: Test3 = true

		// ['admin'] is NOT subset of ['editor']
		type Test4 = RolesAreSubset<['admin'], ['editor']>
		const _test4: Test4 = false

		// ['admin', 'editor'] is subset of ['public', 'editor', 'admin']
		type Test5 = RolesAreSubset<['admin', 'editor'], ['public', 'editor', 'admin']>
		const _test5: Test5 = true

		// Type-level negative tests - these should not be assignable
		// @ts-expect-error - false is not assignable to true (admin is not subset of editor)
		const _test6: RolesAreSubset<['admin'], ['editor']> = true

		// @ts-expect-error - false is not assignable to true (public is not in editor, admin)
		const _test7: RolesAreSubset<['public'], ['editor', 'admin']> = true

		expect(true).toBe(true) // Compile-time test passed
	})

	test('RolesAreSubset rejects incompatible role combinations', () => {
		// These type assertions verify that RolesAreSubset returns false for incompatible combinations

		// ['admin', 'superadmin'] where superadmin doesn't exist in available
		type Test1 = RolesAreSubset<['admin', 'superadmin'], ['public', 'editor', 'admin']>
		const _test1: Test1 = false

		// @ts-expect-error - cannot assign true because superadmin is not in available roles
		const _test1_bad: Test1 = true

		expect(true).toBe(true)
	})

	test('createComponent returns component with correct type', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create an admin-only component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id().title().internalNotes())
			.render(({ article }) => (
				<div>
					<span>{article.$data?.title}</span>
				</div>
			))

		// Component should have $article fragment property
		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminArticleCard.$article.__isFragment).toBe(true)
		expect(AdminArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('createComponent fragment has correct role info', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with multiple roles using the new builder API
		const EditorAdminCard = createComponent({ roles: ['editor', 'admin'] })
			.entity('article', 'Article', e => e.id().title())
			.render(({ article }) => (
				<div>{article.$fields.title.value}</div>
			))

		// Fragment should carry role information
		const fragment = EditorAdminCard.$article
		expect(fragment.__roles).toEqual(['editor', 'admin'])
		expect(fragment.__availableRoles).toEqual(['editor', 'admin'])
	})

	test('createComponent with scalar props works', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with scalar props using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id().title())
			.props<{ showNotes?: boolean }>()
			.render(({ article, showNotes }) => (
				<div>
					<span>{article.$data?.title}</span>
					{showNotes && <span>Notes visible</span>}
				</div>
			))

		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('component fragment type correctly narrows entity access', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create an admin-only component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id().title().internalNotes())
			.render(({ article }) => (
				<div>
					{/* article.$data should have internalNotes */}
					<span>{article.$data?.title}</span>
					<span>{article.$data?.internalNotes}</span>
				</div>
			))

		expect(AdminArticleCard.$article).toBeDefined()
	})

	test('createComponent type restricts to valid entity names for roles', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// This should compile - Article exists in admin schema
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id())
			.render(({ article }) => <div>{article.$data?.id}</div>)

		// This should compile - Author exists in admin schema
		const AdminAuthorCard = createComponent({ roles: ['admin'] as const })
			.entity('author', 'Author', e => e.id().name())
			.render(({ author }) => <div>{author.$data?.name}</div>)

		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminAuthorCard.$author).toBeDefined()
	})

	test('fragment carries type-level role information for validation', () => {
		// This is a compile-time test
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const AdminCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id())
			.render(({ article }) => <div>{article.$data?.id}</div>)

		// The fragment should have ['admin'] as its available roles at type level
		type FragmentRoles = typeof AdminCard.$article extends { __availableRoles?: infer R } ? R : never
		// At runtime, __availableRoles is set
		expect(AdminCard.$article.__availableRoles).toEqual(['admin'])
	})

	test('type error: public role cannot access admin-only fields', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create a public-only component using the new builder API
		// The @ts-expect-error is on the selector - article.data type becomes invalid due to the error
		const PublicArticleCard = createComponent({ roles: ['public'] as const })
			.entity('article', 'Article', e => e
				.id()
				.title()
				// @ts-expect-error - 'internalNotes' does not exist on PublicArticle (only on AdminArticle)
				.internalNotes())
			.render(({ article }) => <div>{article.id}</div>)

		expect(PublicArticleCard.$article).toBeDefined()
	})

	test('type error: editor role cannot access admin-only fields', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create an editor-only component using the new builder API
		// The @ts-expect-error is on the selector - article.data type becomes invalid due to the error
		const EditorArticleCard = createComponent({ roles: ['editor'] as const })
			.entity('article', 'Article', e => e
				.id()
				.title()
				.content() // OK - editor has content
				// @ts-expect-error - 'internalNotes' does not exist on EditorArticle (only on AdminArticle)
				.internalNotes())
			.render(({ article }) => <div>{article.id}</div>)

		expect(EditorArticleCard.$article).toBeDefined()
	})

	test('type error: public role cannot access editor field (content)', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// The @ts-expect-error is on the selector - article.data type becomes invalid due to the error
		const PublicArticleCard = createComponent({ roles: ['public'] as const })
			.entity('article', 'Article', e => e
				.id()
				.title()
				// @ts-expect-error - 'content' does not exist on PublicArticle
				.content())
			.render(({ article }) => <div>{article.id}</div>)

		expect(PublicArticleCard.$article).toBeDefined()
	})

	test('type error: public role cannot access author relation', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// The @ts-expect-error is on the selector - article.data type becomes invalid due to the error
		const PublicArticleCard = createComponent({ roles: ['public'] as const })
			.entity('article', 'Article', e => e
				.id()
				.title()
				// @ts-expect-error - 'author' relation does not exist on PublicArticle
				.author((a: any) => a.name()))
			.render(({ article }) => <div>{article.id}</div>)

		expect(PublicArticleCard.$article).toBeDefined()
	})

	test('type error: admin Author fields not accessible from editor role', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// The @ts-expect-error is on the selector - author.data type becomes invalid due to the error
		const EditorAuthorCard = createComponent({ roles: ['editor'] as const })
			.entity('author', 'Author', e => e
				.id()
				.name()
				.email() // OK - editor has email
				// @ts-expect-error - 'salary' does not exist on EditorAuthor (only on AdminAuthor)
				.salary())
			.render(({ author }) => <div>{author.id}</div>)

		expect(EditorAuthorCard.$author).toBeDefined()
	})

	test('type error: invalid role name is rejected', () => {
		const { createComponent: _createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Verify that invalid roles are rejected at the type level
		// @ts-expect-error - 'superadmin' is not a valid role in RoleSchemas
		const invalidRoles: readonly ('public' | 'editor' | 'admin')[] = ['superadmin'] as const

		expect(true).toBe(true)
	})

	test('type error: component props require matching role EntityRef', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create admin-only component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id().title().internalNotes())
			.render(({ article }) => (
				<div>
					<span>{article.$data?.title}</span>
					<span>{article.$data?.internalNotes}</span>
				</div>
			))

		// Create a mock EntityRef with only editor roles
		const editorOnlyEntityRef: EntityRef<EditorArticle, EditorArticle, any, 'Article', readonly ['editor']> = mockEntityRef({
			id: 'article-1',
			fields: {} as any,
			data: { id: 'article-1', title: 'Test', content: 'Content', author: {} as any },
			isDirty: false,
			persistedId: 'article-1',
			isNew: false,
			__entityType: {} as EditorArticle,
			__entityName: 'Article',
			__availableRoles: ['editor'] as const,
			errors: [],
			hasError: false,
			addError: () => {},
			clearErrors: () => {},
			clearAllErrors: () => {},
			on: () => () => {},
			intercept: () => () => {},
			onPersisted: () => () => {},
			interceptPersisting: () => () => {},
		})

		// Define what the component expects
		type ExpectedArticleRef = EntityRef<
			AdminArticle,
			{ id: string; title: string; internalNotes: string },
			any,
			string,
			readonly ['admin']
		>

		// This should error because EditorArticle doesn't have internalNotes
		// @ts-expect-error - EditorArticle doesn't satisfy AdminArticle requirements (missing internalNotes)
		const _assignmentTest: ExpectedArticleRef = editorOnlyEntityRef

		expect(true).toBe(true)
	})

	test('component props accept EntityRef with superset of required roles', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create admin-only component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id().title())
			.render(({ article }) => <div>{article.$data?.title}</div>)

		// Create a mock EntityRef with admin + editor roles (superset of required ['admin'])
		const adminEditorEntityRef: EntityRef<AdminArticle, { id: string; title: string }, any, 'Article', readonly ['admin', 'editor']> = mockEntityRef({
			id: 'article-1',
			fields: {} as any,
			data: { id: 'article-1', title: 'Test' },
			isDirty: false,
			persistedId: 'article-1',
			isNew: false,
			__entityType: {} as AdminArticle,
			__entityName: 'Article',
			__availableRoles: ['admin', 'editor'] as const,
			errors: [],
			hasError: false,
			addError: () => {},
			clearErrors: () => {},
			clearAllErrors: () => {},
			on: () => () => {},
			intercept: () => () => {},
			onPersisted: () => () => {},
			interceptPersisting: () => () => {},
		})

		// This should work - ['admin'] is subset of ['admin', 'editor']
		// Note: The actual type check depends on how component props are typed
		// The fragment itself carries the role info, and the EntityRef needs to have compatible roles

		expect(AdminArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('component with multiple supported roles accepts EntityRef from single role context (covariance)', () => {
		// Test that EntityRef with ['admin'] is assignable to EntityRef with ['admin', 'editor']
		// This is important for using components in narrower role contexts

		// Create EntityRef from admin-only context
		const adminOnlyEntityRef: EntityRef<AdminArticle, { id: string; title: string }, AnyBrand, 'Article', readonly ['admin']> = mockEntityRef({
			id: 'article-1',
			fields: {} as any,
			data: { id: 'article-1', title: 'Test' },
			isDirty: false,
			persistedId: 'article-1',
			isNew: false,
			__entityType: {} as AdminArticle,
			__entityName: 'Article',
			__availableRoles: ['admin'],
			errors: [],
			hasError: false,
			addError: () => {},
			clearErrors: () => {},
			clearAllErrors: () => {},
			on: () => () => {},
			intercept: () => () => {},
			onPersisted: () => () => {},
			interceptPersisting: () => () => {},
		})

		// Define what a component with ['admin', 'editor'] roles would expect
		type MultiRoleEntityRef = EntityRef<AdminArticle, { id: string; title: string }, AnyBrand, 'Article', readonly ['admin', 'editor']>

		// This should work: EntityRef<..., ['admin']> is assignable to EntityRef<..., ['admin', 'editor']>
		// because readonly 'admin'[] is assignable to readonly ('admin' | 'editor')[]
		const _typeTest: MultiRoleEntityRef = adminOnlyEntityRef

		expect(true).toBe(true)
	})

	test('fragment role info is preserved in type system', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const AdminCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id())
			.render(({ article }) => <div>{article.$data?.id}</div>)

		// Type-level check: fragment should have ['admin'] as available roles
		type FragmentType = typeof AdminCard.$article
		type FragmentRoles = FragmentType['__availableRoles']

		// This should compile - FragmentRoles should be ['admin']
		const _rolesCheck: FragmentRoles = ['admin'] as const

		// @ts-expect-error - ['editor'] is not assignable to ['admin']
		const _badRolesCheck: FragmentRoles = ['editor'] as const

		expect(true).toBe(true)
	})

	test('IntersectRoleSchemas type combines all schemas', () => {
		// IntersectRoleSchemas uses TypeScript's intersection (&) which combines all properties
		// This means the intersected type has ALL properties from ALL schemas
		// (This is different from runtime field intersection in RoleSchemaRegistry)

		// PublicArticle has: id, title
		// EditorArticle has: id, title, content, author
		// TypeScript intersection (PublicArticle & EditorArticle) has: id, title, content, author

		type PublicEditorIntersection = IntersectRoleSchemas<RoleSchemas, ['public', 'editor']>
		type IntersectedArticle = PublicEditorIntersection['Article']

		// These should exist in the intersection
		type HasId = IntersectedArticle extends { id: string } ? true : false
		const _hasId: HasId = true

		type HasTitle = IntersectedArticle extends { title: string } ? true : false
		const _hasTitle: HasTitle = true

		// With proper intersection, content should NOT be in the result
		// because PublicArticle doesn't have content field
		type HasContent = IntersectedArticle extends { content: string } ? true : false
		const _hasContent: HasContent = false // content is NOT in public, so not in intersection

		expect(true).toBe(true)
	})

	test('runtime and type intersection are now consistent', () => {
		// Both runtime and type-level now correctly compute field intersection

		const schemas: RoleSchemaDefinitions<RoleSchemas> = {
			public: publicSchema,
			editor: editorSchema,
			admin: adminSchema,
		}

		const registry = new RoleSchemaRegistry(schemas)

		// Runtime: getFieldsForRoles returns ONLY common fields
		const intersectionFields = registry.getFieldsForRoles(['public', 'editor'], 'Article')
		expect(intersectionFields).toContain('id')
		expect(intersectionFields).toContain('title')
		expect(intersectionFields).not.toContain('content') // NOT in public

		// Type level: IntersectRoleSchemas now correctly returns only common fields
		// This matches the runtime behavior
		type PublicEditorIntersection = IntersectRoleSchemas<RoleSchemas, ['public', 'editor']>
		type IntersectedArticle = PublicEditorIntersection['Article']

		// Verify type-level intersection matches runtime
		type HasId = IntersectedArticle extends { id: string } ? true : false
		type HasTitle = IntersectedArticle extends { title: string } ? true : false
		type HasContent = IntersectedArticle extends { content: string } ? true : false

		const _hasId: HasId = true
		const _hasTitle: HasTitle = true
		const _hasContent: HasContent = false // content is only in editor, not in public

		expect(true).toBe(true)
	})
})

// ============================================================================
// Role-Aware Implicit Component Tests
// ============================================================================

describe('Role-aware implicit createComponent', () => {
	test('EntityRefFor creates correct type for admin role', () => {
		// Type-level test: EntityRefFor should create a correctly typed EntityRef

		// Import EntityRefFor (already imported via @contember/bindx)
		type AdminArticleRef = import('@contember/bindx').EntityRefFor<RoleSchemas, ['admin'], 'Article'>

		// The ref should have __availableRoles type
		type AvailableRoles = AdminArticleRef['__availableRoles']
		const _checkRoles: AvailableRoles = ['admin']

		// The ref should have __entityName type
		type EntityName = AdminArticleRef['__entityName']
		const _checkName: EntityName = 'Article'

		// The ref's $fields should have internalNotes (admin-only field)
		type HasInternalNotes = AdminArticleRef['$fields'] extends { internalNotes: unknown } ? true : false
		const _hasNotes: HasInternalNotes = true

		expect(true).toBe(true) // Compile-time test passed
	})

	test('EntityRefFor with public role does not have admin fields', () => {
		// Type-level test: public role shouldn't have admin-only fields

		type PublicArticleRef = import('@contember/bindx').EntityRefFor<RoleSchemas, ['public'], 'Article'>

		// @ts-expect-error - internalNotes should not exist on public entity
		type HasInternalNotes = PublicArticleRef['$fields']['internalNotes']

		// Public should have title
		type HasTitle = PublicArticleRef['$fields'] extends { title: unknown } ? true : false
		const _hasTitle: HasTitle = true

		expect(true).toBe(true) // Compile-time test passed
	})

	test('implicit component with roles collects selections from JSX', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create implicit component with roles using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					<span data-testid="title">{article.$fields.title.value}</span>
					<span data-testid="notes">{article.$fields.internalNotes.value}</span>
				</div>
			))

		// Component should have $article fragment property
		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminArticleCard.$article.__isFragment).toBe(true)
	})

	test('implicit component fragment has correct role info', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create implicit component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>{article.$fields.title.value}</div>
			))

		// Fragment should carry role information
		const fragment = AdminArticleCard.$article
		expect(fragment.__roles).toEqual(['admin'])
		expect(fragment.__availableRoles).toEqual(['admin'])
	})

	test('implicit component with multiple roles', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create implicit component with multiple roles using the new builder API
		const EditorAdminCard = createComponent({ roles: ['editor', 'admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					<span>{article.$fields.title.value}</span>
					<span>{article.$fields.content.value}</span>
				</div>
			))

		// Fragment should carry multiple roles
		expect(EditorAdminCard.$article.__roles).toEqual(['editor', 'admin'])
	})

	test('implicit component has __componentRoles property', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create implicit component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>{article.$fields.title.value}</div>
			))

		// Component should have __componentRoles
		expect((AdminArticleCard as unknown as { __componentRoles: string[] }).__componentRoles).toEqual(['admin'])
	})

	test('implicit component selection contains accessed fields', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create implicit component using the new builder API
		const AdminArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					<span>{article.$fields.title.value}</span>
					<span>{article.$fields.internalNotes.value}</span>
				</div>
			))

		// Fragment should have selection metadata
		const fragment = AdminArticleCard.$article
		expect(fragment.__meta).toBeDefined()
		expect(fragment.__meta.fields).toBeDefined()

		// Selection should contain the accessed fields
		const fieldNames = Array.from(fragment.__meta.fields.values()).map(f => f.fieldName)
		expect(fieldNames).toContain('title')
		expect(fieldNames).toContain('internalNotes')
	})

	test('EntityRefFor type is exported from react-bindx', () => {
		// This test verifies that EntityRefFor is properly exported
		// If the import works, the test passes

		// Import from react-bindx roles
		type TestRef = import('@contember/react-bindx').EntityRefFor<RoleSchemas, ['admin'], 'Article'>

		// Should be a valid EntityRef type
		type HasId = TestRef extends { id: string | null } ? true : false
		const _hasId: HasId = true

		expect(true).toBe(true)
	})
})

// ============================================================================
// HasRole inside createComponent Tests
// ============================================================================

describe('HasRole inside createComponent', () => {
	test('HasRole inside createComponent preserves entity type', () => {
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with HasRole inside
		const ArticleWithAdmin = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					<span>{article.$fields.title.value}</span>
					<HasRole roles={['admin']} entity={article}>
						{(adminArticle) => (
							// adminArticle should have AdminArticle type with internalNotes field
							<span>{adminArticle.$fields.internalNotes.value}</span>
						)}
					</HasRole>
				</div>
			))

		expect(ArticleWithAdmin.$article).toBeDefined()
	})

	test('HasRole inside createComponent narrows available roles', () => {
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with editor+admin roles
		// Note: Entity type uses PickCommonProperties, so only common fields (title) are accessible
		const ArticleCard = createComponent({ roles: ['editor', 'admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					{/* article has common fields of editor & admin (title is common to all) */}
					<span>{article.$fields.title.value}</span>

					{/* HasRole narrows available roles - entity type falls back to input since name is string */}
					<HasRole roles={['admin']} entity={article}>
						{(adminArticle) => (
							// adminArticle still has common fields (entity name is unknown, so no schema lookup)
							<span>{adminArticle.$fields.title.value}</span>
						)}
					</HasRole>

					<HasRole roles={['editor']} entity={article}>
						{(editorArticle) => (
							<span>{editorArticle.$fields.title.value}</span>
						)}
					</HasRole>
				</div>
			))

		expect(ArticleCard.$article).toBeDefined()
	})

	test('HasRole children entity type inherits from input', () => {
		// Type-level test: entity name is string (from createComponent), so HasRole uses fallback type
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const TestComponent = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					{/* Access a field to ensure selection is collected */}
					<span>{article.$fields.title.value}</span>
					<HasRole roles={['admin']} entity={article}>
						{(adminArticle) => {
							// Entity name is preserved as literal from the component's entity prop
							type EntityNameType = typeof adminArticle.__entityName
							const _nameCheck: EntityNameType = 'Article'
							// Can access fields from the admin role (via entity type fallback)
							return <span>{adminArticle.$data?.internalNotes}</span>
						}}
					</HasRole>
				</div>
			))

		expect(TestComponent.$article).toBeDefined()
	})

	test('type error: HasRole with unavailable role inside createComponent', () => {
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with only editor role
		const EditorComponent = createComponent({ roles: ['editor'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					{/* Access a field to ensure selection is collected */}
					<span>{article.$fields.title.value}</span>
					{/* @ts-expect-error - 'admin' is not in available roles ['editor'] */}
					<HasRole roles={['admin']} entity={article}>
						{(adminArticle) => <span>{adminArticle.$data?.title}</span>}
					</HasRole>
				</div>
			))

		expect(EditorComponent.$article).toBeDefined()
	})

	test('nested HasRole inside createComponent narrows available roles', () => {
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with all three roles
		// Note: Entity type uses PickCommonProperties, so only title is accessible
		const FullAccessComponent = createComponent({ roles: ['public', 'editor', 'admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					<span>{article.$fields.title.value}</span>
					{/* First level: narrow available roles to editor+admin */}
					<HasRole roles={['editor', 'admin']} entity={article}>
						{(editorAdminArticle) => (
							<div>
								{/* Entity type is fallback (common fields), access common fields */}
								<span>{editorAdminArticle.$fields.title.value}</span>
								{/* Second level: narrow further to admin only */}
								<HasRole roles={['admin']} entity={editorAdminArticle}>
									{(adminArticle) => (
										<span>{adminArticle.$fields.title.value}</span>
									)}
								</HasRole>
							</div>
						)}
					</HasRole>
				</div>
			))

		expect(FullAccessComponent.$article).toBeDefined()
	})

	test('HasRole inside createComponent with explicit selection', () => {
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with explicit selection
		const ArticleCard = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article', e => e.id().title().internalNotes())
			.render(({ article }) => (
				<div>
					<span>{article.$data?.title}</span>
					<HasRole roles={['admin']} entity={article}>
						{(adminArticle) => (
							<span>{adminArticle.$data?.internalNotes}</span>
						)}
					</HasRole>
				</div>
			))

		expect(ArticleCard.$article).toBeDefined()
		expect(ArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('HasRole inside createComponent collects field selection from children', () => {
		const { createComponent, HasRole } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component where fields are only accessed inside HasRole
		const ArticleCardWithHasRole = createComponent({ roles: ['admin'] as const })
			.entity('article', 'Article')
			.render(({ article }) => (
				<div>
					{/* title accessed at root level */}
					<span>{article.$fields.title.value}</span>
					<HasRole roles={['admin']} entity={article}>
						{(adminArticle) => (
							// internalNotes ONLY accessed inside HasRole children
							<span>{adminArticle.$fields.internalNotes.value}</span>
						)}
					</HasRole>
				</div>
			))

		// Fragment should have selection metadata
		const fragment = ArticleCardWithHasRole.$article
		expect(fragment.__meta).toBeDefined()
		expect(fragment.__meta.fields).toBeDefined()

		// Selection should contain fields from BOTH root and HasRole children
		const fieldNames = Array.from(fragment.__meta.fields.values()).map(f => f.fieldName)
		expect(fieldNames).toContain('title')
		// This is the key assertion - internalNotes is only accessed inside HasRole,
		// so if selection collection for HasRole works, it should be included
		expect(fieldNames).toContain('internalNotes')
	})
})
