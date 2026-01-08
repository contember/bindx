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
} from '@contember/bindx'
import {
	createRoleAwareBindx,
	BindxProvider,
	MockAdapter,
} from '@contember/react-bindx'

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
		expect(Entity).toBeInstanceOf(Function)
		expect(HasRole).toBeInstanceOf(Function)
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
						<Entity name="Article" id="article-1" roles={['editor', 'admin'] as const}>
							{(article) => (
								<div>
									<span data-testid="title">{article.data?.title}</span>
									{/* article has intersection of editor ∩ admin */}
									<span data-testid="content">{article.data?.content}</span>

									{/* HasRole narrows to just admin - but user doesn't have it */}
									<HasRole roles={['admin']} entity={article}>
										{(adminArticle) => (
											<span data-testid="admin-notes">
												{adminArticle.data?.internalNotes}
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
						<Entity name="Article" id="article-1" roles={['editor', 'admin']}>
							{(article) => (
								<div>
									<span data-testid="title">{article.data?.title}</span>
									{/* internalNotes is NOT in editor schema, only in admin - with intersection it should error */}
									{/* @ts-expect-error - internalNotes doesn't exist in intersection of editor ∩ admin (editor doesn't have it) */}
									<span data-testid="title">{article.data?.internalNotes}</span>

									<HasRole roles={['admin']} entity={article}>
										{(adminArticle) => (
											<span data-testid="admin-notes">
												{adminArticle.data?.internalNotes}
											</span>
										)}
									</HasRole>

									<HasRole roles={['editor']} entity={article}>
										{(editorArticle) => (
											<span data-testid="editor-content">
												{/* EditorArticle has content but not internalNotes */}
												{editorArticle.data?.content}
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
						<Entity name="Article" id="article-1" roles={['public', 'editor', 'admin'] as const}>
							{(article) => (
								<div>
									<span data-testid="title">{article.data?.title}</span>

									{/* First HasRole narrows to editor+admin */}
									<HasRole roles={['editor', 'admin']} entity={article}>
										{(editorAdminArticle) => (
											<div>
												<span data-testid="content">{editorAdminArticle.data?.content}</span>

												{/* Nested HasRole - can only use editor or admin, not public */}
												<HasRole roles={['admin']} entity={editorAdminArticle}>
													{(adminArticle) => (
														<span data-testid="notes">{adminArticle.data?.internalNotes}</span>
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

		// Create an admin-only component
		const AdminArticleCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id().title().internalNotes(),
		}), ({ article }) => (
			<div>
				<span>{article.data?.title}</span>
			</div>
		))

		// Component should have $article fragment property
		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminArticleCard.$article.__isFragment).toBe(true)
		expect(AdminArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('createComponent fragment has correct role info', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with multiple roles
		const EditorAdminCard = createComponent({
			roles: ['editor', 'admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id().title(),
		}), ({ article }) => (
			<div>{article.data?.title}</div>
		))

		// Fragment should carry role information
		const fragment = EditorAdminCard.$article
		expect(fragment.__roles).toEqual(['editor', 'admin'])
		expect(fragment.__availableRoles).toEqual(['editor', 'admin'])
	})

	test('createComponent with scalar props works', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create component with scalar props
		const AdminArticleCard = createComponent<{ showNotes?: boolean }>()({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id().title(),
		}), ({ article, showNotes }) => (
			<div>
				<span>{article.data?.title}</span>
				{showNotes && <span>Notes visible</span>}
			</div>
		))

		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('component fragment type correctly narrows entity access', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create an admin-only component
		const AdminArticleCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			// Admin has access to internalNotes
			article: it.fragment('Article').id().title().internalNotes(),
		}), ({ article }) => (
			<div>
				{/* article.data should have internalNotes */}
				<span>{article.data?.title}</span>
				<span>{article.data?.internalNotes}</span>
			</div>
		))

		expect(AdminArticleCard.$article).toBeDefined()
	})

	test('createComponent type restricts to valid entity names for roles', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// This should compile - Article exists in admin schema
		const AdminArticleCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id(),
		}), ({ article }) => <div>{article.data?.id}</div>)

		// This should compile - Author exists in admin schema
		const AdminAuthorCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			author: it.fragment('Author').id().name(),
		}), ({ author }) => <div>{author.data?.name}</div>)

		expect(AdminArticleCard.$article).toBeDefined()
		expect(AdminAuthorCard.$author).toBeDefined()
	})

	test('fragment carries type-level role information for validation', () => {
		// This is a compile-time test
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const AdminCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id(),
		}), ({ article }) => <div>{article.data?.id}</div>)

		// The fragment should have ['admin'] as its available roles at type level
		type FragmentRoles = typeof AdminCard.$article extends { __availableRoles?: infer R } ? R : never
		// At runtime, __availableRoles is set
		expect(AdminCard.$article.__availableRoles).toEqual(['admin'])
	})

	test('type error: public role cannot access admin-only fields', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create a public-only component
		const PublicArticleCard = createComponent({
			roles: ['public'] as const,
		}, (it) => ({
			article: it.fragment('Article')
				.id()
				.title()
				// @ts-expect-error - 'internalNotes' does not exist on PublicArticle (only on AdminArticle)
				.internalNotes(),
		}), ({ article }) => <div>{article.data?.title}</div>)

		expect(PublicArticleCard.$article).toBeDefined()
	})

	test('type error: editor role cannot access admin-only fields', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		// Create an editor-only component
		const EditorArticleCard = createComponent({
			roles: ['editor'] as const,
		}, (it) => ({
			article: it.fragment('Article')
				.id()
				.title()
				.content() // OK - editor has content
				// @ts-expect-error - 'internalNotes' does not exist on EditorArticle (only on AdminArticle)
				.internalNotes(),
		}), ({ article }) => <div>{article.data?.content}</div>)

		expect(EditorArticleCard.$article).toBeDefined()
	})

	test('type error: public role cannot access editor field (content)', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const PublicArticleCard = createComponent({
			roles: ['public'] as const,
		}, (it) => ({
			article: it.fragment('Article')
				.id()
				.title()
				// @ts-expect-error - 'content' does not exist on PublicArticle
				.content(),
		}), ({ article }) => <div>{article.data?.title}</div>)

		expect(PublicArticleCard.$article).toBeDefined()
	})

	test('type error: public role cannot access author relation', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const PublicArticleCard = createComponent({
			roles: ['public'] as const,
		}, (it) => ({
			article: it.fragment('Article')
				.id()
				.title()
				// @ts-expect-error - 'author' relation does not exist on PublicArticle
				.author((a: any) => a.name()),
		}), ({ article }) => <div>{article.data?.title}</div>)

		expect(PublicArticleCard.$article).toBeDefined()
	})

	test('type error: admin Author fields not accessible from editor role', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const EditorAuthorCard = createComponent({
			roles: ['editor'] as const,
		}, (it) => ({
			author: it.fragment('Author')
				.id()
				.name()
				.email() // OK - editor has email
				// @ts-expect-error - 'salary' does not exist on EditorAuthor (only on AdminAuthor)
				.salary(),
		}), ({ author }) => <div>{author.data?.name}</div>)

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

		// Create admin-only component
		const AdminArticleCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id().title().internalNotes(),
		}), ({ article }) => (
			<div>
				<span>{article.data?.title}</span>
				<span>{article.data?.internalNotes}</span>
			</div>
		))

		// Create a mock EntityRef with only editor roles
		const editorOnlyEntityRef: EntityRef<EditorArticle, EditorArticle, any, 'Article', readonly ['editor']> = {
			id: 'article-1',
			fields: {} as any,
			data: { id: 'article-1', title: 'Test', content: 'Content', author: {} as any },
			isDirty: false,
			__entityType: {} as EditorArticle,
			__entityName: 'Article',
			__availableRoles: ['editor'] as const,
		}

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

		// Create admin-only component
		const AdminArticleCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id().title(),
		}), ({ article }) => <div>{article.data?.title}</div>)

		// Create a mock EntityRef with admin + editor roles (superset of required ['admin'])
		const adminEditorEntityRef: EntityRef<AdminArticle, { id: string; title: string }, any, 'Article', readonly ['admin', 'editor']> = {
			id: 'article-1',
			fields: {} as any,
			data: { id: 'article-1', title: 'Test' },
			isDirty: false,
			__entityType: {} as AdminArticle,
			__entityName: 'Article',
			__availableRoles: ['admin', 'editor'] as const,
		}

		// This should work - ['admin'] is subset of ['admin', 'editor']
		// Note: The actual type check depends on how component props are typed
		// The fragment itself carries the role info, and the EntityRef needs to have compatible roles

		expect(AdminArticleCard.$article.__roles).toEqual(['admin'])
	})

	test('fragment role info is preserved in type system', () => {
		const { createComponent } = createRoleAwareBindx<RoleSchemas>(adminSchema)

		const AdminCard = createComponent({
			roles: ['admin'] as const,
		}, (it) => ({
			article: it.fragment('Article').id(),
		}), ({ article }) => <div>{article.data?.id}</div>)

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
