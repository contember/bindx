/**
 * Role provider context for runtime role checking.
 *
 * HasRole uses this to determine if the current user has the required roles.
 * Without a RoleProvider, HasRole always renders (no gating).
 */

import React, { createContext, useContext, type ReactNode, type ReactElement } from 'react'

// ============================================================================
// Context
// ============================================================================

type HasRoleFn = (role: string) => boolean

const RoleContext = createContext<HasRoleFn | null>(null)

// ============================================================================
// Provider
// ============================================================================

export interface RoleProviderProps {
	children: ReactNode
	/** Function that checks if the current user has a given role */
	hasRole: HasRoleFn
}

/**
 * Provides runtime role checking for HasRole components.
 *
 * @example
 * ```tsx
 * <RoleProvider hasRole={role => currentUser.roles.includes(role)}>
 *   <App />
 * </RoleProvider>
 * ```
 */
export function RoleProvider({ children, hasRole }: RoleProviderProps): ReactElement {
	return <RoleContext.Provider value={hasRole}>{children}</RoleContext.Provider>
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Returns a function to check if the current user has a given role.
 * If no RoleProvider is present, returns a function that always returns true.
 */
export function useHasRole(): HasRoleFn {
	const hasRole = useContext(RoleContext)
	return hasRole ?? alwaysTrue
}

function alwaysTrue(): boolean {
	return true
}
