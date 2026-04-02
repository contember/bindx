/**
 * Role-Aware Type System Tests
 *
 * Tests for the role-based type system:
 * 1. Role utility types (CommonEntity, EntityForRoles, ResolveEntity) — compile-time
 * 2. EntityDef with role maps — compile-time + runtime
 * 3. roleEntityDef — compile-time + runtime
 * 4. useEntity / useEntityList with roles — runtime rendering
 * 5. HasRole component — runtime rendering + type narrowing
 * 6. RoleProvider — runtime context
 * 7. createComponent with roles — type inference
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import './setup'
import type {
	CommonEntity,
	EntityForRoles,
	ResolveEntity,
	RoleNames,
	SingleRoleMap,
	EntityDef,
	InferEntityDef,
	ExtractRoleMap,
	EntityAccessor,
	UnionToIntersection,
	SelectionBuilder,
} from '@contember/bindx'
import {
	entityDef,
	roleEntityDef,
	defineSchema,
	scalar,
	hasOne,
	MockAdapter,
} from '@contember/bindx'
import {
	BindxProvider,
	useEntity,
	useEntityList,
	Entity,
	EntityList,
	HasRole,
	RoleProvider,
	createComponent,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId } from './shared/helpers'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Type Assertion Helpers
// ============================================================================

type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false
type AssertExtends<T, U> = [T] extends [U] ? true : false

function assertType<T extends true>(): void {
	// compile-time only
}

// ============================================================================
// Test Entity Types
// ============================================================================

interface Article {
	id: string
	title: string
	content: string
	author: Author
}

interface Author {
	id: string
	name: string
	email: string
}

// Per-role types
interface Article$admin {
	id: string
	title: string
	content: string
	internalNotes: string
	author: Author$admin
}

interface Article$public {
	id: string
	title: string
	author: Author$public
}

interface Author$admin {
	id: string
	name: string
	email: string
}

interface Author$public {
	id: string
	name: string
}

type ArticleRoles = { admin: Article$admin; public: Article$public }
type AuthorRoles = { admin: Author$admin; public: Author$public }

// Schema for runtime tests (uses base entity types, not role-specific)
const testSchema = defineSchema<{ Article: Article; Author: Author }>({
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

// Entity defs — one standard, one role-aware
const simpleSchema = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
} as const

const roleSchema = {
	Article: roleEntityDef<ArticleRoles>('Article'),
	Author: roleEntityDef<AuthorRoles>('Author'),
} as const

// Mock data
function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Hello World',
				content: 'Content here',
				internalNotes: 'Secret notes',
				author: {
					id: 'author-1',
					name: 'John',
					email: 'john@example.com',
				},
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John',
				email: 'john@example.com',
			},
		},
	}
}

// ============================================================================
// 1. Type Utility Tests (compile-time)
// ============================================================================

describe('Role Type Utilities', () => {
	test('RoleNames extracts role names from role map', () => {
		type Names = RoleNames<ArticleRoles>
		assertType<AssertEqual<Names, 'admin' | 'public'>>()
	})

	test('CommonEntity returns union of all role entity types', () => {
		type Common = CommonEntity<ArticleRoles>
		assertType<AssertExtends<Common, { id: string; title: string }>>()
		assertType<AssertEqual<'internalNotes' extends keyof Common ? true : false, false>>()
		assertType<AssertEqual<'content' extends keyof Common ? true : false, false>>()
	})

	test('CommonEntity with single role returns the entity type directly', () => {
		type Common = CommonEntity<{ _default: Article }>
		assertType<AssertEqual<Common, Article>>()
	})

	test('EntityForRoles with single role returns that role entity type', () => {
		type Admin = EntityForRoles<ArticleRoles, 'admin'>
		assertType<AssertEqual<Admin, Article$admin>>()
	})

	test('EntityForRoles with multiple roles returns intersection', () => {
		type Both = EntityForRoles<ArticleRoles, 'admin' | 'public'>
		assertType<AssertExtends<Both, { id: string; title: string; internalNotes: string }>>()
	})

	test('ResolveEntity with never returns CommonEntity', () => {
		type Resolved = ResolveEntity<ArticleRoles, never>
		type Common = CommonEntity<ArticleRoles>
		assertType<AssertEqual<Resolved, Common>>()
	})

	test('ResolveEntity with role returns EntityForRoles', () => {
		type Resolved = ResolveEntity<ArticleRoles, 'admin'>
		assertType<AssertEqual<Resolved, Article$admin>>()
	})

	test('SingleRoleMap wraps entity in _default', () => {
		type Wrapped = SingleRoleMap<Article>
		assertType<AssertEqual<Wrapped, { readonly _default: Article }>>()
	})

	test('UnionToIntersection works correctly', () => {
		type Result = UnionToIntersection<{ a: 1 } | { b: 2 }>
		assertType<AssertEqual<Result, { a: 1 } & { b: 2 }>>()
	})
})

// ============================================================================
// 2. EntityDef Tests (compile-time + runtime)
// ============================================================================

describe('EntityDef with Roles', () => {
	test('entityDef wraps entity type in SingleRoleMap', () => {
		const def = entityDef<Article>('Article')
		type RoleMap = NonNullable<typeof def.$roleMap>
		assertType<AssertEqual<RoleMap, { readonly _default: Article }>>()
	})

	test('roleEntityDef preserves role map', () => {
		const def = roleEntityDef<ArticleRoles>('Article')
		type RoleMap = NonNullable<typeof def.$roleMap>
		assertType<AssertEqual<RoleMap, ArticleRoles>>()
	})

	test('InferEntityDef returns common entity type for single-role', () => {
		const def = entityDef<Article>('Article')
		type Inferred = InferEntityDef<typeof def>
		assertType<AssertEqual<Inferred, Article>>()
	})

	test('InferEntityDef with role map returns common entity type', () => {
		const def = roleEntityDef<ArticleRoles>('Article')
		type Inferred = InferEntityDef<typeof def>
		type Common = CommonEntity<ArticleRoles>
		assertType<AssertEqual<Inferred, Common>>()
	})

	test('entityDef preserves $name at runtime', () => {
		const def = entityDef<Article>('Article')
		expect(def.$name).toBe('Article')
	})

	test('roleEntityDef preserves $name at runtime', () => {
		const def = roleEntityDef<ArticleRoles>('Article')
		expect(def.$name).toBe('Article')
	})
})

// ============================================================================
// 3. SelectionBuilder type inference with roles
// ============================================================================

describe('SelectionBuilder type inference', () => {
	test('SelectionBuilder on common entity (union) only exposes common fields', () => {
		type Common = CommonEntity<ArticleRoles>
		// keyof Common should only include common fields
		type Keys = keyof Common
		assertType<AssertExtends<'id', Keys>>()
		assertType<AssertExtends<'title', Keys>>()
		assertType<AssertExtends<'author', Keys>>()
		// 'internalNotes' should NOT be in keys (only on admin)
		assertType<AssertEqual<'internalNotes' extends Keys ? true : false, false>>()
		// 'content' should NOT be in keys (only on admin)
		assertType<AssertEqual<'content' extends Keys ? true : false, false>>()
	})

	test('SelectionBuilder on admin entity exposes all admin fields', () => {
		type Admin = Article$admin
		type Keys = keyof Admin
		assertType<AssertExtends<'id', Keys>>()
		assertType<AssertExtends<'title', Keys>>()
		assertType<AssertExtends<'content', Keys>>()
		assertType<AssertExtends<'internalNotes', Keys>>()
		assertType<AssertExtends<'author', Keys>>()
	})

	test('Relations propagate through union types', () => {
		type Common = CommonEntity<ArticleRoles>
		// author field on common type should be Author$admin | Author$public
		type AuthorType = Common extends { author: infer A } ? A : never
		// keyof (Author$admin | Author$public) = only common fields
		type AuthorKeys = keyof AuthorType
		assertType<AssertExtends<'id', AuthorKeys>>()
		assertType<AssertExtends<'name', AuthorKeys>>()
		// email only on admin
		assertType<AssertEqual<'email' extends AuthorKeys ? true : false, false>>()
	})
})

// ============================================================================
// 4. useEntity / useEntityList hook type inference
// ============================================================================

describe('useEntity type inference', () => {
	test('useEntity without roles uses common entity type', () => {
		// This is a compile-time test — verifying the overload resolution
		function TestComponent(): React.ReactElement {
			const article = useEntity(roleSchema.Article, { by: { id: 'article-1' } }, e => e.id().title())
			// The definer callback should only allow common fields
			// e.title() ✓ (common), e.internalNotes() would be ✗ (admin only)
			if (article.$status !== 'ready') return <div>Loading</div>
			return <div>{article.title.value}</div>
		}
		// If this compiles, the type inference is correct
		expect(TestComponent).toBeDefined()
	})

	test('useEntity with roles expands entity type', () => {
		function TestComponent(): React.ReactElement {
			const article = useEntity(
				roleSchema.Article,
				{ by: { id: 'article-1' }, roles: ['admin'] },
				e => e.id().title().content().internalNotes(),
			)
			// Admin role allows all fields including internalNotes
			if (article.$status !== 'ready') return <div>Loading</div>
			return <div>{article.title.value}</div>
		}
		expect(TestComponent).toBeDefined()
	})

	test('useEntity with single-role entityDef works like before', () => {
		function TestComponent(): React.ReactElement {
			const article = useEntity(simpleSchema.Article, { by: { id: 'article-1' } }, e => e.id().title().content())
			if (article.$status !== 'ready') return <div>Loading</div>
			return <div>{article.title.value}</div>
		}
		expect(TestComponent).toBeDefined()
	})
})

// ============================================================================
// 5. useEntity runtime rendering
// ============================================================================

describe('useEntity runtime with roles', () => {
	test('renders entity data with roles option', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(
				roleSchema.Article,
				{ by: { id: 'article-1' }, roles: ['admin'] },
				e => e.title(),
			)
			if (article.$status === 'loading') return <div data-testid="loading">Loading</div>
			if (article.$status !== 'ready') return <div data-testid="error">Error</div>
			return <div data-testid="title">{article.title.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
	})

	test('renders entity data without roles option', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(
				roleSchema.Article,
				{ by: { id: 'article-1' } },
				e => e.title(),
			)
			if (article.$status === 'loading') return <div data-testid="loading">Loading</div>
			if (article.$status !== 'ready') return <div data-testid="error">Error</div>
			return <div data-testid="title">{article.title.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
	})
})

// ============================================================================
// 6. HasRole component tests
// ============================================================================

describe('HasRole component', () => {
	test('renders children when user has the role (gate mode)', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<RoleProvider hasRole={role => role === 'admin'}>
					<HasRole roles={['admin']}>
						<div data-testid="admin-content">Admin Panel</div>
					</HasRole>
				</RoleProvider>
			</BindxProvider>,
		)

		expect(queryByTestId(container, 'admin-content')).not.toBeNull()
		expect(getByTestId(container, 'admin-content').textContent).toBe('Admin Panel')
	})

	test('does not render children when user lacks the role', () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<RoleProvider hasRole={role => role === 'public'}>
					<HasRole roles={['admin']}>
						<div data-testid="admin-content">Admin Panel</div>
					</HasRole>
				</RoleProvider>
			</BindxProvider>,
		)

		expect(queryByTestId(container, 'admin-content')).toBeNull()
	})

	test('renders when user has any of the specified roles', () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<RoleProvider hasRole={role => role === 'editor'}>
					<HasRole roles={['admin', 'editor']}>
						<div data-testid="content">Visible</div>
					</HasRole>
				</RoleProvider>
			</BindxProvider>,
		)

		expect(queryByTestId(container, 'content')).not.toBeNull()
	})

	test('always renders when no RoleProvider is present', () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<HasRole roles={['admin']}>
					<div data-testid="content">Always Visible</div>
				</HasRole>
			</BindxProvider>,
		)

		expect(queryByTestId(container, 'content')).not.toBeNull()
	})
})

// ============================================================================
// 7. RoleProvider context tests
// ============================================================================

describe('RoleProvider', () => {
	test('provides role checking to nested components', () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const roles = ['admin', 'editor']

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<RoleProvider hasRole={role => roles.includes(role)}>
					<HasRole roles={['admin']}>
						<div data-testid="admin">Admin</div>
					</HasRole>
					<HasRole roles={['editor']}>
						<div data-testid="editor">Editor</div>
					</HasRole>
					<HasRole roles={['superadmin']}>
						<div data-testid="superadmin">Superadmin</div>
					</HasRole>
				</RoleProvider>
			</BindxProvider>,
		)

		expect(queryByTestId(container, 'admin')).not.toBeNull()
		expect(queryByTestId(container, 'editor')).not.toBeNull()
		expect(queryByTestId(container, 'superadmin')).toBeNull()
	})
})

// ============================================================================
// 8. createComponent with roles — type inference
// ============================================================================

describe('createComponent with roles', () => {
	test('roles option resolves entity type for admin scope', () => {
		// This should compile — admin role gives access to all admin fields
		const AdminArticle = createComponent({ roles: ['admin'] })
			.entity('article', roleSchema.Article, e => e.title().content().internalNotes())
			.render(({ article }) => (
				<div data-testid="admin-article">
					{void article.title}
				</div>
			))

		expect(AdminArticle).toBeDefined()
	})

	test('no roles resolves to common entity type', () => {
		// This should compile — only common fields available
		const PublicArticle = createComponent()
			.entity('article', roleSchema.Article, e => e.title())
			.render(({ article }) => (
				<div data-testid="public-article">
					{void article.title}
				</div>
			))

		expect(PublicArticle).toBeDefined()
	})

	test('const type parameter infers literal types without as const', () => {
		// If createComponent uses `const TRoles`, this should infer ['admin'] not string[]
		const component = createComponent({ roles: ['admin'] })
		expect(component).toBeDefined()
	})
})

// ============================================================================
// 9. ExtractRoleMap
// ============================================================================

describe('ExtractRoleMap', () => {
	test('extracts role map from EntityAccessor', () => {
		type Accessor = EntityAccessor<Article$admin, Article$admin, any, string, Record<string, object>, ArticleRoles>
		type Extracted = ExtractRoleMap<Accessor>
		assertType<AssertEqual<Extracted, ArticleRoles>>()
	})

	test('returns default for EntityAccessor without role map', () => {
		type Accessor = EntityAccessor<Article>
		type Extracted = ExtractRoleMap<Accessor>
		assertType<AssertExtends<Extracted, Record<string, object>>>()
	})
})

// ============================================================================
// 10. Entity component with role-aware EntityDef
// ============================================================================

describe('Entity component with roles', () => {
	test('Entity renders with role-aware EntityDef', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={roleSchema.Article} by={{ id: 'article-1' }}>
					{article => (
						<div data-testid="article-title">Rendered</div>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'article-title')).not.toBeNull()
		})

		expect(getByTestId(container, 'article-title').textContent).toBe('Rendered')
	})
})

// ============================================================================
// 11. EntityList component with role-aware EntityDef
// ============================================================================

describe('EntityList component with roles', () => {
	test('EntityList renders with role-aware EntityDef', async () => {
		const adapter = new MockAdapter({
			Article: {
				'article-1': { id: 'article-1', title: 'First', content: 'C1', author: null },
				'article-2': { id: 'article-2', title: 'Second', content: 'C2', author: null },
			},
			Author: {},
		}, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<EntityList entity={roleSchema.Article}>
					{(article, index) => (
						<div data-testid={`item-${index}`}>Item</div>
					)}
				</EntityList>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'item-0')).not.toBeNull()
		})
	})
})
