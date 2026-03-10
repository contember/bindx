/**
 * Composable filter UI components using Radix Slot pattern.
 *
 * All trigger components use `@radix-ui/react-slot` for proper prop merging
 * and `forwardRef` for ref forwarding. Filter names can be inferred from
 * context (via DataViewTextFilter, DataViewFilterScope, etc.) or passed explicitly.
 *
 * Usage:
 * ```tsx
 * // With explicit name
 * <DataViewTextFilterInput name="title">
 *   <input placeholder="Search..." />
 * </DataViewTextFilterInput>
 *
 * // With context-inferred name
 * <DataViewTextFilter field="title">
 *   <DataViewTextFilterInput>
 *     <input placeholder="Search..." />
 *   </DataViewTextFilterInput>
 *   <DataViewTextFilterMatchModeTrigger mode="contains">
 *     <button>Contains</button>
 *   </DataViewTextFilterMatchModeTrigger>
 * </DataViewTextFilter>
 * ```
 */

import React, { forwardRef, type ReactElement, type ReactNode, useCallback } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { useOptionalDataViewFilterName } from './filterContext.js'
import { dataAttribute } from './dataAttribute.js'
import {
	useDataViewFilter,
	useDataViewBooleanFilter,
	useDataViewEnumFilter,
	useDataViewRelationFilter,
	useDataViewTextFilterInput,
	useDataViewTextFilterMatchMode,
	useDataViewNullFilter,
	type UseDataViewFilterResult,
	type DataViewSetBooleanFilterAction,
	type DataViewBooleanFilterCurrent,
	type DataViewSetEnumFilterAction,
	type DataViewEnumFilterCurrent,
	type DataViewSetRelationFilterAction,
	type DataViewRelationFilterCurrent,
	type DataViewSetNullFilterAction,
	type DataViewNullFilterState,
} from './filterHooks.js'
import type {
	FilterArtifact,
	TextFilterArtifact,
	NumberRangeFilterArtifact,
	DateFilterArtifact,
	EnumFilterArtifact,
} from '@contember/bindx'
import { useDataViewContext } from './DataViewContext.js'

// Re-export the hook and types from filterHooks (backwards compat)
export {
	useDataViewFilter,
} from './filterHooks.js'
export type { UseDataViewFilterResult as DataViewFilterState } from './filterHooks.js'

function resolveFilterName(name: string | undefined): string {
	if (name !== undefined) return name
	// eslint-disable-next-line react-hooks/rules-of-hooks
	const contextName = useOptionalDataViewFilterName()
	if (contextName !== null) return contextName
	throw new Error('Filter name must be provided via `name` prop or filter scope context')
}

// ============================================================================
// Text Filter Input — Slot-based
// ============================================================================

const SlotInput = Slot as React.ForwardRefExoticComponent<
	React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>
>

export interface DataViewTextFilterInputProps {
	name?: string
	debounceMs?: number
	children: ReactElement
}

export const DataViewTextFilterInput = forwardRef<HTMLInputElement, DataViewTextFilterInputProps>(
	({ name, debounceMs, ...props }, ref) => {
		name = resolveFilterName(name)
		return (
			<SlotInput
				{...useDataViewTextFilterInput({ name, debounceMs })}
				{...props}
				ref={ref}
			/>
		)
	},
)
DataViewTextFilterInput.displayName = 'DataViewTextFilterInput'

// ============================================================================
// Text Filter Match Mode Trigger — Slot-based
// ============================================================================

export interface DataViewTextFilterMatchModeTriggerProps {
	name?: string
	mode: TextFilterArtifact['mode']
	children: ReactElement
}

export const DataViewTextFilterMatchModeTrigger = forwardRef<HTMLButtonElement, DataViewTextFilterMatchModeTriggerProps>(
	({ name, mode, ...props }, ref) => {
		name = resolveFilterName(name)
		const [active, cb] = useDataViewTextFilterMatchMode(name, mode)
		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, cb)}
				data-active={dataAttribute(active)}
				{...otherProps}
			/>
		)
	},
)
DataViewTextFilterMatchModeTrigger.displayName = 'DataViewTextFilterMatchModeTrigger'

// ============================================================================
// Text Filter Match Mode Label
// ============================================================================

export interface DataViewTextFilterMatchModeLabelProps {
	name?: string
}

