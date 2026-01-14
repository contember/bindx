/**
 * Type Safety Tests for Fragment, useEntity, and Entity Interoperability
 *
 * These tests verify compile-time and runtime type safety for the selection-aware
 * entity system. They ensure that:
 *
 * 1. Selection-aware EntityRef only exposes selected fields
 * 2. createComponent extracts correct selection types
 * 3. Fragment $propName has correct result type for composition
 * 4. useEntity returns selection-aware accessor
 * 5. Type errors are raised when accessing non-selected fields
 */

import { describe, test, expect } from 'bun:test'
import type {
	EntityRef,
	FluentFragment,
	SelectedEntityFields,
	EntityFromProp,
	SelectionFromProp,
} from '@contember/react-bindx'
import {
	createFragment,
	createBindx,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	mergeFragments,
} from '@contember/react-bindx'

// ============================================================================
// Type Assertion Helpers
// ============================================================================

/**
 * Asserts that two types are exactly equal.
 * Compilation fails if types don't match.
 */
type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false

/**
 * Asserts that T extends U (T is assignable to U)
 */
type AssertExtends<T, U> = [T] extends [U] ? true : false

/**
 * Helper function to assert type is true at compile time
 */
function assertType<T extends true>(_value?: T): void {
	// This function exists only for type checking
}

/**
 * Helper to verify a type equals true
 */
function assertTrue<T extends true>(): void {}

/**
 * Helper to verify a type equals false
 */
function assertFalse<T extends false>(): void {}

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

const { createComponent } = createBindx(schema)

// ============================================================================
// Type-Level Tests (Compile-Time)
// ============================================================================

describe('Type Safety - Compile Time Checks', () => {
	describe('EntityRef Selection Awareness', () => {
		test('EntityRef<T> defaults to full entity (backwards compatible)', () => {
			// EntityRef<Author> should have all Author fields
			type FullAuthorRef = EntityRef<Author>
			type FullFields = FullAuthorRef['$fields']

			// These should all be accessible - compile-time verification
			assertTrue<AssertExtends<'name', keyof FullFields>>()
			assertTrue<AssertExtends<'email', keyof FullFields>>()
			assertTrue<AssertExtends<'bio', keyof FullFields>>()
		})

		test('EntityRef<T, S> restricts to selected fields', () => {
			// EntityRef<Author, { name: string }> should only have name
			type SelectedAuthorRef = EntityRef<Author, { name: string }>
			type SelectedFields = SelectedAuthorRef['$fields']

			// name should be accessible
			assertTrue<AssertExtends<'name', keyof SelectedFields>>()

			// email and bio should NOT be in the type
			assertFalse<AssertExtends<'email', keyof SelectedFields>>()
			assertFalse<AssertExtends<'bio', keyof SelectedFields>>()
		})

		test('EntityRef $data property matches selection type', () => {
			type SelectedRef = EntityRef<Author, { name: string; email: string }>
			type DataType = SelectedRef['$data']

			// $data should be { name: string; email: string } | null
			assertTrue<AssertExtends<DataType, { name: string; email: string } | null>>()
		})

		test('accessing non-selected field is type error', () => {
			type SelectedRef = EntityRef<Author, { name: string }>

			// This would be a type error if uncommented:
			// declare const ref: SelectedRef
			// @ts-expect-error - 'email' does not exist on selected fields
			type _TestError = SelectedRef['$fields']['email']
		})
	})

	describe('SelectedEntityFields Type', () => {
		test('only includes fields from selection', () => {
			type Selected = { name: string; email: string }
			type Fields = SelectedEntityFields<Author, Selected>

			// Should have name and email
			assertTrue<AssertExtends<'name', keyof Fields>>()
			assertTrue<AssertExtends<'email', keyof Fields>>()

			// Should NOT have bio (not in selection)
			assertFalse<AssertExtends<'bio', keyof Fields>>()
		})

		test('handles nested relation selections', () => {
			type Selected = { title: string; author: { name: string } }
			type Fields = SelectedEntityFields<Article, Selected>

			// Should have title and author
			assertTrue<AssertExtends<'title', keyof Fields>>()
			assertTrue<AssertExtends<'author', keyof Fields>>()

			// Should NOT have content (not in selection)
			assertFalse<AssertExtends<'content', keyof Fields>>()
		})
	})

	describe('createComponent Type Extraction', () => {
		test('extracts selection type from EntityRef props', () => {
			interface AuthorCardProps {
				author: EntityRef<Author, { name: string; email: string }>
			}

			// Verify EntityFromProp extracts full entity type
			type ExtractedEntity = EntityFromProp<AuthorCardProps, 'author'>
			assertTrue<AssertExtends<ExtractedEntity, Author>>()
			assertTrue<AssertExtends<Author, ExtractedEntity>>()

			// Verify SelectionFromProp extracts selection type
			type ExtractedSelection = SelectionFromProp<AuthorCardProps, 'author'>
			assertTrue<AssertExtends<'name', keyof ExtractedSelection>>()
			assertTrue<AssertExtends<'email', keyof ExtractedSelection>>()

			// Verify selection does NOT have bio
			assertFalse<AssertExtends<'bio', keyof ExtractedSelection>>()
		})

		test('$propName fragment has correct result type', () => {
			// Create a component with explicit selection using builder API
			const TagDisplay = createComponent()
				.entity('tag', 'Tag', e => e.name().color())
				.render(({ tag }) => {
					void tag.$data?.name
					void tag.$data?.color
					return null
				})

			// Verify $tag fragment exists and has correct types
			type FragmentType = typeof TagDisplay.$tag
			assertTrue<AssertExtends<FragmentType, FluentFragment<Tag, { name: string; color: string }>>>()
		})
	})

	describe('createFragment Type Inference', () => {
		test('fragment result type matches selection', () => {
			const AuthorFragment = createFragment<Author>()(e => e.name().email())

			// Fragment should have Author as model and { name, email } as result
			type ResultType = typeof AuthorFragment extends FluentFragment<Author, infer R> ? R : never
			assertTrue<AssertExtends<'name', keyof ResultType>>()
			assertTrue<AssertExtends<'email', keyof ResultType>>()

			// bio should NOT be in result
			assertFalse<AssertExtends<'bio', keyof ResultType>>()
		})

		test('nested fragment composition preserves types', () => {
			const AuthorFragment = createFragment<Author>()(e => e.id().name())

			// When used in Article fragment
			const ArticleFragment = createFragment<Article>()(e =>
				e.title().author(AuthorFragment),
			)

			// Result should have { title, author: { id, name } }
			type ResultType = typeof ArticleFragment extends FluentFragment<Article, infer R> ? R : never
			assertTrue<AssertExtends<'title', keyof ResultType>>()
			assertTrue<AssertExtends<'author', keyof ResultType>>()

			// content should NOT be in result
			assertFalse<AssertExtends<'content', keyof ResultType>>()
		})
	})
})

