/**
 * Composable condition DSL for the <If> component.
 *
 * Provides a type-safe way to express conditions on FieldRef, HasManyRef, and HasOneRef
 * that works correctly during collection phase. The condition builders ensure that
 * referenced fields are collected for the GraphQL query, even when the condition
 * evaluates to false during collection.
 *
 * @example
 * ```tsx
 * import { cond } from '@contember/bindx-react'
 *
 * // Simple conditions
 * <If condition={cond.hasItems(task.developers)} then={...} />
 * <If condition={cond.eq(task.status, 'active')} then={...} />
 *
 * // Complex conditions with AND/OR/NOT
 * <If condition={cond.and(
 *   cond.hasItems(task.developers),
 *   cond.eq(task.status, 'active')
 * )} then={...} />
 *
 * <If condition={cond.or(
 *   cond.isEmpty(task.developers),
 *   cond.not(cond.isConnected(task.project))
 * )} then={...} />
 * ```
 *
 * @packageDocumentation
 */

import type {
	FieldRef,
	FieldRefBase,
	HasManyRef,
	HasManyRefBase,
	HasOneRef,
	HasOneRefBase,
} from '@contember/bindx'

// ============================================================================
// Symbols and Types
// ============================================================================

/**
 * Symbol to identify condition objects
 */
export const CONDITION_META = Symbol('CONDITION_META')

/**
 * Internal metadata for a condition.
 */
export interface ConditionMeta {
	/** Condition type identifier for debugging */
	readonly type: string
	/** Fields to collect for selection (FieldRef/HasManyRef/HasOneRef) */
	readonly fields: unknown[]
	/** Evaluate condition at runtime */
	readonly evaluate: () => boolean
}

/**
 * A composable condition for the <If> component.
 *
 * Conditions can be combined using `cond.and()`, `cond.or()`, and `cond.not()`.
 * All referenced fields are automatically collected for the GraphQL query.
 */