const TEXT_MODE_LABELS: Record<TextFilterArtifact['mode'], string> = {
	contains: 'Contains',
	startsWith: 'Starts with',
	endsWith: 'Ends with',
	equals: 'Equals',
	notContains: 'Not contains',
}

export function DataViewTextFilterMatchModeLabel({
	name,
}: DataViewTextFilterMatchModeLabelProps): ReactElement {
	name = resolveFilterName(name)
	const [state] = useDataViewFilter<TextFilterArtifact>(name)
	const mode = state?.mode ?? 'contains'
	return <>{TEXT_MODE_LABELS[mode]}</>
}

// ============================================================================
// Text Filter Reset Trigger
// ============================================================================

export interface DataViewTextFilterResetTriggerProps {
	name?: string
	children: ReactElement
}

export const DataViewTextFilterResetTrigger = forwardRef<HTMLButtonElement, DataViewTextFilterResetTriggerProps>(
	({ name, ...props }, ref) => {
		name = resolveFilterName(name)
		const [state, setFilter] = useDataViewFilter<TextFilterArtifact>(name)
		const hasQuery = (state?.query?.length ?? 0) > 0

		const handleReset = useCallback((): void => {
			setFilter(it => ({ mode: 'contains' as const, ...it, query: '' }))
		}, [setFilter])

		if (!hasQuery) return null

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleReset)}
				{...otherProps}
			/>
		)
	},
)
DataViewTextFilterResetTrigger.displayName = 'DataViewTextFilterResetTrigger'

// ============================================================================
// Number Filter Input — Slot-based
// ============================================================================

const SlotNumberInput = Slot as React.ForwardRefExoticComponent<
	React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>
>

export interface DataViewNumberFilterInputProps {
	name?: string
	type: 'from' | 'to'
	allowFloat?: boolean
	children: ReactElement
}

export const DataViewNumberFilterInput = forwardRef<HTMLInputElement, DataViewNumberFilterInputProps>(
	({ name, type, allowFloat, ...props }, ref) => {
		name = resolveFilterName(name)
		const [artifact, setFilter] = useDataViewFilter<NumberRangeFilterArtifact>(name)
		const min = artifact?.min ?? null
		const max = artifact?.max ?? null
		const value = type === 'from' ? min : max

		const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
			const raw = e.target.value
			const num = raw === '' ? null : (allowFloat ? parseFloat(raw) : parseInt(raw, 10))
			const parsed = num !== null && isNaN(num) ? null : num
			if (type === 'from') {
				setFilter(it => ({ ...it, min: parsed, max: it?.max ?? null }))
			} else {
				setFilter(it => ({ ...it, min: it?.min ?? null, max: parsed }))
			}
		}, [type, allowFloat, setFilter])

		return (
			<SlotNumberInput
				type="number"
				value={value ?? ''}
				onChange={onChange}
				{...props}
				ref={ref}
			/>
		)
	},
)
DataViewNumberFilterInput.displayName = 'DataViewNumberFilterInput'

// ============================================================================
// Date Filter Input — Slot-based
// ============================================================================

const SlotDateInput = Slot as React.ForwardRefExoticComponent<
	React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>
>

export interface DataViewDateFilterInputProps {
	name?: string
	type: 'start' | 'end'
	children: ReactElement
}

export const DataViewDateFilterInput = forwardRef<HTMLInputElement, DataViewDateFilterInputProps>(
	({ name, type, ...props }, ref) => {
		name = resolveFilterName(name)
		const [artifact, setFilter] = useDataViewFilter<import('@contember/bindx').DateFilterArtifact>(name)
		const start = artifact?.start ?? null
		const end = artifact?.end ?? null
		const value = type === 'start' ? start : end

		const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
			const val = e.target.value || null
			if (type === 'start') {
				setFilter(it => ({ ...it, start: val, end: it?.end ?? null }))
			} else {
				setFilter(it => ({ ...it, start: it?.start ?? null, end: val }))
			}
		}, [type, setFilter])

		return (
			<SlotDateInput
				type="date"
				value={value ?? ''}
				onChange={onChange}
				{...props}
				ref={ref}
			/>
		)
	},
)
DataViewDateFilterInput.displayName = 'DataViewDateFilterInput'

// ============================================================================
// Boolean Filter Trigger — Slot-based with action
// ============================================================================

export interface DataViewBooleanFilterTriggerProps {
	name?: string
	value: boolean
	action?: DataViewSetBooleanFilterAction
	children: ReactElement
}

