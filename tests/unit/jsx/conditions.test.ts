import { describe, test, expect } from 'bun:test'
import { cond, type Condition } from '@contember/bindx-react'
import type { FieldRef, HasManyRef, HasOneRef } from '@contember/bindx'

// Access CONDITION_META via the internal symbol on Condition objects
// This works because we're testing the actual condition objects returned by cond
function getConditionMeta(condition: Condition): { type: string; fields: unknown[]; evaluate: () => boolean } {
	// CONDITION_META is a symbol key on Condition objects
	const symbolKeys = Object.getOwnPropertySymbols(condition)
	const metaSymbol = symbolKeys.find(s => s.description === 'CONDITION_META')
	if (!metaSymbol) throw new Error('CONDITION_META not found on condition')
	const meta = (condition as unknown as Record<symbol, { type: string; fields: unknown[]; evaluate: () => boolean }>)[metaSymbol]
	if (!meta) throw new Error('CONDITION_META value is undefined')
	return meta
}

function evaluateCondition(condition: Condition): boolean {
	return getConditionMeta(condition).evaluate()
}

function collectConditionFields(condition: Condition): unknown[] {
	return getConditionMeta(condition).fields
}

function isCondition(value: unknown): value is Condition {
	if (typeof value !== 'object' || value === null) return false
	const symbolKeys = Object.getOwnPropertySymbols(value)
	return symbolKeys.some(s => s.description === 'CONDITION_META')
}

// Mock FieldRef for testing
function createMockFieldRef<T>(value: T): FieldRef<T> {
	return {
		value,
		serverValue: value,
		isDirty: false,
		isTouched: false,
		hasError: false,
		errors: [],
		fieldName: 'testField',
		path: ['testField'],
		setValue: () => {},
		touch: () => {},
		addError: () => {},
		clearErrors: () => {},
		onChange: () => () => {},
		onChanging: () => () => {},
		inputProps: {
			value,
			setValue: () => {},
			onChange: () => {},
		},
		nested: () => ({}) as any,
	} as unknown as FieldRef<T>
}

// Mock HasManyRef for testing
function createMockHasManyRef(length: number): HasManyRef<unknown> {
	const items = Array.from({ length }, (_, i) => ({ id: `item-${i}` }))
	return {
		length,
		items,
		map: <R>(fn: (item: any, index: number) => R) => items.map(fn),
		add: () => '',
		remove: () => {},
		move: () => {},
		isDirty: false,
		$state: 'loaded',
	} as unknown as HasManyRef<unknown>
}

// Mock HasOneRef for testing
function createMockHasOneRef(state: 'connected' | 'disconnected'): HasOneRef<unknown> {
	return {
		$state: state,
		$entity: state === 'connected' ? { id: 'entity-1' } : null,
		connect: () => {},
		disconnect: () => {},
		create: () => {},
		isDirty: false,
	} as unknown as HasOneRef<unknown>
}

