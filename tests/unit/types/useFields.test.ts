import { describe, expect, test } from 'bun:test'
import type { FieldAccessor, FieldRef } from '@contember/bindx'
import { useFields } from '@contember/bindx-react'

type IsEqual<TLeft, TRight> =
	(<T>() => T extends TLeft ? 1 : 2) extends
	(<T>() => T extends TRight ? 1 : 2)
		? true
		: false

function assertTrue<T extends true>(): void {}

function useMappedTuple(
	refs: readonly [FieldRef<string>, FieldRef<boolean>, null],
) {
	return useFields(refs)
}

function useMappedArray(refs: readonly FieldRef<string>[]): readonly FieldAccessor<string>[] {
	return useFields(refs)
}

function useMappedNullableArray(
	refs: readonly (FieldRef<string> | null)[],
): readonly (FieldAccessor<string> | null)[] {
	return useFields(refs)
}

type MappedTuple = ReturnType<typeof useMappedTuple>
type ExpectedTuple = readonly [FieldAccessor<string>, FieldAccessor<boolean>, null]

describe('useFields types', () => {
	test('maps heterogeneous tuples by position', () => {
		assertTrue<IsEqual<MappedTuple, ExpectedTuple>>()
		expect(typeof useMappedTuple).toBe('function')
	})

	test('keeps homogeneous readonly arrays assignable', () => {
		expect(typeof useMappedArray).toBe('function')
		expect(typeof useMappedNullableArray).toBe('function')
	})
})
