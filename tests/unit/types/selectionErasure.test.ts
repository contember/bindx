/**
 * Type-level tests for the selection-erased views `EntityRefLike` / `EntityAccessorLike`.
 *
 * Background: `EntityRef<TEntity>` / `EntityAccessor<TEntity>` default `TSelected`
 * to `TEntity`, i.e. "fully selected". The selection payload is *covariant*
 * (`readonly __selected?: TSelected` plus the `EntityFieldsRef` / `EntityFieldsAccessor`
 * mapped types keyed on `keyof TSelected`), so narrowing a selection already works
 * and widening one correctly does not — reading an unfetched field throws
 * `UnfetchedFieldError` at runtime (see `EntityHandle.fields`).
 *
 * What genuinely did not work is a parameter that means "an entity ref for
 * `TEntity`, whatever its selection" — in particular when the selection is still a
 * free type parameter (generic helpers, repeater children). `EntityRefLike` /
 * `EntityAccessorLike` are that parameter type. They deliberately expose no field
 * proxy, so erasure can never turn into unchecked field access.
 *
 * Positive cases are written as real assignments (return-position), so they exercise
 * the compiler's actual assignability check, not an approximation.
 *
 * Negative cases use `assertFalse<IsAssignable<S, T>>()` rather than `@ts-expect-error`:
 * a suppression comment is satisfied by *any* error on the line (including an
 * unrelated one, e.g. a typo), while asserting on the result of `[S] extends [T]`
 * — the compiler's own assignability relation, tuple-wrapped so unions do not
 * distribute — fails to compile exactly when the rejection we care about stops
 * happening, and never for another reason.
 */

import { describe, expect, test } from 'bun:test'
import type {
	AnyBrand,
	EntityAccessor,
	EntityAccessorLike,
	EntityRef,
	EntityRefLike,
	FieldRef,
	HasManyRef,
} from '@contember/bindx'
import { createComponent, entityDef } from '@contember/bindx-react'
import type { ComponentProps } from 'react'

// ============================================================================
// Assertion Helpers
// ============================================================================

type IsAssignable<TSource, TTarget> = [TSource] extends [TTarget] ? true : false

function assertTrue<T extends true>(): void {}
function assertFalse<T extends false>(): void {}

// ============================================================================
// Test Entity Types
// ============================================================================

interface Image {
	id: string
	url: string
	alt: string
	width: number
}

interface Author {
	id: string
	name: string
	email: string
}

interface Website {
	id: string
	title: string
	slug: string
	image: Image | null
	author: Author
}

/** What `e => e.id().title()` selects. */
type NarrowWebsite = { id: string; title: string }

/** What `e => e.id().image(i => i.url().alt())` selects. */
type WebsiteWithNarrowImage = { id: string; image: { url: string; alt: string } }

const websiteDef = entityDef<Website>('Website')

// ============================================================================
// Case 1 — a narrowly-selected accessor reaching a parameter that only needs identity
// ============================================================================

function case1_narrowAccessorToErasedParam(
	website: EntityAccessor<Website, NarrowWebsite>,
): EntityAccessorLike<Website> {
	return website
}

function case1_narrowRefToErasedParam(
	website: EntityRef<Website, NarrowWebsite>,
): EntityRefLike<Website> {
	return website
}

/** The same, against the prop type `createComponent` actually generates. */
const WebsiteTitle = createComponent()
	.entity('website', websiteDef, e => e.id().title())
	.render(() => null)

type WebsiteTitleProp = ComponentProps<typeof WebsiteTitle>['website']

function case1_componentPropToErasedParam(website: WebsiteTitleProp): EntityRefLike<Website> {
	return website
}

// ============================================================================
// Case 2 — a generic helper whose TSelected is still free
// ============================================================================

function case2_freeSelectionToErasedParam<TSelected extends object>(
	block: EntityRef<Website, TSelected>,
): EntityRefLike<Website> {
	return block
}

function case2_freeEntityToErasedParam<TEntity extends object>(
	entity: EntityAccessor<TEntity>,
): EntityAccessorLike<TEntity> {
	return entity
}

