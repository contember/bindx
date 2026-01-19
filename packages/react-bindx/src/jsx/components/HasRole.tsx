import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { SelectionMeta, SelectionFieldMeta, SelectionProvider, AnyBrand } from '../types.js'
import { BINDX_COMPONENT } from '../types.js'
import type { EntityRef, EntityAccessor } from '@contember/bindx'
import { useHasRoleContext } from '../../roles/RoleContext.js'

/**
 * Props for HasRole component.
 */
export interface HasRoleComponentProps<
	TEntityRef extends EntityRef<any, any, any, any, any>,
	TNewRoles extends readonly string[],
> {
	/** Roles to narrow scope to */
	roles: TNewRoles
	/** Parent entity reference */
	entity: TEntityRef
	/** Render function receiving entity accessor with narrowed type */
	children: (entity: EntityAccessor<any, any, AnyBrand, string, TNewRoles, any>) => ReactNode
}

/**
 * HasRole component - conditionally renders with narrowed role scope.
 *
 * This component is used for role-based access control in the UI.
 * It validates that the user has the required roles and narrows
 * the entity type accordingly.
 *
 * @example
 * ```tsx
 * <Entity name="Article" by={{ id }} roles={['editor', 'admin']}>
 *   {article => (
 *     <div>
 *       <span>{article.title.value}</span>
 *       <HasRole roles={['admin']} entity={article}>
 *         {adminArticle => (
 *           <span>{adminArticle.internalNotes.value}</span>
 *         )}
 *       </HasRole>
 *     </div>
 *   )}
 * </Entity>
 * ```
 */
function HasRoleImpl<
	TEntityRef extends EntityRef<any, any, any, any, any>,
	const TNewRoles extends readonly string[],
>({
	roles: requestedRoles,
	entity,
	children: renderFn,
}: HasRoleComponentProps<TEntityRef, TNewRoles>): ReactElement | null {
	const hasRoleContext = useHasRoleContext()

	if (!hasRoleContext) {
		throw new Error('HasRole requires RoleAwareProvider (HasRoleProvider) to be present in the component tree')
	}

	const { hasRole } = hasRoleContext

	// Validate: requested roles must be subset of available roles
	const availableRoles = entity.__availableRoles
	if (availableRoles && availableRoles.length > 0) {
		const invalidRoles = requestedRoles.filter(
			role => !availableRoles.includes(role),
		)
		if (invalidRoles.length > 0) {
			throw new Error(
				`HasRole: roles [${invalidRoles.map(String).join(', ')}] are not available. ` +
				`Available roles: [${availableRoles.map(String).join(', ')}]`,
			)
		}
	}

	// Runtime check - does user have ANY of the requested roles?
	const hasAnyRole = requestedRoles.some(role => hasRole(role))
	if (!hasAnyRole) {
		return null
	}

	// Create new entity accessor with narrowed available roles using Proxy
	const narrowedEntityRef = new Proxy(entity, {
		get(target, prop) {
			if (prop === '__availableRoles') {
				return requestedRoles
			}
			return Reflect.get(target, prop)
		},
	})

	return <>{renderFn(narrowedEntityRef as any)}</>
}

export const HasRole = memo(HasRoleImpl) as typeof HasRoleImpl

// Static method for selection extraction
const hasRoleWithSelection = HasRole as typeof HasRole & SelectionProvider & { [BINDX_COMPONENT]: true }

/**
 * Selection extraction for HasRole.
 *
 * HasRole doesn't represent a relation, but its children might access fields
 * on the entity. We need to collect those field accesses.
 *
 * Key insight: During collection phase, props.entity is already a collector proxy
 * from the parent scope. We pass it through to children so field accesses are
 * tracked in the same scope. We don't create a new scope here.
 */
hasRoleWithSelection.getSelection = (
	props: HasRoleComponentProps<any, any>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta[] | null => {
	// Pass through props.entity to children - if it's a collector proxy,
	// field accesses will be tracked in the parent's scope.
	// This handles the case where HasRole is used inside createComponent.
	const syntheticChildren = props.children(props.entity as any)

	// Also analyze the JSX structure for nested components
	collectNested(syntheticChildren)

	// HasRole itself doesn't add any fields to the selection -
	// fields accessed inside children are tracked via the entity proxy.
	// We return null since the parent scope handles the tracking.
	return null
}

hasRoleWithSelection[BINDX_COMPONENT] = true

export { hasRoleWithSelection as HasRoleWithMeta }