describe('conditions DSL', () => {
	// ==================== Has-Many Conditions ====================

	describe('hasItems', () => {
		test('returns true when has-many has items', () => {
			const field = createMockHasManyRef(3)
			const condition = cond.hasItems(field)

			expect(isCondition(condition)).toBe(true)
			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when has-many is empty', () => {
			const field = createMockHasManyRef(0)
			const condition = cond.hasItems(field)

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockHasManyRef(1)
			const condition = cond.hasItems(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockHasManyRef(1)
			const condition = cond.hasItems(field)

			expect(getConditionMeta(condition).type).toBe('hasItems')
		})
	})

	describe('isEmpty', () => {
		test('returns true when has-many is empty', () => {
			const field = createMockHasManyRef(0)
			const condition = cond.isEmpty(field)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when has-many has items', () => {
			const field = createMockHasManyRef(2)
			const condition = cond.isEmpty(field)

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockHasManyRef(0)
			const condition = cond.isEmpty(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockHasManyRef(0)
			const condition = cond.isEmpty(field)

			expect(getConditionMeta(condition).type).toBe('isEmpty')
		})
	})

	// ==================== Has-One Conditions ====================

	describe('isConnected', () => {
		test('returns true when has-one is connected', () => {
			const field = createMockHasOneRef('connected')
			const condition = cond.isConnected(field)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when has-one is disconnected', () => {
			const field = createMockHasOneRef('disconnected')
			const condition = cond.isConnected(field)

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockHasOneRef('connected')
			const condition = cond.isConnected(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockHasOneRef('connected')
			const condition = cond.isConnected(field)

			expect(getConditionMeta(condition).type).toBe('isConnected')
		})
	})

	describe('isDisconnected', () => {
		test('returns true when has-one is disconnected', () => {
			const field = createMockHasOneRef('disconnected')
			const condition = cond.isDisconnected(field)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when has-one is connected', () => {
			const field = createMockHasOneRef('connected')
			const condition = cond.isDisconnected(field)

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockHasOneRef('disconnected')
			const condition = cond.isDisconnected(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockHasOneRef('disconnected')
			const condition = cond.isDisconnected(field)

			expect(getConditionMeta(condition).type).toBe('isDisconnected')
		})
	})

	// ==================== Field Value Conditions ====================

	describe('eq', () => {
		test('returns true when field value equals the target', () => {
			const field = createMockFieldRef('active')
			const condition = cond.eq(field, 'active')

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when field value does not equal the target', () => {
			const field = createMockFieldRef('active')
			const condition = cond.eq(field, 'inactive')

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('works with numbers', () => {
			const field = createMockFieldRef(42)
			const condition = cond.eq(field, 42)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('works with null values', () => {
			const field = createMockFieldRef<string | null>(null)
			const condition = cond.eq(field, null)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('collects the field reference', () => {
			const field = createMockFieldRef('value')
			const condition = cond.eq(field, 'value')

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockFieldRef('value')
			const condition = cond.eq(field, 'value')

			expect(getConditionMeta(condition).type).toBe('eq')
		})
	})

	describe('neq', () => {
		test('returns true when field value does not equal the target', () => {
			const field = createMockFieldRef('active')
			const condition = cond.neq(field, 'inactive')

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when field value equals the target', () => {
			const field = createMockFieldRef('active')
			const condition = cond.neq(field, 'active')

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockFieldRef('value')
			const condition = cond.neq(field, 'other')

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockFieldRef('value')
			const condition = cond.neq(field, 'other')

			expect(getConditionMeta(condition).type).toBe('neq')
		})
	})

	describe('isNull', () => {
		test('returns true when field value is null', () => {
			const field = createMockFieldRef<string | null>(null)
			const condition = cond.isNull(field)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when field value is not null', () => {
			const field = createMockFieldRef<string | null>('value')
			const condition = cond.isNull(field)

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockFieldRef<string | null>(null)
			const condition = cond.isNull(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockFieldRef<string | null>(null)
			const condition = cond.isNull(field)

			expect(getConditionMeta(condition).type).toBe('isNull')
		})
	})

	describe('isNotNull', () => {
		test('returns true when field value is not null', () => {
			const field = createMockFieldRef<string | null>('value')
			const condition = cond.isNotNull(field)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when field value is null', () => {
			const field = createMockFieldRef<string | null>(null)
			const condition = cond.isNotNull(field)

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockFieldRef<string | null>('value')
			const condition = cond.isNotNull(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockFieldRef<string | null>('value')
			const condition = cond.isNotNull(field)

			expect(getConditionMeta(condition).type).toBe('isNotNull')
		})
	})

	describe('isTruthy', () => {
		test('returns true for truthy values', () => {
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef(true)))).toBe(true)
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef(1)))).toBe(true)
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef('text')))).toBe(true)
		})

		test('returns false for falsy values', () => {
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef(false)))).toBe(false)
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef(0)))).toBe(false)
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef('')))).toBe(false)
			expect(evaluateCondition(cond.isTruthy(createMockFieldRef<null>(null)))).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockFieldRef(true)
			const condition = cond.isTruthy(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockFieldRef(true)
			const condition = cond.isTruthy(field)

			expect(getConditionMeta(condition).type).toBe('isTruthy')
		})
	})

	describe('isFalsy', () => {
		test('returns true for falsy values', () => {
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef(false)))).toBe(true)
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef(0)))).toBe(true)
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef('')))).toBe(true)
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef<null>(null)))).toBe(true)
		})

		test('returns false for truthy values', () => {
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef(true)))).toBe(false)
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef(1)))).toBe(false)
			expect(evaluateCondition(cond.isFalsy(createMockFieldRef('text')))).toBe(false)
		})

		test('collects the field reference', () => {
			const field = createMockFieldRef(false)
			const condition = cond.isFalsy(field)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const field = createMockFieldRef(false)
			const condition = cond.isFalsy(field)

			expect(getConditionMeta(condition).type).toBe('isFalsy')
		})
	})

	// ==================== Logical Combinators ====================

	describe('and', () => {
		test('returns true when all conditions are true', () => {
			const field1 = createMockFieldRef(true)
			const field2 = createMockFieldRef(true)
			const condition = cond.and(cond.isTruthy(field1), cond.isTruthy(field2))

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when any condition is false', () => {
			const field1 = createMockFieldRef(true)
			const field2 = createMockFieldRef(false)
			const condition = cond.and(cond.isTruthy(field1), cond.isTruthy(field2))

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('returns false when all conditions are false', () => {
			const field1 = createMockFieldRef(false)
			const field2 = createMockFieldRef(false)
			const condition = cond.and(cond.isTruthy(field1), cond.isTruthy(field2))

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('works with multiple conditions', () => {
			const field1 = createMockFieldRef(true)
			const field2 = createMockFieldRef(true)
			const field3 = createMockFieldRef(true)
			const condition = cond.and(
				cond.isTruthy(field1),
				cond.isTruthy(field2),
				cond.isTruthy(field3),
			)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('collects all field references from nested conditions', () => {
			const field1 = createMockFieldRef('a')
			const field2 = createMockFieldRef('b')
			const condition = cond.and(cond.eq(field1, 'a'), cond.eq(field2, 'b'))

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(2)
			expect(fields).toContain(field1)
			expect(fields).toContain(field2)
		})

		test('has correct type metadata', () => {
			const condition = cond.and(
				cond.isTruthy(createMockFieldRef(true)),
				cond.isTruthy(createMockFieldRef(true)),
			)

			expect(getConditionMeta(condition).type).toBe('and')
		})
	})

	describe('or', () => {
		test('returns true when any condition is true', () => {
			const field1 = createMockFieldRef(true)
			const field2 = createMockFieldRef(false)
			const condition = cond.or(cond.isTruthy(field1), cond.isTruthy(field2))

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns true when all conditions are true', () => {
			const field1 = createMockFieldRef(true)
			const field2 = createMockFieldRef(true)
			const condition = cond.or(cond.isTruthy(field1), cond.isTruthy(field2))

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('returns false when all conditions are false', () => {
			const field1 = createMockFieldRef(false)
			const field2 = createMockFieldRef(false)
			const condition = cond.or(cond.isTruthy(field1), cond.isTruthy(field2))

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('works with multiple conditions', () => {
			const field1 = createMockFieldRef(false)
			const field2 = createMockFieldRef(false)
			const field3 = createMockFieldRef(true)
			const condition = cond.or(
				cond.isTruthy(field1),
				cond.isTruthy(field2),
				cond.isTruthy(field3),
			)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('collects all field references from nested conditions', () => {
			const field1 = createMockFieldRef('a')
			const field2 = createMockFieldRef('b')
			const condition = cond.or(cond.eq(field1, 'a'), cond.eq(field2, 'b'))

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(2)
			expect(fields).toContain(field1)
			expect(fields).toContain(field2)
		})

		test('has correct type metadata', () => {
			const condition = cond.or(
				cond.isTruthy(createMockFieldRef(true)),
				cond.isTruthy(createMockFieldRef(false)),
			)

			expect(getConditionMeta(condition).type).toBe('or')
		})
	})

	describe('not', () => {
		test('negates a true condition', () => {
			const field = createMockFieldRef(true)
			const condition = cond.not(cond.isTruthy(field))

			expect(evaluateCondition(condition)).toBe(false)
		})

		test('negates a false condition', () => {
			const field = createMockFieldRef(false)
			const condition = cond.not(cond.isTruthy(field))

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('collects field references from inner condition', () => {
			const field = createMockFieldRef(true)
			const condition = cond.not(cond.isTruthy(field))

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(1)
			expect(fields[0]).toBe(field)
		})

		test('has correct type metadata', () => {
			const condition = cond.not(cond.isTruthy(createMockFieldRef(true)))

			expect(getConditionMeta(condition).type).toBe('not')
		})

		test('can be combined with other conditions', () => {
			const field1 = createMockHasManyRef(0)
			const field2 = createMockHasOneRef('connected')
			const condition = cond.and(
				cond.not(cond.hasItems(field1)),
				cond.isConnected(field2),
			)

			expect(evaluateCondition(condition)).toBe(true)
		})
	})

	// ==================== Complex Combinations ====================

	describe('complex combinations', () => {
		test('deeply nested conditions work correctly', () => {
			const hasItems = createMockHasManyRef(2)
			const isConnected = createMockHasOneRef('connected')
			const status = createMockFieldRef('active')

			const condition = cond.and(
				cond.or(
					cond.hasItems(hasItems),
					cond.isConnected(isConnected),
				),
				cond.not(cond.eq(status, 'archived')),
			)

			expect(evaluateCondition(condition)).toBe(true)
		})

		test('collects all fields from deeply nested conditions', () => {
			const field1 = createMockHasManyRef(1)
			const field2 = createMockHasOneRef('connected')
			const field3 = createMockFieldRef('active')

			const condition = cond.and(
				cond.or(
					cond.hasItems(field1),
					cond.isConnected(field2),
				),
				cond.not(cond.eq(field3, 'archived')),
			)

			const fields = collectConditionFields(condition)
			expect(fields).toHaveLength(3)
			expect(fields).toContain(field1)
			expect(fields).toContain(field2)
			expect(fields).toContain(field3)
		})
	})

	// ==================== Helper Functions ====================

	describe('isCondition', () => {
		test('returns true for condition objects', () => {
			const condition = cond.isTruthy(createMockFieldRef(true))

			expect(isCondition(condition)).toBe(true)
		})

		test('returns false for non-condition objects', () => {
			expect(isCondition(null)).toBe(false)
			expect(isCondition(undefined)).toBe(false)
			expect(isCondition(true)).toBe(false)
			expect(isCondition(false)).toBe(false)
			expect(isCondition({})).toBe(false)
			expect(isCondition({ type: 'fake' })).toBe(false)
		})

		test('returns false for primitives', () => {
			expect(isCondition(42)).toBe(false)
			expect(isCondition('string')).toBe(false)
		})
	})
})
