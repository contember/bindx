/**
 * Role-aware schema generator for bindx
 * 
 * Generates TypeScript types filtered by ACL permissions per role.
 * Similar to IntrospectionSchemaFactory, this filters entities and fields
 * based on read permissions defined in Acl.Schema.
 */

import { Acl, Model } from '@contember/schema'
import { acceptEveryFieldVisitor, getEntity } from '@contember/schema-utils'
import { columnToTsType, getEnumTypeName, capitalizeFirstLetter } from './utils'

export interface RoleSchemaGeneratorOptions {
	/** 
	 * Whether to flatten inherited roles.
	 * When true, permissions from inherited roles are merged.
	 * Default: true
	 */
	flattenInheritance?: boolean

	/**
	 * Whether to treat predicate-based permissions as allowed.
	 * When true, any non-false permission (including predicates) allows access.
	 * When false, only `true` permissions are allowed.
	 * Default: true (conservative - allows predicate-based access)
	 */
	allowPredicateAccess?: boolean
}

/**
 * Checks if a role has read permission for an entity
 */
function hasEntityReadPermission(
	entityPermissions: Acl.EntityPermissions | undefined,
): boolean {
	if (!entityPermissions) return false
	const readOps = entityPermissions.operations?.read
	// Entity is readable if it has any read operations defined
	return readOps !== undefined && Object.keys(readOps).length > 0
}

/**
 * Checks if a role has read permission for a specific field
 */
function hasFieldReadPermission(
	entityPermissions: Acl.EntityPermissions | undefined,
	fieldName: string,
	allowPredicateAccess: boolean,
): boolean {
	if (!entityPermissions) return false
	const readOps = entityPermissions.operations?.read
	if (!readOps) return false

	const fieldPermission = readOps[fieldName]

	// No permission defined for this field
	if (fieldPermission === undefined) return false

	// Explicit false means no access
	if (fieldPermission === false) return false

	// true means full access
	if (fieldPermission === true) return true

	// String means predicate-based access
	// Return based on options
	return allowPredicateAccess
}

/**
 * Get merged permissions for a role, including inherited roles
 */
function getMergedPermissions(
	acl: Acl.Schema,
	roleName: string,
	visited: Set<string> = new Set(),
): Acl.Permissions {
	if (visited.has(roleName)) {
		return {} // Prevent circular inheritance
	}
	visited.add(roleName)

	const role = acl.roles[roleName]
	if (!role) return {}

	// Start with this role's permissions
	const merged: Record<string, Acl.EntityPermissions> = {}

	// First, add inherited permissions
	if (role.inherits) {
		for (const inheritedRole of role.inherits) {
			const inheritedPermissions = getMergedPermissions(acl, inheritedRole, visited)
			for (const [entityName, entityPerms] of Object.entries(inheritedPermissions)) {
				if (!merged[entityName]) {
					merged[entityName] = { predicates: {}, operations: {} }
				}
				// Merge operations
				const existingOps = merged[entityName].operations
				const inheritedOps = entityPerms.operations
				merged[entityName] = {
					...merged[entityName],
					operations: {
						...existingOps,
						read: { ...existingOps?.read, ...inheritedOps?.read },
						create: { ...existingOps?.create, ...inheritedOps?.create },
						update: { ...existingOps?.update, ...inheritedOps?.update },
					},
				}
			}
		}
	}

	// Then, overlay this role's own permissions (they take precedence)
	for (const [entityName, entityPerms] of Object.entries(role.entities)) {
		if (!merged[entityName]) {
			merged[entityName] = entityPerms
		} else {
			const existingOps = merged[entityName].operations
			const roleOps = entityPerms.operations
			merged[entityName] = {
				...merged[entityName],
				...entityPerms,
				operations: {
					...existingOps,
					...roleOps,
					read: { ...existingOps?.read, ...roleOps?.read },
					create: { ...existingOps?.create, ...roleOps?.create },
					update: { ...existingOps?.update, ...roleOps?.update },
				},
			}
		}
	}

	return merged
}

export class RoleSchemaGenerator {
	private options: Required<RoleSchemaGeneratorOptions>

	constructor(options: RoleSchemaGeneratorOptions = {}) {
		this.options = {
			flattenInheritance: options.flattenInheritance ?? true,
			allowPredicateAccess: options.allowPredicateAccess ?? true,
		}
	}

