/**
 * React context for role-based schema access.
 */

import React, { createContext, useContext, type ReactNode } from 'react'
import type { RoleSchemaRegistry } from '@contember/bindx'

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Constraint for role schema maps that works with interfaces (no index signature required).
 */
type RoleSchemasBase<T> = { [K in keyof T]: { [E: string]: object } }

// ============================================================================
// HasRole Provider (Global)
// ============================================================================

/**
 * Context value for the hasRole function provider.
 */
export interface HasRoleProviderValue {
	/** Check if the user has a specific role (runtime check) */
	readonly hasRole: (role: string) => boolean
}

/**
 * Context for providing hasRole function globally.
 */
const HasRoleContext = createContext<HasRoleProviderValue | null>(null)

/**
 * Props for HasRoleProvider component.
 */
export interface HasRoleProviderProps {
	/** Function to check if user has a specific role */
	hasRole: (role: string) => boolean
	children: ReactNode
}

/**
 * Provider for hasRole function - use at app level.
 *
 * @example
 * ```tsx
 * <HasRoleProvider hasRole={(role) => userRoles.has(role)}>
 *   <App />
 * </HasRoleProvider>
 * ```
 */
export function HasRoleProvider({ hasRole, children }: HasRoleProviderProps): React.ReactElement {
	return (
		<HasRoleContext.Provider value={{ hasRole }}>
			{children}
		</HasRoleContext.Provider>
	)
}

/**
 * Hook to access the hasRole function from context.
 * Returns null if no provider is found (allows optional role support).
 */
export function useHasRoleContext(): HasRoleProviderValue | null {
	return useContext(HasRoleContext)
}

// ============================================================================
// Role Context Types (for RoleSchemaRegistry)
// ============================================================================

/**
 * Context value for role-aware bindx.
 *
 * @typeParam TRoleSchemas - Map of role names to their schema types
 */
export interface RoleContextValue<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> {
	/** The role schema registry containing all role schemas */
	readonly roleSchemaRegistry: RoleSchemaRegistry<TRoleSchemas>

	/** Current active roles for the scope (intersection of these determines type) */
	readonly currentRoles: readonly (keyof TRoleSchemas)[]

	/**
	 * Roles available for nested HasRole components.
	 * HasRole can only use roles from this set.
	 */
	readonly availableRoles: readonly (keyof TRoleSchemas)[]

	/** Check if the user has a specific role (runtime check) */
	readonly hasRole: (role: keyof TRoleSchemas) => boolean
}

// ============================================================================
// Entity Context Types (for HasRole to know parent entity)
// ============================================================================

/**
 * Context value for the current entity being rendered.
 * Used by HasRole to know which entity to expand.
 */
export interface EntityContextValue {
	/** Entity type name (e.g., 'Article') */
	readonly entityType: string

	/** Entity ID */
	readonly entityId: string | null

	/** Key for store lookup */
	readonly storeKey: string
}

// ============================================================================
// Context Creation
// ============================================================================

/**
 * Creates a typed role context for a specific role schema map.
 */
export function createRoleContext<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>>(): React.Context<RoleContextValue<TRoleSchemas> | null> {
	return createContext<RoleContextValue<TRoleSchemas> | null>(null)
}

/**
 * Context for tracking the current entity in the component tree.
 */
export const EntityContext = createContext<EntityContextValue | null>(null)

/**
 * Hook to access the current entity context.
 */
export function useEntityContext(): EntityContextValue | null {
	return useContext(EntityContext)
}

// ============================================================================
// Role Context Hook Factory
// ============================================================================

/**
 * Creates a hook to access the role context.
 */
export function createUseRoleContext<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>>(
	context: React.Context<RoleContextValue<TRoleSchemas> | null>,
): () => RoleContextValue<TRoleSchemas> {
	return function useRoleContext(): RoleContextValue<TRoleSchemas> {
		const value = useContext(context)
		if (!value) {
			throw new Error('useRoleContext must be used within a RoleScope')
		}
		return value
	}
}
