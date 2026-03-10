/**
 * Filter hooks — typed state access and action hooks for filter components.
 *
 * These hooks match the Contember react-dataview API:
 * - useDataViewFilter: generic [state, setFilter, meta] tuple
 * - useDataViewBooleanFilter: [current, set] with action types
 * - useDataViewEnumFilter: [current, set] with include/exclude/toggle actions
 * - useDataViewRelationFilter: [current, set] with include/exclude/toggle actions
 * - useDataViewTextFilterInput: { value, onChange } with debounce
 * - useDataViewTextFilterMatchMode: [isCurrent, set]
 * - useDataViewNullFilter: [state, set] with include/exclude/toggle actions
 */

import { type ChangeEvent, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDataViewContext } from './DataViewContext.js'
import type {
	FilterArtifact,
	TextFilterArtifact,
	BooleanFilterArtifact,
	EnumFilterArtifact,
	RelationFilterArtifact,
	NumberRangeFilterArtifact,
} from '@contember/bindx'

// ============================================================================
// Generic useDataViewFilter — matches Contember's [state, setFilter, meta] API
// ============================================================================

export type UseDataViewFilterResult<T extends FilterArtifact> = [
	state: T | undefined,
	setFilter: (filter: SetStateAction<T | undefined>) => void,
	meta: { isEmpty?: boolean },
]

export function useDataViewFilter<T extends FilterArtifact>(key: string): UseDataViewFilterResult<T> {
	const { filtering } = useDataViewContext()
	const state = filtering.getArtifact(key) as T | undefined
	const filter = filtering.filters.get(key)
	const isEmpty = state ? !filter?.handler.isActive(state) : true

	const setFilter = useCallback(
		(filterOrUpdater: SetStateAction<T | undefined>): void => {
			if (typeof filterOrUpdater === 'function') {
				const current = filtering.getArtifact(key) as T | undefined
				const next = (filterOrUpdater as (prev: T | undefined) => T | undefined)(current)
				if (next !== undefined) {
					filtering.setArtifact(key, next)
				}
			} else if (filterOrUpdater !== undefined) {
				filtering.setArtifact(key, filterOrUpdater)
			}
		},
		[filtering, key],
	)

	return [state, setFilter, { isEmpty }]
}

// ============================================================================
// Boolean Filter Hook
// ============================================================================

export type DataViewSetBooleanFilterAction = 'include' | 'unset' | 'toggle'
export type DataViewBooleanFilterCurrent = 'include' | 'none'
export type UseDataViewBooleanFilterResult = [
	current: DataViewBooleanFilterCurrent,
	set: (action: DataViewSetBooleanFilterAction) => void,
]

export function useDataViewBooleanFilter(name: string, value: boolean): UseDataViewBooleanFilterResult {
	const factory = useDataViewBooleanFilterFactory(name)
	return useMemo(() => factory(value), [factory, value])
}

export function useDataViewBooleanFilterFactory(name: string): (value: boolean) => UseDataViewBooleanFilterResult {
	const [filter, setFilter] = useDataViewFilter<BooleanFilterArtifact>(name)

	return useCallback((value: boolean): UseDataViewBooleanFilterResult => {
		const key = value ? 'includeTrue' : 'includeFalse'
		const current: DataViewBooleanFilterCurrent = filter?.[key] ? 'include' : 'none'

		const set = (action: DataViewSetBooleanFilterAction = 'include'): void => {
			switch (action) {
				case 'unset':
					setFilter(it => ({ ...it, [key]: undefined }))
					return
				case 'toggle':
					setFilter(it => ({ ...it, [key]: it?.[key] === true ? undefined : true }))
					return
				case 'include':
					setFilter(it => ({ ...it, [key]: true }))
					return
			}
		}

		return [current, set]
	}, [filter, setFilter])
}

// ============================================================================
// Enum Filter Hook
// ============================================================================

export type DataViewSetEnumFilterAction = 'include' | 'exclude' | 'unset' | 'toggleInclude' | 'toggleExclude'
export type DataViewEnumFilterCurrent = 'include' | 'exclude' | 'none'
export type UseDataViewEnumFilterResult = [
	current: DataViewEnumFilterCurrent,
	set: (action: DataViewSetEnumFilterAction) => void,
]

