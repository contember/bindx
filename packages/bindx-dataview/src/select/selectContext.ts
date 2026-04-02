/**
 * Select context — provides selection state and handlers to descendant components.
 */

import { createContext, useContext } from 'react'
import type { EntityRef, EntityDef } from '@contember/bindx'

// ============================================================================
// Types
// ============================================================================

export type SelectAction = 'select' | 'unselect' | 'toggle'

export type SelectHandler = (entity: EntityRef<object>, action?: SelectAction) => void

export interface SelectEvents {
	onSelect?: (entity: EntityRef<object>) => void
	onUnselect?: (entity: EntityRef<object>) => void
}

// ============================================================================
// Contexts
// ============================================================================

const SelectCurrentEntitiesContext = createContext<readonly EntityRef<object>[] | null>(null)
SelectCurrentEntitiesContext.displayName = 'SelectCurrentEntitiesContext'

const SelectIsSelectedContext = createContext<((entity: EntityRef<object>) => boolean) | null>(null)
SelectIsSelectedContext.displayName = 'SelectIsSelectedContext'

const SelectHandleSelectContext = createContext<SelectHandler | null>(null)
SelectHandleSelectContext.displayName = 'SelectHandleSelectContext'

const SelectOptionsContext = createContext<EntityDef | null>(null)
SelectOptionsContext.displayName = 'SelectOptionsContext'

// ============================================================================
// Hooks
// ============================================================================

export function useSelectCurrentEntities(): readonly EntityRef<object>[] {
	const ctx = useContext(SelectCurrentEntitiesContext)
	if (ctx === null) {
		throw new Error('useSelectCurrentEntities must be used within a Select or MultiSelect')
	}
	return ctx
}

export function useSelectIsSelected(): (entity: EntityRef<object>) => boolean {
	const ctx = useContext(SelectIsSelectedContext)
	if (ctx === null) {
		throw new Error('useSelectIsSelected must be used within a Select or MultiSelect')
	}
	return ctx
}

export function useSelectHandleSelect(): SelectHandler {
	const ctx = useContext(SelectHandleSelectContext)
	if (ctx === null) {
		throw new Error('useSelectHandleSelect must be used within a Select or MultiSelect')
	}
	return ctx
}

export function useSelectOptions(): EntityDef {
	const ctx = useContext(SelectOptionsContext)
	if (ctx === null) {
		throw new Error('useSelectOptions must be used within a Select or MultiSelect')
	}
	return ctx
}

// ============================================================================
// Providers (exported for internal use by Select/MultiSelect)
// ============================================================================

export {
	SelectCurrentEntitiesContext,
	SelectIsSelectedContext,
	SelectHandleSelectContext,
	SelectOptionsContext,
}
