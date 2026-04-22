/**
 * Type-level coverage for extracting the target entity from
 * EntityRef / HasOneRef / HasManyRef via `infer`.
 *
 * Background: `EntityRef<T,S,...>` and `HasOneRef<T,S,...>` are type aliases
 * defined as `XxxInterface<T,S,...> & EntityFieldsRef<T,S,...>`. The mapped
 * half of the intersection is hostile to inference: when the target's
 * `TSelected` is a strict subset of `TEntity`, matching against a candidate
 * with `any` in the `TSelected` slot fails structurally and poisons
 * `infer TEntity`, silently falling through to the conditional's fallback.
 *
 * Two safe shapes:
 *   1. `T extends HasOneRef<infer E, infer _S>` — let TS pick `_S` itself.
 *   2. `ExtractHasOneEntity<T>` — routes through `HasOneRefInterface`, where
 *      the bug doesn't apply.
 */

import { describe, test } from 'bun:test'
import type {
	HasOneRef,
	HasManyRef,
	EntityRef,
	ExtractHasOneEntity,
	ExtractHasManyEntity,
	ExtractEntityRefEntity,
} from '@contember/bindx'

type Equal<X, Y> =
	(<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

function assertTrue<T extends true>(): void {}
function assertFalse<T extends false>(): void {}

interface Family {
	id: string
	name: string
	code: string
	tariffs: { id: string; price: number }[]
}

interface Tariff {
	id: string
	name: string
	price: number
}

type FamilyNarrow = { name: string }
type TariffNarrow = { id: string; name: string }

declare const oneFull: HasOneRef<Family, Family>
declare const oneNarrow: HasOneRef<Family, FamilyNarrow>
declare const manyFull: HasManyRef<Tariff, Tariff>
declare const manyNarrow: HasManyRef<Tariff, TariffNarrow>
declare const entityFull: EntityRef<Family, Family>
declare const entityNarrow: EntityRef<Family, FamilyNarrow>

describe('HasOneRef target inference', () => {
	test('broken: <infer T, any> does not infer TEntity for narrow TSelected', () => {
		type Extract<F> = F extends HasOneRef<infer T, any> ? T : object
		assertTrue<Equal<Extract<typeof oneFull>, Family>>()
		assertFalse<Equal<Extract<typeof oneNarrow>, Family>>()
	})

	test('safe: <infer T, infer _S> handles both wide and narrow TSelected', () => {
		type Extract<F> = F extends HasOneRef<infer T, infer _S> ? T : object
		assertTrue<Equal<Extract<typeof oneFull>, Family>>()
		assertTrue<Equal<Extract<typeof oneNarrow>, Family>>()
	})

	test('safe: ExtractHasOneEntity helper handles both wide and narrow TSelected', () => {
		assertTrue<Equal<ExtractHasOneEntity<typeof oneFull>, Family>>()
		assertTrue<Equal<ExtractHasOneEntity<typeof oneNarrow>, Family>>()
	})
})

describe('HasManyRef target inference', () => {
	test('broken: <infer T> (one arg) does not infer TEntity for narrow TSelected', () => {
		type Extract<F> = F extends HasManyRef<infer T> ? T : object
		assertFalse<Equal<Extract<typeof manyNarrow>, Tariff>>()
	})

	test('safe: <infer T, any> works (HasManyRef has no mapped-type intersection)', () => {
		type Extract<F> = F extends HasManyRef<infer T, any> ? T : object
		assertTrue<Equal<Extract<typeof manyFull>, Tariff>>()
		assertTrue<Equal<Extract<typeof manyNarrow>, Tariff>>()
	})

	test('safe: <infer T, infer _S> works', () => {
		type Extract<F> = F extends HasManyRef<infer T, infer _S> ? T : object
		assertTrue<Equal<Extract<typeof manyFull>, Tariff>>()
		assertTrue<Equal<Extract<typeof manyNarrow>, Tariff>>()
	})

	test('safe: ExtractHasManyEntity helper works', () => {
		assertTrue<Equal<ExtractHasManyEntity<typeof manyFull>, Tariff>>()
		assertTrue<Equal<ExtractHasManyEntity<typeof manyNarrow>, Tariff>>()
	})
})

describe('EntityRef target inference', () => {
	test('broken: <infer T, any> does not infer TEntity for narrow TSelected', () => {
		type Extract<F> = F extends EntityRef<infer T, any> ? T : object
		assertTrue<Equal<Extract<typeof entityFull>, Family>>()
		assertFalse<Equal<Extract<typeof entityNarrow>, Family>>()
	})

	test('safe: <infer T, infer _S> handles both wide and narrow TSelected', () => {
		type Extract<F> = F extends EntityRef<infer T, infer _S> ? T : object
		assertTrue<Equal<Extract<typeof entityFull>, Family>>()
		assertTrue<Equal<Extract<typeof entityNarrow>, Family>>()
	})

	test('safe: ExtractEntityRefEntity helper handles both wide and narrow TSelected', () => {
		assertTrue<Equal<ExtractEntityRefEntity<typeof entityFull>, Family>>()
		assertTrue<Equal<ExtractEntityRefEntity<typeof entityNarrow>, Family>>()
	})
})