// ============================================================================
// Runtime Tests
// ============================================================================

describe('Type Safety - Runtime Behavior', () => {
	describe('createComponent', () => {
		test('creates component with correct $propName fragment with explicit selection', () => {
			// Using builder API with explicit selection
			const AuthorInfo = createComponent()
				.entity('author', 'Author', e => e.name())
				.render(({ author }) => {
					void author.$data?.name
					return null
				})

			// $author fragment should exist because we defined explicit selection
			expect(AuthorInfo.$author).toBeDefined()
			expect(AuthorInfo.$author.__isFragment).toBe(true)
			expect(AuthorInfo.$author.__meta).toBeDefined()
		})

		test('creates component with implicit selection from JSX access', () => {
			// Using builder API with implicit selection
			const AuthorInfo = createComponent()
				.entity('author', 'Author')
				.render(({ author }) => {
					// Access fields to trigger implicit selection collection
					void author.$fields.name.value
					return null
				})

			// $author fragment should exist from implicit collection
			expect(AuthorInfo.$author).toBeDefined()
			expect(AuthorInfo.$author.__isFragment).toBe(true)
		})

		test('fragment metadata captures selected fields', () => {
			const TagList = createComponent()
				.entity('tag', 'Tag', e => e.name().color())
				.render(({ tag }) => {
					void tag.$data?.name
					void tag.$data?.color
					return null
				})

			// Verify fragment has selection metadata
			const meta = TagList.$tag.__meta
			expect(meta.fields).toBeDefined()
			expect(meta.fields.size).toBeGreaterThanOrEqual(1)
		})

		test('multiple entity props create multiple fragments', () => {
			const ArticleView = createComponent()
				.entity('article', 'Article', e => e.title())
				.entity('author', 'Author', e => e.name())
				.render(({ article, author }) => {
					void article.$data?.title
					void author.$data?.name
					return null
				})

			// Both $article and $author should exist
			expect(ArticleView.$article).toBeDefined()
			expect(ArticleView.$author).toBeDefined()
		})
	})

	describe('createFragment', () => {
		test('creates fragment with metadata', () => {
			const fragment = createFragment<Author>()(e => e.name().email())

			expect(fragment.__isFragment).toBe(true)
			expect(fragment.__meta).toBeDefined()
			expect(fragment.__meta.fields.size).toBe(2)
			expect(fragment.__meta.fields.has('name')).toBe(true)
			expect(fragment.__meta.fields.has('email')).toBe(true)
		})

		test('nested selection in fragment', () => {
			const fragment = createFragment<Article>()(e =>
				e.title().author(a => a.name().email()),
			)

			expect(fragment.__meta.fields.has('title')).toBe(true)
			expect(fragment.__meta.fields.has('author')).toBe(true)

			const authorField = fragment.__meta.fields.get('author')
			expect(authorField?.nested).toBeDefined()
			expect(authorField?.nested?.fields.has('name')).toBe(true)
			expect(authorField?.nested?.fields.has('email')).toBe(true)
		})

		test('fragment can be used in another fragment', () => {
			const AuthorFragment = createFragment<Author>()(e => e.id().name())
			const ArticleFragment = createFragment<Article>()(e =>
				e.title().author(AuthorFragment),
			)

			const authorField = ArticleFragment.__meta.fields.get('author')
			expect(authorField?.nested?.fields.has('id')).toBe(true)
			expect(authorField?.nested?.fields.has('name')).toBe(true)
		})
	})

	describe('Schema and createBindx', () => {
		test('createBindx returns typed hooks', () => {
			const { useEntity, useEntityList, Entity, createComponent } = createBindx(schema)

			expect(useEntity).toBeDefined()
			expect(useEntityList).toBeDefined()
			expect(Entity).toBeDefined()
			expect(createComponent).toBeDefined()
		})
	})
})