export function useDataViewEnumFilter(name: string, value: string): UseDataViewEnumFilterResult {
	const factory = useDataViewEnumFilterFactory(name)
	return useMemo(() => factory(value), [factory, value])
}

export function useDataViewEnumFilterFactory(name: string): (value: string) => UseDataViewEnumFilterResult {
	const [filter, setFilter] = useDataViewFilter<EnumFilterArtifact>(name)

	return useCallback((value: string): UseDataViewEnumFilterResult => {
		const current: DataViewEnumFilterCurrent = (() => {
			if (filter?.values?.includes(value)) return 'include'
			if (filter?.notValues?.includes(value)) return 'exclude'
			return 'none'
		})()

		const set = (action: DataViewSetEnumFilterAction = 'include'): void => {
			switch (action) {
				case 'unset':
					setFilter(it => ({
						...it,
						values: it?.values?.filter(v => v !== value),
						notValues: it?.notValues?.filter(v => v !== value),
					}))
					return
				case 'toggleInclude':
					setFilter(it => ({
						...it,
						values: it?.values?.includes(value)
							? it.values.filter(v => v !== value)
							: [...(it?.values ?? []), value],
						notValues: it?.notValues?.filter(v => v !== value),
					}))
					return
				case 'toggleExclude':
					setFilter(it => ({
						...it,
						notValues: it?.notValues?.includes(value)
							? it.notValues.filter(v => v !== value)
							: [...(it?.notValues ?? []), value],
						values: it?.values?.filter(v => v !== value),
					}))
					return
				case 'include':
					setFilter(it => ({
						...it,
						values: [...(it?.values ?? []), value],
						notValues: it?.notValues?.filter(v => v !== value),
					}))
					return
				case 'exclude':
					setFilter(it => ({
						...it,
						notValues: [...(it?.notValues ?? []), value],
						values: it?.values?.filter(v => v !== value),
					}))
					return
			}
		}

		return [current, set]
	}, [filter?.values, filter?.notValues, setFilter])
}

// ============================================================================
// Relation Filter Hook
// ============================================================================

export type DataViewSetRelationFilterAction = 'include' | 'exclude' | 'unset' | 'toggleInclude' | 'toggleExclude'
export type DataViewRelationFilterCurrent = 'include' | 'exclude' | 'none'
export type UseDataViewRelationFilterResult = [
	current: DataViewRelationFilterCurrent,
	set: (action: DataViewSetRelationFilterAction) => void,
]

export function useDataViewRelationFilter(name: string, entityId: string): UseDataViewRelationFilterResult {
	const factory = useDataViewRelationFilterFactory(name)
	return useMemo(() => factory(entityId), [factory, entityId])
}

export function useDataViewRelationFilterFactory(name: string): (id: string) => UseDataViewRelationFilterResult {
	const [filter, setFilter] = useDataViewFilter<RelationFilterArtifact>(name)

	return useCallback((id: string): UseDataViewRelationFilterResult => {
		const current: DataViewRelationFilterCurrent = (() => {
			if (filter?.id?.includes(id)) return 'include'
			if (filter?.notId?.includes(id)) return 'exclude'
			return 'none'
		})()

		const set = (action: DataViewSetRelationFilterAction = 'include'): void => {
			switch (action) {
				case 'unset':
					setFilter(it => ({
						...it,
						id: it?.id?.filter(v => v !== id),
						notId: it?.notId?.filter(v => v !== id),
					}))
					return
				case 'toggleInclude':
					setFilter(it => ({
						...it,
						id: it?.id?.includes(id)
							? it.id.filter(v => v !== id)
							: [...(it?.id ?? []), id],
						notId: it?.notId?.filter(v => v !== id),
					}))
					return
				case 'toggleExclude':
					setFilter(it => ({
						...it,
						notId: it?.notId?.includes(id)
							? it.notId.filter(v => v !== id)
							: [...(it?.notId ?? []), id],
						id: it?.id?.filter(v => v !== id),
					}))
					return
				case 'include':
					setFilter(it => ({
						...it,
						id: [...(it?.id ?? []), id],
						notId: it?.notId?.filter(v => v !== id),
					}))
					return
				case 'exclude':
					setFilter(it => ({
						...it,
						notId: [...(it?.notId ?? []), id],
						id: it?.id?.filter(v => v !== id),
					}))
					return
			}
		}

		return [current, set]
	}, [filter?.id, filter?.notId, setFilter])
}

