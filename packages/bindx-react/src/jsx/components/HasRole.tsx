/**
 * HasRole component — runtime role gating with optional entity type narrowing.
 *
 * Mode 1 (context gate): Renders children only if user has at least one specified role.
 * Mode 2 (entity re-typing): Narrows entity accessor type to the role-specific entity type.
 */

import React, { type ReactNode, type ReactElement } from 'react'
import type {
	EntityAccessor,
	EntityForRoles,
	RoleNames,
	ExtractRoleMap,
} from '@contember/bindx'
import { useHasRole } from '../../roles/RoleContext.js'

// ============================================================================
// Props
// ============================================================================

/**
 * Props for HasRole in context-gate mode (no entity).
 */
interface HasRoleGateProps<TRoles extends string> {
	/** Roles to check — renders if user has at least one */
	roles: readonly TRoles[]
	/** Children to render if role check passes */
	children: ReactNode
	entity?: never
}

/**
 * Props for HasRole in entity-narrowing mode.
 * TRoleMap is inferred from the entity accessor's __roleMap phantom type.
 */
interface HasRoleEntityProps<
	TRoleMap extends Record<string, object>,
	TRoles extends RoleNames<TRoleMap>,
> {
	/** Roles to expand to */
	roles: readonly TRoles[]
	/** Entity accessor to narrow */
	entity: EntityAccessor<any, any, any, any, any, TRoleMap>
	/** Render function receiving the role-expanded entity */
	children: (entity: EntityAccessor<EntityForRoles<TRoleMap, TRoles>>) => ReactNode
}

export type HasRoleProps<
	TRoleMap extends Record<string, object> = Record<string, object>,
	TRoles extends RoleNames<TRoleMap> = RoleNames<TRoleMap>,
> = HasRoleGateProps<TRoles> | HasRoleEntityProps<TRoleMap, TRoles>

// ============================================================================
// Component
// ============================================================================

/**
 * HasRole component — conditionally renders based on user roles.
 *
 * @example Context gate mode
 * ```tsx
 * <HasRole roles={['admin']}>
 *   <AdminPanel />
 * </HasRole>
 * ```
 *
 * @example Entity narrowing mode
 * ```tsx
 * <HasRole roles={['admin']} entity={article}>
 *   {adminArticle => <span>{adminArticle.internalNotes.value}</span>}
 * </HasRole>
 * ```
 */
export function HasRole<
	TRoleMap extends Record<string, object>,
	TRoles extends RoleNames<TRoleMap>,
>(props: HasRoleProps<TRoleMap, TRoles>): ReactElement | null {
	const hasRole = useHasRole()

	// Check if user has at least one of the specified roles
	const hasAccess = props.roles.some(role => hasRole(role))
	if (!hasAccess) {
		return null
	}

	// Entity narrowing mode
	if ('entity' in props && props.entity !== undefined) {
		const { entity, children } = props as HasRoleEntityProps<TRoleMap, TRoles>
		// At runtime, the entity handle is the same object — we just widen the TS type
		return <>{children(entity as unknown as EntityAccessor<EntityForRoles<TRoleMap, TRoles>>)}</>
	}

	// Context gate mode
	return <>{props.children}</>
}