// ============================================================================
// Type Error Tests (Compile-Time Assertions with @ts-expect-error)
// ============================================================================

describe('Type Safety - Expected Errors', () => {
	/**
	 * These tests use @ts-expect-error to verify that certain operations
	 * produce compile-time errors. The test passes if the error exists.
	 */

	test('accessing non-selected field should be type error', () => {
		type SelectedRef = EntityRef<Author, { name: string }>
		type SelectedFields = SelectedRef['$fields']

		// This should work - name is selected
		assertTrue<AssertExtends<'name', keyof SelectedFields>>()

		// email and bio should NOT be accessible
		// @ts-expect-error - 'email' does not exist on SelectedFields
		type _EmailField = SelectedFields['email']

		// @ts-expect-error - 'bio' does not exist on SelectedFields
		type _BioField = SelectedFields['bio']
	})

	test('fragment with wrong entity type should be type error', () => {
		const TagFragment = createFragment<Tag>()(e => e.name())

		// @ts-expect-error - TagFragment is for Tag, not Author
		const _ArticleFragment = createFragment<Article>()(e => e.author(TagFragment))
	})

	test('EntityRef types with different selections have different $data types', () => {
		type SmallRef = EntityRef<Author, { name: string }>
		type LargeRef = EntityRef<Author, { name: string; email: string }>

		// LargeRef.$data extends SmallRef.$data (has all required fields plus more)
		assertTrue<AssertExtends<NonNullable<LargeRef['$data']>, NonNullable<SmallRef['$data']>>>()

		// But SmallRef.$data does NOT extend LargeRef.$data (missing email)
		assertFalse<AssertExtends<NonNullable<SmallRef['$data']>, NonNullable<LargeRef['$data']>>>()

		// The $data types are NOT equal
		assertFalse<AssertEqual<LargeRef['$data'], SmallRef['$data']>>()
	})

	test('EntityRef with different entity types should NOT be assignable', () => {
		// EntityRef<Author> should NOT be assignable to EntityRef<Tag> even with same selection
		type AuthorRef = EntityRef<Author, { name: string }>
		type TagRef = EntityRef<Tag, { name: string }>

		// These should NOT be compatible - Author !== Tag
		// @ts-expect-error - AuthorRef should not be assignable to TagRef
		const _test1: TagRef = null as unknown as AuthorRef

		// @ts-expect-error - TagRef should not be assignable to AuthorRef
		const _test2: AuthorRef = null as unknown as TagRef
	})

	test('FluentFragment with different entity types should NOT be assignable', () => {
		type TagFrag = FluentFragment<Tag, { name: string }>
		type AuthorFrag = FluentFragment<Author, { name: string }>

		// These should NOT be compatible - different __modelType
		// @ts-expect-error - TagFrag should not be assignable to AuthorFrag
		const _test1: AuthorFrag = null as unknown as TagFrag

		// @ts-expect-error - AuthorFrag should not be assignable to TagFrag
		const _test2: TagFrag = null as unknown as AuthorFrag
	})

	test('createComponent component has typed props', () => {
		const AuthorCard = createComponent()
			.entity('author', 'Author', e => e.name())
			.render(({ author }) => {
				void author.$data?.name
				return null
			})

		expect(AuthorCard.$author).toBeDefined()
		expect(AuthorCard.$author.__isFragment).toBe(true)

		type FragmentModel = typeof AuthorCard.$author extends FluentFragment<infer M, unknown> ? M : never
		assertTrue<AssertExtends<FragmentModel, Author>>()
	})
})