// ============================================================================
// Text Filter Input Hook
// ============================================================================

export interface UseDataViewTextFilterInputResult {
	value: string
	onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export function useDataViewTextFilterInput({ name, debounceMs = 500 }: {
	name: string
	debounceMs?: number
}): UseDataViewTextFilterInputResult {
	const [state, setFilter] = useDataViewFilter<TextFilterArtifact>(name)
	const [value, setValue] = useState(state?.query ?? '')
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	useEffect(() => {
		if (!timerRef.current) {
			setValue(state?.query ?? '')
		}
	}, [state?.query])

	const onChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
		const newValue = e.target.value
		if (debounceMs && newValue) {
			if (timerRef.current) clearTimeout(timerRef.current)
			timerRef.current = setTimeout(() => {
				timerRef.current = undefined
				setFilter(it => ({ mode: 'contains' as const, ...it, query: newValue }))
			}, debounceMs)
		} else {
			setFilter(it => ({ mode: 'contains' as const, ...it, query: newValue }))
		}
		setValue(newValue)
	}, [debounceMs, setFilter])

	return { value, onChange }
}

// ============================================================================
// Text Filter Match Mode Hook
// ============================================================================

export type UseDataViewTextFilterMatchModeResult = [isCurrent: boolean, set: () => void]

export function useDataViewTextFilterMatchMode(
	name: string,
	mode: TextFilterArtifact['mode'],
): UseDataViewTextFilterMatchModeResult {
	const [state, setFilter] = useDataViewFilter<TextFilterArtifact>(name)

	const cb = useCallback((): void => {
		setFilter(it => ({ query: '', ...it, mode }))
	}, [setFilter, mode])

	return [state?.mode === mode, cb]
}

// ============================================================================
// Number Filter Input Hook
// ============================================================================

export interface UseDataViewNumberFilterInputResult {
	value: string
	onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export interface UseDataViewNumberFilterInputProps {
	name: string
	type: 'from' | 'to'
	allowFloat?: boolean
}

export function useDataViewNumberFilterInput({ name, type, allowFloat }: UseDataViewNumberFilterInputProps): UseDataViewNumberFilterInputResult {
	const [state, setFilter] = useDataViewFilter<NumberRangeFilterArtifact>(name)

	const onChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
		const raw = e.target.value
		const num = raw === '' ? null : (allowFloat ? parseFloat(raw) : parseInt(raw, 10))
		const parsed = num !== null && isNaN(num) ? null : num
		if (type === 'from') {
			setFilter(it => ({ ...it, min: parsed, max: it?.max ?? null }))
		} else {
			setFilter(it => ({ ...it, min: it?.min ?? null, max: parsed }))
		}
	}, [type, allowFloat, setFilter])

	const value = type === 'from' ? state?.min : state?.max

	return { value: value?.toString() ?? '', onChange }
}

// ============================================================================
// Null Filter Hook
// ============================================================================

export type DataViewSetNullFilterAction = 'include' | 'exclude' | 'unset' | 'toggleInclude' | 'toggleExclude'
export type DataViewNullFilterState = 'include' | 'exclude' | 'none'
export type UseDataViewNullFilterResult = [
	state: DataViewNullFilterState,
	set: (action: DataViewSetNullFilterAction) => void,
]

export function useDataViewNullFilter(name: string): UseDataViewNullFilterResult {
	const [state, setFilter] = useDataViewFilter<{ nullCondition?: boolean } & FilterArtifact>(name)

	const cb = useCallback((action: DataViewSetNullFilterAction): void => {
		switch (action) {
			case 'unset':
				setFilter(it => ({ ...it, nullCondition: undefined }))
				return
			case 'toggleInclude':
				setFilter(it => ({ ...it, nullCondition: it?.nullCondition === true ? undefined : true }))
				return
			case 'toggleExclude':
				setFilter(it => ({ ...it, nullCondition: it?.nullCondition === false ? undefined : false }))
				return
			case 'include':
				setFilter(it => ({ ...it, nullCondition: true }))
				return
			case 'exclude':
				setFilter(it => ({ ...it, nullCondition: false }))
				return
		}
	}, [setFilter])

	const currentState: DataViewNullFilterState = state?.nullCondition === true
		? 'include'
		: state?.nullCondition === false
			? 'exclude'
			: 'none'

	return [currentState, cb]
}