export interface Condition {
	readonly [CONDITION_META]: ConditionMeta
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Base type for scalar fields - accepts both FieldRef and FieldRefBase.
 */
type AnyScalarField<T> = FieldRefBase<T>

/**
 * Base type for has-many - accepts both HasManyRef and HasManyRefBase.
 */
type AnyHasManyField = HasManyRefBase<any, any, any, any, any>

/**
 * Base type for has-one - accepts both HasOneRef and HasOneRefBase.
 */
type AnyHasOneField = HasOneRefBase<any, any, any, any, any>

// ============================================================================
// Condition Builder Object
// ============================================================================

/**
 * Condition builder - single import for all condition operations.
 *
 * Use this to create conditions for the <If> component that work correctly
 * during both collection and runtime phases.
 *
 * @example
 * ```tsx
 * import { cond } from '@contember/bindx-react'
 *
 * // Simple conditions
 * <If condition={cond.hasItems(task.developers)} then={...} />
 * <If condition={cond.eq(task.status, 'active')} then={...} />
 *
 * // Complex conditions with AND/OR/NOT
 * <If condition={cond.and(
 *   cond.hasItems(task.developers),
 *   cond.eq(task.status, 'active')
 * )} then={...} />
 *
 * <If condition={cond.or(
 *   cond.isEmpty(task.developers),
 *   cond.not(cond.isConnected(task.project))
 * )} then={...} />
 * ```
 */
export const cond = {
	// ==================== Has-Many Conditions ====================

	/**
	 * Check if a has-many relation has items.
	 *
	 * @param field - The has-many field reference
	 * @returns A condition that is true when the relation has at least one item
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.hasItems(task.developers)} then={
	 *   <HasMany field={task.developers}>{dev => <span>{dev.name.value}</span>}</HasMany>
	 * } />
	 * ```
	 */
	hasItems(field: AnyHasManyField): Condition {
		return {
			[CONDITION_META]: {
				type: 'hasItems',
				fields: [field],
				evaluate: () => (field as HasManyRef<any>).length > 0,
			},
		}
	},

	/**
	 * Check if a has-many relation is empty.
	 *
	 * @param field - The has-many field reference
	 * @returns A condition that is true when the relation has no items
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isEmpty(task.developers)} then={
	 *   <span>No developers assigned</span>
	 * } />
	 * ```
	 */
	isEmpty(field: AnyHasManyField): Condition {
		return {
			[CONDITION_META]: {
				type: 'isEmpty',
				fields: [field],
				evaluate: () => (field as HasManyRef<any>).length === 0,
			},
		}
	},

	// ==================== Has-One Conditions ====================

	/**
	 * Check if a has-one relation is connected.
	 *
	 * @param field - The has-one field reference
	 * @returns A condition that is true when the relation points to an entity
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isConnected(task.project)} then={
	 *   <HasOne field={task.project}>{project => <span>{project.name.value}</span>}</HasOne>
	 * } />
	 * ```
	 */
	isConnected(field: AnyHasOneField): Condition {
		return {
			[CONDITION_META]: {
				type: 'isConnected',
				fields: [field],
				evaluate: () => (field as HasOneRef<any>).$state === 'connected',
			},
		}
	},

	/**
	 * Check if a has-one relation is disconnected.
	 *
	 * @param field - The has-one field reference
	 * @returns A condition that is true when the relation is not connected
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isDisconnected(task.project)} then={
	 *   <span>No project assigned</span>
	 * } />
	 * ```
	 */
	isDisconnected(field: AnyHasOneField): Condition {
		return {
			[CONDITION_META]: {
				type: 'isDisconnected',
				fields: [field],
				evaluate: () => (field as HasOneRef<any>).$state === 'disconnected',
			},
		}
	},

	// ==================== Field Value Conditions ====================

	/**
	 * Check if a field equals a value.
	 *
	 * @param field - The field reference
	 * @param value - The value to compare against
	 * @returns A condition that is true when the field value equals the given value
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.eq(task.status, 'completed')} then={
	 *   <span className="text-green-500">Done!</span>
	 * } />
	 * ```
	 */
	eq<T>(field: AnyScalarField<T>, value: T): Condition {
		return {
			[CONDITION_META]: {
				type: 'eq',
				fields: [field],
				evaluate: () => (field as FieldRef<T>).value === value,
			},
		}
	},

	/**
	 * Check if a field is not equal to a value.
	 *
	 * @param field - The field reference
	 * @param value - The value to compare against
	 * @returns A condition that is true when the field value does not equal the given value
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.neq(task.status, 'cancelled')} then={
	 *   <TaskActions task={task} />
	 * } />
	 * ```
	 */
	neq<T>(field: AnyScalarField<T>, value: T): Condition {
		return {
			[CONDITION_META]: {
				type: 'neq',
				fields: [field],
				evaluate: () => (field as FieldRef<T>).value !== value,
			},
		}
	},

	/**
	 * Check if a field is null.
	 *
	 * @param field - The field reference
	 * @returns A condition that is true when the field value is null
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isNull(task.completedAt)} then={
	 *   <span>In progress</span>
	 * } />
	 * ```
	 */
	isNull<T>(field: AnyScalarField<T>): Condition {
		return {
			[CONDITION_META]: {
				type: 'isNull',
				fields: [field],
				evaluate: () => (field as FieldRef<T>).value === null,
			},
		}
	},

	/**
	 * Check if a field is not null.
	 *
	 * @param field - The field reference
	 * @returns A condition that is true when the field value is not null
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isNotNull(task.completedAt)} then={
	 *   <span>Completed: {task.completedAt.value}</span>
	 * } />
	 * ```
	 */
	isNotNull<T>(field: AnyScalarField<T>): Condition {
		return {
			[CONDITION_META]: {
				type: 'isNotNull',
				fields: [field],
				evaluate: () => (field as FieldRef<T>).value !== null,
			},
		}
	},

	/**
	 * Check if a field value is truthy.
	 *
	 * @param field - The field reference (typically boolean)
	 * @returns A condition that is true when the field value is truthy
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isTruthy(task.isUrgent)} then={
	 *   <Badge variant="destructive">Urgent!</Badge>
	 * } />
	 * ```
	 */
	isTruthy<T>(field: AnyScalarField<T>): Condition {
		return {
			[CONDITION_META]: {
				type: 'isTruthy',
				fields: [field],
				evaluate: () => Boolean((field as FieldRef<T>).value),
			},
		}
	},

	/**
	 * Check if a field value is falsy.
	 *
	 * @param field - The field reference (typically boolean)
	 * @returns A condition that is true when the field value is falsy
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.isFalsy(task.isArchived)} then={
	 *   <TaskActions task={task} />
	 * } />
	 * ```
	 */
	isFalsy<T>(field: AnyScalarField<T>): Condition {
		return {
			[CONDITION_META]: {
				type: 'isFalsy',
				fields: [field],
				evaluate: () => !(field as FieldRef<T>).value,
			},
		}
	},

	// ==================== Logical Combinators ====================

	/**
	 * Logical AND - all conditions must be true.
	 *
	 * @param conditions - Conditions to combine
	 * @returns A condition that is true when all given conditions are true
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.and(
	 *   cond.hasItems(task.developers),
	 *   cond.eq(task.status, 'active'),
	 *   cond.isConnected(task.project)
	 * )} then={
	 *   <span>Task is ready</span>
	 * } />
	 * ```
	 */
	and(...conditions: Condition[]): Condition {
		return {
			[CONDITION_META]: {
				type: 'and',
				fields: conditions.flatMap(c => c[CONDITION_META].fields),
				evaluate: () => conditions.every(c => c[CONDITION_META].evaluate()),
			},
		}
	},

	/**
	 * Logical OR - at least one condition must be true.
	 *
	 * @param conditions - Conditions to combine
	 * @returns A condition that is true when at least one given condition is true
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.or(
	 *   cond.eq(task.status, 'completed'),
	 *   cond.eq(task.status, 'cancelled')
	 * )} then={
	 *   <span>Task is finished</span>
	 * } />
	 * ```
	 */
	or(...conditions: Condition[]): Condition {
		return {
			[CONDITION_META]: {
				type: 'or',
				fields: conditions.flatMap(c => c[CONDITION_META].fields),
				evaluate: () => conditions.some(c => c[CONDITION_META].evaluate()),
			},
		}
	},

	/**
	 * Logical NOT - negate a condition.
	 *
	 * @param condition - Condition to negate
	 * @returns A condition that is true when the given condition is false
	 *
	 * @example
	 * ```tsx
	 * <If condition={cond.not(cond.isConnected(task.project))} then={
	 *   <span>No project assigned</span>
	 * } />
	 * ```
	 */
	not(condition: Condition): Condition {
		return {
			[CONDITION_META]: {
				type: 'not',
				fields: condition[CONDITION_META].fields,
				evaluate: () => !condition[CONDITION_META].evaluate(),
			},
		}
	},
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a value is a Condition object.
 *
 * @param value - Value to check
 * @returns True if the value is a Condition
 */
export function isCondition(value: unknown): value is Condition {
	return typeof value === 'object' && value !== null && CONDITION_META in value
}

/**
 * Collect all field references from a condition.
 * Used by the selection collector to ensure all fields are included in the query.
 *
 * @param condition - The condition to collect fields from
 * @returns Array of field references
 */
export function collectConditionFields(condition: Condition): unknown[] {
	return condition[CONDITION_META].fields
}

/**
 * Evaluate a condition at runtime.
 *
 * @param condition - The condition to evaluate
 * @returns The boolean result of the condition
 */
export function evaluateCondition(condition: Condition): boolean {
	return condition[CONDITION_META].evaluate()
}
