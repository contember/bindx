import React, {
	Children,
	Fragment,
	isValidElement,
	memo,
	type ReactElement,
	type ReactNode,
} from 'react'
import type {
	FieldRef,
	SelectionFieldMeta,
	SelectionMeta,
	SelectionProvider,
} from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { useFields, useRefSubscription } from '../../hooks/useFields.js'
import {
	type Condition,
	isCondition,
	evaluateCondition,
	collectConditionFields,
} from '../conditions.js'

/**
 * Props for <Case>. Discriminated union: exactly one of `show` or `if` must be set.
 *
 * - `show={fieldRef}` matches when the field value is neither `null` nor `undefined`.
 *   Children may be a callback receiving the non-null value.
 * - `if={cond}` accepts a boolean, a `FieldRef<boolean>`, or a `Condition` DSL object.
 */
export type CaseProps<T = unknown> =
	| {
			show: FieldRef<T>
			if?: never
			children: ReactNode | ((value: NonNullable<T>) => ReactNode)
	  }
	| {
			show?: never
			if: Condition | FieldRef<boolean> | boolean
			children: ReactNode
	  }

export interface DefaultProps {
	children: ReactNode
}

export interface SwitchProps {
	children: ReactNode
}

/**
 * Marker component for a case branch inside <Switch>. Never renders on its own —
 * <Switch> reads its props to decide which branch to render.
 */
export function Case<T>(_props: CaseProps<T>): null {
	return null
}

/**
 * Marker component for the fallback branch inside <Switch>. At most one allowed.
 */
export function Default(_props: DefaultProps): null {
	return null
}

// =============================================================================
// Child extraction
// =============================================================================

interface CaseEntry {
	readonly props: CaseProps<unknown>
}

interface DefaultEntry {
	readonly props: DefaultProps
}

interface SwitchEntries {
	readonly cases: readonly CaseEntry[]
	readonly defaultEntry: DefaultEntry | null
}

function isFieldRef(value: unknown): value is FieldRef<unknown> {
	return typeof value === 'object' && value !== null && FIELD_REF_META in value
}

function extractEntries(children: ReactNode): SwitchEntries {
	const cases: CaseEntry[] = []
	let defaultEntry: DefaultEntry | null = null

	const visit = (node: ReactNode): void => {
		if (node === null || node === undefined || typeof node === 'boolean') return
		if (typeof node === 'string' || typeof node === 'number') return
		if (Array.isArray(node)) {
			for (const child of node) visit(child)
			return
		}
		if (!isValidElement(node)) return
		if (node.type === Fragment) {
			visit((node.props as { children?: ReactNode }).children)
			return
		}
		if (node.type === Case) {
			cases.push({ props: node.props as CaseProps<unknown> })
			return
		}
		if (node.type === Default) {
			if (defaultEntry !== null) {
				throw new Error('<Switch> allows at most one <Default>')
			}
			defaultEntry = { props: node.props as DefaultProps }
			return
		}
		throw new Error('<Switch> children must be <Case> or <Default>')
	}

	Children.forEach(children, visit)

	return { cases, defaultEntry }
}

function resolveTriggerField(props: CaseProps<unknown>): FieldRef<unknown> | null {
	if ('show' in props && props.show !== undefined) {
		return props.show
	}
	if ('if' in props && props.if !== undefined) {
		const condition = props.if
		if (typeof condition !== 'boolean' && !isCondition(condition)) {
			return condition as FieldRef<unknown>
		}
	}
	return null
}

/**
 * Fields read by `if={cond...}` cases. They are evaluated against live data, so they need
 * a subscription of their own — a memoized <Switch> is not re-rendered by its parent.
 */
function collectConditionRefs(cases: readonly CaseEntry[]): unknown[] {
	const refs: unknown[] = []
	for (const { props } of cases) {
		if ('if' in props && props.if !== undefined && isCondition(props.if)) {
			refs.push(...collectConditionFields(props.if))
		}
	}
	return refs
}