// ============================================================================
// Known Limitations and Edge Cases
// ============================================================================

describe('Type Safety - Known Limitations', () => {
	/**
	 * These tests document known limitations in the type system.
	 * Some are intentional (backwards compatibility), others may be improved.
	 */

	test('HasManyRef map callback receives selection-aware entity type', () => {
		// HasManyRef<T, TSelected>.map receives EntityRef<T, TSelected>
		// The types correctly restrict to selected fields

		// When you select only { title } from articles:
		type SelectedArticle = { title: string }

		// The map callback SHOULD only allow accessing title
		// EntityRef<Article, SelectedArticle> should restrict to only 'title'

		// This SHOULD work - title is selected
		assertTrue<AssertExtends<'title', keyof EntityRef<Article, SelectedArticle>['$fields']>>()

		// This SHOULD NOT work - content is not selected
		assertFalse<AssertExtends<'content', keyof EntityRef<Article, SelectedArticle>['$fields']>>()
	})

	test('mergeFragments preserves model type brand', () => {
		const AuthorFrag1 = createFragment<Author>()(e => e.name())
		const AuthorFrag2 = createFragment<Author>()(e => e.email())

		// Merging Author fragments should produce Author fragment
		const merged = mergeFragments(AuthorFrag1, AuthorFrag2)

		// @ts-expect-error - Cannot assign Author fragment to Tag fragment
		const _wrongType: FluentFragment<Tag, { name: string }> = merged
	})

	test('SelectionFromProp extracts correct selection type', () => {
		interface Props {
			author: EntityRef<Author, { name: string; email: string }>
			tag: EntityRef<Tag, { name: string }>
		}

		// Selection should match what's declared in EntityRef
		type AuthorSelection = SelectionFromProp<Props, 'author'>
		type TagSelection = SelectionFromProp<Props, 'tag'>

		assertTrue<AssertExtends<'name', keyof AuthorSelection>>()
		assertTrue<AssertExtends<'email', keyof AuthorSelection>>()
		assertFalse<AssertExtends<'bio', keyof AuthorSelection>>()

		assertTrue<AssertExtends<'name', keyof TagSelection>>()
		assertFalse<AssertExtends<'color', keyof TagSelection>>()
	})

	test('nested relation selection types are propagated', () => {
		// When you select author.name from Article, the author field should be typed correctly
		type ArticleWithAuthor = EntityRef<Article, { title: string; author: { name: string } }>
		type AuthorFields = ArticleWithAuthor['$fields']['author']['$fields']

		// Should have access to name
		assertTrue<AssertExtends<'name', keyof AuthorFields>>()

		// Should NOT have access to email (not selected)
		assertFalse<AssertExtends<'email', keyof AuthorFields>>()
	})

	test('HasManyProps is selection-aware', () => {
		type SelectedTag = { name: string }
		type TagsRef = import('@contember/react-bindx').HasManyRef<Tag, SelectedTag>
		type Props = import('@contember/react-bindx').HasManyProps<Tag, SelectedTag>

		// The field prop should be HasManyRef<Tag, SelectedTag>
		assertTrue<AssertExtends<TagsRef, Props['field']>>()

		// The children callback receives EntityRef<Tag, SelectedTag>
		// which should only allow accessing 'name', not 'color'
		type CallbackArg = Parameters<Props['children']>[0]
		type CallbackFields = CallbackArg['$fields']

		assertTrue<AssertExtends<'name', keyof CallbackFields>>()
		assertFalse<AssertExtends<'color', keyof CallbackFields>>()
	})

	test('HasOneProps is selection-aware', () => {
		type SelectedAuthor = { name: string; email: string }
		type AuthorRef = import('@contember/react-bindx').HasOneRef<Author, SelectedAuthor>
		type Props = import('@contember/react-bindx').HasOneProps<Author, SelectedAuthor>

		// The field prop should be HasOneRef<Author, SelectedAuthor>
		assertTrue<AssertExtends<AuthorRef, Props['field']>>()

		// The children callback receives EntityRef<Author, SelectedAuthor>
		// which should only allow accessing 'name' and 'email', not 'bio'
		type CallbackArg = Parameters<Props['children']>[0]
		type CallbackFields = CallbackArg['$fields']

		assertTrue<AssertExtends<'name', keyof CallbackFields>>()
		assertTrue<AssertExtends<'email', keyof CallbackFields>>()
		assertFalse<AssertExtends<'bio', keyof CallbackFields>>()
	})
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Type Safety - Integration', () => {
	test('full workflow: fragment -> component -> useEntity', () => {
		// 1. Create a fragment with explicit selection
		const AuthorFragment = createFragment<Author>()(e => e.id().name())

		// 2. Verify fragment has correct metadata
		expect(AuthorFragment.__meta.fields.has('id')).toBe(true)
		expect(AuthorFragment.__meta.fields.has('name')).toBe(true)
		expect(AuthorFragment.__meta.fields.has('email')).toBe(false)

		// 3. Create entity fragment component with builder API
		const AuthorDisplay = createComponent()
			.entity('author', 'Author', e => e.id().name())
			.render(({ author }) => {
				void author.$data?.id
				void author.$data?.name
				return null
			})

		// 4. Verify component fragment has correct type
		expect(AuthorDisplay.$author).toBeDefined()
		expect(AuthorDisplay.$author.__isFragment).toBe(true)

		// 5. Verify types align for composition - compile-time check
		type FragmentResult = typeof AuthorFragment extends FluentFragment<Author, infer R> ? R : never

		// Both should have id and name
		assertTrue<AssertExtends<'id', keyof FragmentResult>>()
		assertTrue<AssertExtends<'name', keyof FragmentResult>>()
	})

	test('nested relations preserve selection types', () => {
		// Create nested fragment structure
		const TagFragment = createFragment<Tag>()(e => e.id().name())
		const AuthorFragment = createFragment<Author>()(e => e.id().name())

		const ArticleFragment = createFragment<Article>()(e =>
			e
				.title()
				.author(AuthorFragment)
				.tags(TagFragment),
		)

		// Verify structure at runtime
		expect(ArticleFragment.__meta.fields.has('title')).toBe(true)
		expect(ArticleFragment.__meta.fields.has('author')).toBe(true)
		expect(ArticleFragment.__meta.fields.has('tags')).toBe(true)

		// Verify nested selections at runtime
		const authorField = ArticleFragment.__meta.fields.get('author')
		expect(authorField?.nested?.fields.has('id')).toBe(true)
		expect(authorField?.nested?.fields.has('name')).toBe(true)
		expect(authorField?.nested?.fields.has('email')).toBe(false)

		const tagsField = ArticleFragment.__meta.fields.get('tags')
		expect(tagsField?.nested?.fields.has('id')).toBe(true)
		expect(tagsField?.nested?.fields.has('name')).toBe(true)
		expect(tagsField?.nested?.fields.has('color')).toBe(false)

		// Verify types at compile-time
		type ArticleResult = typeof ArticleFragment extends FluentFragment<Article, infer R> ? R : never
		assertTrue<AssertExtends<'title', keyof ArticleResult>>()
		assertTrue<AssertExtends<'author', keyof ArticleResult>>()
		assertTrue<AssertExtends<'tags', keyof ArticleResult>>()
		assertFalse<AssertExtends<'content', keyof ArticleResult>>()
	})
})
