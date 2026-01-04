import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { IfProps, SelectionFieldMeta, SelectionMeta, SelectionProvider } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { mergeSelections, createEmptySelection } from '../SelectionMeta.js'

/**
 * If component - conditional rendering that ensures both branches are analyzed
 *
 * During collection phase, BOTH branches are analyzed to capture all required fields.
 * During runtime, only the matching branch is rendered.
 *
 * @example
 * ```tsx
 * // With boolean condition
 * <If condition={showBio} then={
 *   <Field field={author.fields.bio} />
 * } />
 *
 * // With field condition
 * <If
 *   condition={author.fields.isPublished}
 *   then={<Field field={author.fields.publishedAt} />}
 *   else={<span>Draft</span>}
 * />
 * ```
 */
function IfImpl({ condition, then: thenBranch, else: elseBranch }: IfProps): ReactElement | null {
	// Resolve condition value
	const conditionValue = typeof condition === 'boolean'
		? condition
		: condition.value

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

	// If condition is a FieldRef, also add that field
	if (typeof props.condition !== 'boolean') {
		const meta = props.condition[FIELD_REF_META]
		result.push({
			fieldName: meta.fieldName,
			alias: meta.fieldName,
			path: meta.path,
			isArray: false,
			isRelation: false,
		})
	}

	return result.length > 0 ? result : null
}

ifWithSelection[BINDX_COMPONENT] = true

export { ifWithSelection as IfWithMeta }