	/**
	 * Generate role-specific entity types
	 */
	generate(model: Model.Schema, acl: Acl.Schema): string {
		let code = ''

		// Import enum types
		for (const enumName of Object.keys(model.enums)) {
			code += `import type { ${getEnumTypeName(enumName)} } from './enums'\n`
		}

		// Add JSON type definitions
		code += `
export type JSONPrimitive = string | number | boolean | null
export type JSONValue = JSONPrimitive | JSONObject | JSONArray
export type JSONObject = { readonly [K in string]?: JSONValue }
export type JSONArray = readonly JSONValue[]

`

		// Generate entity types for each role
		const roleNames = Object.keys(acl.roles)

		for (const roleName of roleNames) {
			code += this.generateRoleSchema(model, acl, roleName)
		}

		// Generate RoleSchemas type that maps role names to their schemas
		code += `// Role schemas mapping\n`
		code += `export type RoleSchemas = {\n`
		for (const roleName of roleNames) {
			const roleTypeName = this.getRoleTypeName(roleName)
			code += `\t${roleName}: ${roleTypeName}Schema\n`
		}
		code += `}\n\n`

		// Generate role names type
		code += `export type RoleName = ${roleNames.map(r => `'${r}'`).join(' | ')}\n\n`

		// Generate role name array for runtime
		code += `export const roleNames = [${roleNames.map(r => `'${r}'`).join(', ')}] as const\n`

		return code
	}

	private getRoleTypeName(roleName: string): string {
		return capitalizeFirstLetter(roleName)
	}

	private generateRoleSchema(model: Model.Schema, acl: Acl.Schema, roleName: string): string {
		const roleTypeName = this.getRoleTypeName(roleName)
		let code = `// ============================================\n`
		code += `// ${roleTypeName} Role Schema\n`
		code += `// ============================================\n\n`

		const permissions = this.options.flattenInheritance
			? getMergedPermissions(acl, roleName)
			: acl.roles[roleName]?.entities ?? {}

		// Filter entities that this role can read
		const accessibleEntities = Object.values(model.entities).filter(entity => {
			const entityPerms = permissions[entity.name]
			return hasEntityReadPermission(entityPerms)
		})

		// Generate entity types for this role
		for (const entity of accessibleEntities) {
			code += this.generateRoleEntityType(model, entity, permissions, roleTypeName)
		}

		// Generate schema interface for this role
		code += `export type ${roleTypeName}Schema = {\n`
		for (const entity of accessibleEntities) {
			code += `\t${entity.name}: ${roleTypeName}${entity.name}\n`
		}
		code += `}\n\n`

		return code
	}

	private generateRoleEntityType(
		model: Model.Schema,
		entity: Model.Entity,
		permissions: Acl.Permissions,
		roleTypeName: string,
	): string {
		const entityPerms = permissions[entity.name]
		let code = `export interface ${roleTypeName}${entity.name} {\n`

		let columnsCode = ''
		let hasOneCode = ''
		let hasManyCode = ''

		acceptEveryFieldVisitor(model, entity, {
			visitHasMany: ctx => {
				if (!hasFieldReadPermission(entityPerms, ctx.relation.name, this.options.allowPredicateAccess)) {
					return
				}
				// Check if target entity is also accessible
				const targetEntityPerms = permissions[ctx.targetEntity.name]
				if (!hasEntityReadPermission(targetEntityPerms)) {
					return
				}
				hasManyCode += `\t\t${ctx.relation.name}: ${roleTypeName}${ctx.targetEntity.name}\n`
			},
			visitHasOne: ctx => {
				if (!hasFieldReadPermission(entityPerms, ctx.relation.name, this.options.allowPredicateAccess)) {
					return
				}
				// Check if target entity is also accessible
				const targetEntityPerms = permissions[ctx.targetEntity.name]
				if (!hasEntityReadPermission(targetEntityPerms)) {
					return
				}
				hasOneCode += `\t\t${ctx.relation.name}: ${roleTypeName}${ctx.targetEntity.name}\n`
			},
			visitColumn: ctx => {
				if (!hasFieldReadPermission(entityPerms, ctx.column.name, this.options.allowPredicateAccess)) {
					return
				}
				columnsCode += `\t\t${ctx.column.name}: ${columnToTsType(ctx.column)}${ctx.column.nullable ? ' | null' : ''}\n`
			},
		})

		code += '\tcolumns: {\n'
		code += columnsCode
		code += '\t}\n'
		code += '\thasOne: {\n'
		code += hasOneCode
		code += '\t}\n'
		code += '\thasMany: {\n'
		code += hasManyCode
		code += '\t}\n'
		code += '}\n\n'

		return code
	}
}