export const DataViewBooleanFilterTrigger = forwardRef<HTMLButtonElement, DataViewBooleanFilterTriggerProps>(
	({ name, action = 'include', value, ...props }, ref) => {
		name = resolveFilterName(name)
		const [current, setFilter] = useDataViewBooleanFilter(name, value)

		const toggleFilter = useCallback((): void => {
			setFilter(action)
		}, [action, setFilter])

		const active = current === actionToStateBool[action]
		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, toggleFilter)}
				data-active={dataAttribute(active)}
				data-current={current}
				{...otherProps}
			/>
		)
	},
)
DataViewBooleanFilterTrigger.displayName = 'DataViewBooleanFilterTrigger'

const actionToStateBool: Record<DataViewSetBooleanFilterAction, DataViewBooleanFilterCurrent> = {
	include: 'include',
	unset: 'none',
	toggle: 'include',
}

// ============================================================================
// Enum Filter Trigger — Slot-based with action
// ============================================================================

export interface DataViewEnumFilterTriggerProps {
	name?: string
	value: string
	action?: DataViewSetEnumFilterAction
	children: ReactElement
}

export const DataViewEnumFilterTrigger = forwardRef<HTMLButtonElement, DataViewEnumFilterTriggerProps>(
	({ name, action = 'include', value, ...props }, ref) => {
		name = resolveFilterName(name)
		const [current, setFilter] = useDataViewEnumFilter(name, value)

		const toggleFilter = useCallback((): void => {
			setFilter(action)
		}, [action, setFilter])

		const active = current === actionToStateEnum[action]
		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, toggleFilter)}
				data-active={dataAttribute(active)}
				data-current={current}
				{...otherProps}
			/>
		)
	},
)
DataViewEnumFilterTrigger.displayName = 'DataViewEnumFilterTrigger'

const actionToStateEnum: Record<DataViewSetEnumFilterAction, DataViewEnumFilterCurrent> = {
	exclude: 'exclude',
	include: 'include',
	unset: 'none',
	toggleInclude: 'include',
	toggleExclude: 'exclude',
}

// ============================================================================
// Enum Filter State — render prop
// ============================================================================

export interface DataViewEnumFilterStateProps {
	name?: string
	value: string
	children: (state: { isIncluded: boolean; isExcluded: boolean }) => ReactNode
}

export function DataViewEnumFilterState({
	name,
	value,
	children,
}: DataViewEnumFilterStateProps): ReactElement {
	name = resolveFilterName(name)
	const [artifact] = useDataViewFilter<EnumFilterArtifact>(name)
	const includedValues = artifact?.values ?? []
	const excludedValues = artifact?.notValues ?? []

	return <>{children({
		isIncluded: includedValues.includes(value),
		isExcluded: excludedValues.includes(value),
	})}</>
}

// ============================================================================
// Relation Filter Trigger — Slot-based with action
// ============================================================================

export interface DataViewRelationFilterTriggerProps {
	name?: string
	id: string
	action?: DataViewSetRelationFilterAction
	children: ReactElement
}

export const DataViewRelationFilterTrigger = forwardRef<HTMLButtonElement, DataViewRelationFilterTriggerProps>(
	({ name, action = 'include', id, ...props }, ref) => {
		name = resolveFilterName(name)
		const [current, setFilter] = useDataViewRelationFilter(name, id)

		const toggleFilter = useCallback((): void => {
			setFilter(action)
		}, [action, setFilter])

		const active = current === actionToStateRelation[action]
		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, toggleFilter)}
				data-active={dataAttribute(active)}
				data-current={current}
				{...otherProps}
			/>
		)
	},
)
DataViewRelationFilterTrigger.displayName = 'DataViewRelationFilterTrigger'

const actionToStateRelation: Record<DataViewSetRelationFilterAction, DataViewRelationFilterCurrent> = {
	exclude: 'exclude',
	include: 'include',
	unset: 'none',
	toggleInclude: 'include',
	toggleExclude: 'exclude',
}

// ============================================================================
// Relation Filter State — render prop
// ============================================================================

export interface DataViewRelationFilterStateProps {
	name?: string
	id: string
	children: (state: { isIncluded: boolean; isExcluded: boolean }) => ReactNode
}

export function DataViewRelationFilterState({
	name,
	id,
	children,
}: DataViewRelationFilterStateProps): ReactElement {
	name = resolveFilterName(name)
	const [artifact] = useDataViewFilter<import('@contember/bindx').RelationFilterArtifact>(name)
	const includedIds = artifact?.id ?? []
	const excludedIds = artifact?.notId ?? []

	return <>{children({
		isIncluded: includedIds.includes(id),
		isExcluded: excludedIds.includes(id),
	})}</>
}

