import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { IfProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, FieldRef } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { mergeSelections, createEmptySelection } from '../SelectionMeta.js'
import { useField } from '../../hooks/useField.js'
import { useRefSubscription } from '../../hooks/useFields.js'
import {
	type Condition,
	isCondition,
	evaluateCondition,
	collectConditionFields,
	CONDITION_META,
} from '../conditions.js'

const NO_CONDITION_FIELDS: readonly unknown[] = []

/**
 * If component - conditional rendering that ensures both branches are analyzed
 *
 * During collection phase, BOTH branches are analyzed to capture all required fields.
 * During runtime, only the matching branch is rendered.
 *
 * Supports three types of conditions:
 * 1. Boolean literals: `condition={true}` or `condition={someBoolean}`
 * 2. FieldRef<boolean>: `condition={task.isActive}` - field value is used
 * 3. Condition objects: `condition={cond.hasItems(task.developers)}` - composable DSL
 *
 * @example
 * ```tsx
 * // With boolean condition
 * <If condition={showBio} then={
 *   <Field field={author.bio} />
 * } />
 *
 * // With field condition
 * <If
 *   condition={author.isPublished}
 *   then={<Field field={author.publishedAt} />}
 *   else={<span>Draft</span>}
 * />
 *
 * // With condition DSL
 * <If
 *   condition={cond.hasItems(task.developers)}
 *   then={<HasMany field={task.developers}>{dev => ...}</HasMany>}
 * />
 *
 * // Complex conditions
 * <If
 *   condition={cond.and(
 *     cond.hasItems(task.developers),
 *     cond.eq(task.status, 'active')
 *   )}
 *   then={<span>Ready to work</span>}
 * />
 * ```
 */
function IfImpl({ condition, then: thenBranch, else: elseBranch }: IfProps): ReactElement | null {
	const fieldRef = typeof condition !== 'boolean' && !isCondition(condition) ? condition : null
	const fieldAccessor = useField(fieldRef)
	// A Condition is evaluated against live data, so it needs a subscription of its own —
	// a memoized <If> is not re-rendered by its parent.
	useRefSubscription(isCondition(condition) ? collectConditionFields(condition) : NO_CONDITION_FIELDS)

	let conditionValue: boolean

	if (typeof condition === 'boolean') {
		conditionValue = condition
	} else if (isCondition(condition)) {
		conditionValue = evaluateCondition(condition)
	} else {
		conditionValue = fieldAccessor?.value ?? false
	}

	return conditionValue ? <>{thenBranch}</> : <>{elseBranch ?? null}</>
}

export const If = memo(IfImpl)

// Static method for selection extraction - analyzes BOTH branches
const ifWithSelection = If as typeof If & SelectionProvider & { [BINDX_COMPONENT]: true }

ifWithSelection.getSelection = (
	props: IfProps,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta[] | null => {
	const thenSelection = collectNested(props.then)
	const elseSelection = props.else ? collectNested(props.else) : createEmptySelection()

	// Merge both selections - we need fields from both branches
	mergeSelections(thenSelection, elseSelection)

	// Return all fields from merged selection
	const result: SelectionFieldMeta[] = []
	for (const field of thenSelection.fields.values()) {
		result.push(field)
	}

	// Collect fields from condition
	if (typeof props.condition !== 'boolean') {
		if (isCondition(props.condition)) {
			// Condition DSL object - collect all referenced fields
			const conditionFields = collectConditionFields(props.condition)
			for (const field of conditionFields) {
				if (field && typeof field === 'object' && FIELD_REF_META in field) {
					const meta = (field as { [FIELD_REF_META]: { fieldName: string; path: string[]; isArray?: boolean; isRelation?: boolean } })[FIELD_REF_META]
					result.push({
						fieldName: meta.fieldName,
						alias: meta.fieldName,
						path: meta.path,
						isArray: meta.isArray ?? false,
						isRelation: meta.isRelation ?? false,
					})
				}
			}
		} else {
			// FieldRef<boolean> - add that field
			const meta = (props.condition as { [FIELD_REF_META]: { fieldName: string; path: string[]; isArray?: boolean; isRelation?: boolean } })[FIELD_REF_META]
			result.push({
				fieldName: meta.fieldName,
				alias: meta.fieldName,
				path: meta.path,
				isArray: false,
				isRelation: false,
			})
		}
	}

	return result.length > 0 ? result : null
}

ifWithSelection[BINDX_COMPONENT] = true

export { ifWithSelection as IfWithMeta }