// ============================================================================
// Case 3 — repeater children forwarding items
// ============================================================================

function case3_forwardItems<TEntity extends object>(
	items: readonly EntityRef<TEntity>[],
): readonly EntityRefLike<TEntity>[] {
	return items
}

// ============================================================================
// Case 4 — a has-one narrowed by a useEntity selector
// ============================================================================

/** `useEntity(schema.Website, …, e => e.id().image(i => i.url().alt())).image` */
type NarrowImageFromSelection = EntityAccessor<Website, WebsiteWithNarrowImage>['image']

function case4_narrowedHasOneToErasedParam(
	image: NarrowImageFromSelection,
): EntityAccessorLike<Image> {
	return image
}

// ============================================================================
// Case 5 — entity-name erasure (hooks produce a literal name, createComponent does not)
// ============================================================================

function case5_literalNameToErasedParam(
	website: EntityAccessor<Website, Website, AnyBrand, 'Website'>,
): EntityAccessorLike<Website> {
	return website
}

function case5_unnamedToErasedParam(
	website: EntityAccessor<Website, Website, AnyBrand, string>,
): EntityAccessorLike<Website> {
	return website
}

// ============================================================================
// Tests
// ============================================================================

describe('selection erasure — EntityRefLike / EntityAccessorLike', () => {
	describe('accepted (previously needed `as unknown as`)', () => {
		test('a narrowly-selected accessor/ref satisfies the erased view', () => {
			assertTrue<IsAssignable<typeof case1_narrowAccessorToErasedParam, (w: EntityAccessor<Website, NarrowWebsite>) => EntityAccessorLike<Website>>>()
			assertTrue<IsAssignable<EntityAccessor<Website, NarrowWebsite>, EntityAccessorLike<Website>>>()
			assertTrue<IsAssignable<EntityRef<Website, NarrowWebsite>, EntityRefLike<Website>>>()
			expect(typeof case1_narrowRefToErasedParam).toBe('function')
		})

		test('a createComponent prop (TEntityName erased to `string`) satisfies the erased view', () => {
			assertTrue<IsAssignable<WebsiteTitleProp, EntityRefLike<Website>>>()
			expect(typeof case1_componentPropToErasedParam).toBe('function')
		})

		test('a free TSelected / free TEntity satisfies the erased view', () => {
			// The interesting half is compile-time; see case2_* above, where TSelected /
			// TEntity are genuinely unresolved type parameters.
			expect(typeof case2_freeSelectionToErasedParam).toBe('function')
			expect(typeof case2_freeEntityToErasedParam).toBe('function')
		})

		test('repeater items forward without a per-call-site cast', () => {
			expect(typeof case3_forwardItems).toBe('function')
		})

		test('a has-one narrowed by a selector satisfies the erased entity view', () => {
			assertTrue<IsAssignable<NarrowImageFromSelection, EntityAccessorLike<Image>>>()
			expect(typeof case4_narrowedHasOneToErasedParam).toBe('function')
		})

		test('a literal and a `string` entity name both satisfy the erased view', () => {
			assertTrue<IsAssignable<EntityAccessor<Website, Website, AnyBrand, 'Website'>, EntityAccessorLike<Website>>>()
			assertTrue<IsAssignable<EntityAccessor<Website, Website, AnyBrand, string>, EntityAccessorLike<Website>>>()
			expect(typeof case5_literalNameToErasedParam).toBe('function')
			expect(typeof case5_unnamedToErasedParam).toBe('function')
		})
	})

	describe('still rejected (the erasure is not a hole)', () => {
		test('an unrelated entity is not accepted', () => {
			assertFalse<IsAssignable<EntityAccessor<Image>, EntityRefLike<Website>>>()
			assertFalse<IsAssignable<EntityAccessor<Author>, EntityRefLike<Website>>>()
			assertFalse<IsAssignable<EntityAccessor<Website>, EntityAccessorLike<Image>>>()
			assertFalse<IsAssignable<EntityAccessor<Website, NarrowWebsite>, EntityRefLike<Image>>>()
			expect(true).toBe(true)
		})

		test('a pointer-only ref is not a live accessor', () => {
			assertFalse<IsAssignable<EntityRef<Website>, EntityAccessorLike<Website>>>()
			assertFalse<IsAssignable<EntityRef<Website, NarrowWebsite>, EntityAccessorLike<Website>>>()
			expect(true).toBe(true)
		})

		test('a has-many list or a scalar field is not an entity', () => {
			assertFalse<IsAssignable<HasManyRef<Website>, EntityRefLike<Website>>>()
			assertFalse<IsAssignable<FieldRef<string>, EntityRefLike<Website>>>()
			expect(true).toBe(true)
		})

		test('a plain object shaped like the entity is not an entity ref', () => {
			assertFalse<IsAssignable<Website, EntityRefLike<Website>>>()
			assertFalse<IsAssignable<{ id: string }, EntityRefLike<Website>>>()
			assertFalse<IsAssignable<{ id: string; $data: unknown }, EntityAccessorLike<Website>>>()
			expect(true).toBe(true)
		})

		test('erasure is one-way — a selection is not handed back for free', () => {
			assertFalse<IsAssignable<EntityRefLike<Website>, EntityRef<Website>>>()
			assertFalse<IsAssignable<EntityRefLike<Website>, EntityRef<Website, NarrowWebsite>>>()
			assertFalse<IsAssignable<EntityAccessorLike<Website>, EntityAccessor<Website>>>()
			assertFalse<IsAssignable<EntityAccessorLike<Website>, EntityAccessor<Website, NarrowWebsite>>>()
			expect(true).toBe(true)
		})

		test('the erased view exposes no field proxy', () => {
			assertTrue<IsAssignable<'id', keyof EntityRefLike<Website>>>()
			assertFalse<IsAssignable<'title', keyof EntityRefLike<Website>>>()
			assertFalse<IsAssignable<'slug', keyof EntityRefLike<Website>>>()
			assertFalse<IsAssignable<'image', keyof EntityAccessorLike<Website>>>()
			assertFalse<IsAssignable<'$fields', keyof EntityAccessorLike<Website>>>()
			expect(true).toBe(true)
		})

		test('widening a selection in place is still rejected', () => {
			// This is the direction that throws UnfetchedFieldError at runtime; the
			// erased views must not have made it legal.
			assertFalse<IsAssignable<EntityAccessor<Website, NarrowWebsite>, EntityAccessor<Website>>>()
			assertFalse<IsAssignable<EntityRef<Website, NarrowWebsite>, EntityRef<Website>>>()
			assertFalse<IsAssignable<EntityAccessor<Website, WebsiteWithNarrowImage>['image'], EntityAccessor<Image>>>()
			expect(true).toBe(true)
		})

		test('the selection brand is not vacuous — a selection the source cannot supply is rejected', () => {
			// `__selected` still carries weight: a target selection that asks for more
			// than the source selected is refused.
			assertFalse<IsAssignable<EntityAccessor<Image>, EntityAccessor<Image, { id: string; caption: string }>>>()
			assertFalse<IsAssignable<EntityAccessor<Website, NarrowWebsite>, EntityAccessor<Website, { id: string; slug: string }>>>()
			// Not asserted here: `EntityAccessor<Website>` against `EntityRef<Website, TSelected>`
			// with a *free* `TSelected`. `[S] extends [T]` stays deferred (`boolean`) while
			// `TSelected` is unresolved, so it cannot be asserted `false` — but the compiler
			// does reject that call, which is exactly why case 2 above needs the erased view.
			expect(true).toBe(true)
		})

		test('narrowing a selection in place keeps working (pre-existing covariance)', () => {
			assertTrue<IsAssignable<EntityAccessor<Website>, EntityAccessor<Website, NarrowWebsite>>>()
			assertTrue<IsAssignable<EntityRef<Website>, EntityRef<Website, NarrowWebsite>>>()
			expect(true).toBe(true)
		})
	})
})