// ============================================================================
// Null Filter Trigger — Slot-based with action
// ============================================================================

export interface DataViewNullFilterTriggerProps {
	name?: string
	action: DataViewSetNullFilterAction
	children: ReactElement
}

export const DataViewNullFilterTrigger = forwardRef<HTMLButtonElement, DataViewNullFilterTriggerProps>(
	({ name, action, ...props }, ref) => {
		name = resolveFilterName(name)
		const [current, setFilter] = useDataViewNullFilter(name)

		const toggleFilter = useCallback((): void => {
			setFilter(action)
		}, [action, setFilter])

		const active = current === actionToStateNull[action]
		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, toggleFilter)}
				data-active={dataAttribute(active)}
				data-current={current}
				{...otherProps}
			/>
		)
	},
)
DataViewNullFilterTrigger.displayName = 'DataViewNullFilterTrigger'

const actionToStateNull: Record<DataViewSetNullFilterAction, DataViewNullFilterState> = {
	exclude: 'exclude',
	include: 'include',
	unset: 'none',
	toggleInclude: 'include',
	toggleExclude: 'exclude',
}

// ============================================================================
// Generic Filter Reset — Slot-based
// ============================================================================

export interface DataViewFilterResetTriggerProps {
	name?: string
	children: ReactElement
}

export const DataViewFilterResetTrigger = forwardRef<HTMLButtonElement, DataViewFilterResetTriggerProps>(
	({ name, ...props }, ref) => {
		name = resolveFilterName(name)
		const { filtering } = useDataViewContext()
		const filter = filtering.filters.get(name)
		const isActive = filter ? filter.handler.isActive(filter.artifact) : false

		const handleReset = useCallback((): void => {
			filtering.resetFilter(name!)
		}, [filtering, name])

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleReset)}
				disabled={!isActive}
				data-active={dataAttribute(isActive)}
				{...otherProps}
			/>
		)
	},
)
DataViewFilterResetTrigger.displayName = 'DataViewFilterResetTrigger'

// ============================================================================
// Date Filter Reset Trigger — Slot-based
// ============================================================================

export interface DataViewDateFilterResetTriggerProps {
	name?: string
	/** Which part to reset: 'start', 'end', or undefined (both) */
	type?: 'start' | 'end'
	children: ReactElement
}

export const DataViewDateFilterResetTrigger = forwardRef<HTMLButtonElement, DataViewDateFilterResetTriggerProps>(
	({ name, type, ...props }, ref) => {
		name = resolveFilterName(name)
		const [state, setFilter] = useDataViewFilter<import('@contember/bindx').DateFilterArtifact>(name)
		const hasValue = type === 'start'
			? (state?.start ?? null) !== null
			: type === 'end'
				? (state?.end ?? null) !== null
				: (state?.start ?? null) !== null || (state?.end ?? null) !== null

		const handleReset = useCallback((): void => {
			if (type === 'start') {
				setFilter(it => it ? { ...it, start: null } : undefined)
			} else if (type === 'end') {
				setFilter(it => it ? { ...it, end: null } : undefined)
			} else {
				setFilter(undefined)
			}
		}, [setFilter, type])

		if (!hasValue) return null

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleReset)}
				{...otherProps}
			/>
		)
	},
)
DataViewDateFilterResetTrigger.displayName = 'DataViewDateFilterResetTrigger'

// ============================================================================
// Number Filter Reset Trigger — Slot-based
// ============================================================================

export interface DataViewNumberFilterResetTriggerProps {
	name?: string
	children: ReactElement
}

export const DataViewNumberFilterResetTrigger = forwardRef<HTMLButtonElement, DataViewNumberFilterResetTriggerProps>(
	({ name, ...props }, ref) => {
		name = resolveFilterName(name)
		const [state, setFilter] = useDataViewFilter<NumberRangeFilterArtifact>(name)
		const hasValue = (state?.min ?? null) !== null || (state?.max ?? null) !== null

		const handleReset = useCallback((): void => {
			setFilter(undefined)
		}, [setFilter])

		if (!hasValue) return null

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleReset)}
				{...otherProps}
			/>
		)
	},
)
DataViewNumberFilterResetTrigger.displayName = 'DataViewNumberFilterResetTrigger'