// =============================================================================
// Runtime
// =============================================================================

function SwitchImpl({ children }: SwitchProps): ReactElement | null {
	const entries = extractEntries(children)

	// Two fixed hooks cover every case, so the hook count never depends on how many
	// <Case> children are rendered (a conditional <Case> used to crash React).
	const accessors = useFields(entries.cases.map(entry => resolveTriggerField(entry.props)))
	useRefSubscription(collectConditionRefs(entries.cases))

	for (let i = 0; i < entries.cases.length; i++) {
		const { props } = entries.cases[i]!
		const accessor = accessors[i]

		if ('show' in props && props.show !== undefined) {
			const value = accessor?.value
			if (value !== null && value !== undefined) {
				const rendered = typeof props.children === 'function'
					? props.children(value as NonNullable<unknown>)
					: props.children
				return <>{rendered}</>
			}
			continue
		}

		const condition = props.if
		let matched: boolean
		if (typeof condition === 'boolean') {
			matched = condition
		} else if (isCondition(condition)) {
			matched = evaluateCondition(condition)
		} else {
			matched = Boolean(accessor?.value)
		}
		if (matched) {
			return <>{props.children}</>
		}
	}

	if (entries.defaultEntry !== null) {
		return <>{entries.defaultEntry.props.children}</>
	}
	return null
}

export const Switch = memo(SwitchImpl)

// =============================================================================
// Selection analysis
// =============================================================================

function fieldRefToSelectionField(ref: FieldRef<unknown>): SelectionFieldMeta {
	const meta = ref[FIELD_REF_META]
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: meta.isArray ?? false,
		isRelation: meta.isRelation ?? false,
	}
}

function pushNestedFields(
	target: SelectionFieldMeta[],
	nested: SelectionMeta,
): void {
	for (const field of nested.fields.values()) {
		target.push(field)
	}
}

const caseWithSelection = Case as typeof Case & SelectionProvider & { [BINDX_COMPONENT]: true }

caseWithSelection.getSelection = (
	props: CaseProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta[] | null => {
	const result: SelectionFieldMeta[] = []

	if ('show' in props && props.show !== undefined) {
		result.push(fieldRefToSelectionField(props.show))
	} else if ('if' in props && props.if !== undefined) {
		const condition = props.if
		if (typeof condition !== 'boolean') {
			if (isCondition(condition)) {
				for (const field of collectConditionFields(condition)) {
					if (isFieldRef(field)) {
						result.push(fieldRefToSelectionField(field))
					}
				}
			} else if (isFieldRef(condition)) {
				result.push(fieldRefToSelectionField(condition))
			}
		}
	}

	// Callback children can't be statically analyzed.
	if (typeof props.children !== 'function') {
		pushNestedFields(result, collectNested(props.children))
	}

	return result.length > 0 ? result : null
}

caseWithSelection[BINDX_COMPONENT] = true

const defaultWithSelection = Default as typeof Default & SelectionProvider & { [BINDX_COMPONENT]: true }

defaultWithSelection.getSelection = (
	props: DefaultProps,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta[] | null => {
	const result: SelectionFieldMeta[] = []
	pushNestedFields(result, collectNested(props.children))
	return result.length > 0 ? result : null
}

defaultWithSelection[BINDX_COMPONENT] = true

const switchWithSelection = Switch as typeof Switch & SelectionProvider & { [BINDX_COMPONENT]: true }

switchWithSelection.getSelection = (
	props: SwitchProps,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta[] | null => {
	const result: SelectionFieldMeta[] = []
	pushNestedFields(result, collectNested(props.children))
	return result.length > 0 ? result : null
}

switchWithSelection[BINDX_COMPONENT] = true

export {
	switchWithSelection as SwitchWithMeta,
	caseWithSelection as CaseWithMeta,
	defaultWithSelection as DefaultWithMeta,
}
