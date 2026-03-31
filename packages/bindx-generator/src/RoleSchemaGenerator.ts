/**
 * Role-aware schema generator for bindx.
 *
 * Generates per-role entity interfaces filtered by Contember ACL read permissions.
 * For each role, only fields with read access (true or predicate) are included.
 */

import { Model, Acl } from '@contember/schema'
import { acceptEveryFieldVisitor } from '@contember/schema-utils'
import { columnToTsType, getEnumTypeName } from './utils'

export interface RoleSchemaGeneratorOptions {
	/**
	 * Whether to treat predicate-based permissions as allowed.
	 * When true, any non-false permission allows access.
	 * When false, only explicit `true` permissions are allowed.
	 * Default: true
	 */
	allowPredicateAccess?: boolean
}

interface RoleFieldAccess {
	/** role name → set of readable field names */
	[role: string]: Set<string>
}

export class RoleSchemaGenerator {
	private readonly allowPredicateAccess: boolean

	constructor(options: RoleSchemaGeneratorOptions = {}) {
		this.allowPredicateAccess = options.allowPredicateAccess ?? true
	}

	/**
	 * Generates per-role entity types + role map types.
	 * Returns code to be appended to entities.ts.
	 */
	generateRoleEntities(model: Model.Schema, acl: Acl.Schema): string {
		const roles = this.resolveRoles(acl)
		const roleNames = Object.keys(roles)

		let code = ''

		// Generate per-role entity interfaces
		for (const roleName of roleNames) {
			const roleAccess = roles[roleName]!
			code += this.generateRoleEntityTypes(model, roleName, roleAccess)
		}

		// Generate RoleSchemas type map per entity
		for (const entity of Object.values(model.entities)) {
			const roleEntries = roleNames
				.filter(role => roles[role]!.has(entity.name))
				.map(role => `\treadonly ${role}: ${this.roleEntityName(role, entity.name)}`)
				.join('\n')

			if (roleEntries) {
				code += `export type ${entity.name}$Roles = {\n${roleEntries}\n}\n\n`
			}
		}

		// Export available roles type
		code += `export type AvailableRoles = ${roleNames.map(r => `'${r}'`).join(' | ')}\n`

		return code
	}

	/**
	 * Generates schema.ts content using roleEntityDef.
	 */
	generateSchemaFile(model: Model.Schema, acl: Acl.Schema): string {
		const roles = this.resolveRoles(acl)
		const roleNames = Object.keys(roles)
		const entityNames = Object.values(model.entities).map(e => e.name).sort()

		// Build imports for role entity types
		const roleTypeImports: string[] = []
		for (const name of entityNames) {
			const hasRoles = roleNames.some(role => roles[role]!.has(name))
			if (hasRoles) {
				roleTypeImports.push(`${name}$Roles`)
			}
		}

		const entries = entityNames.map(name => {
			const hasRoles = roleNames.some(role => roles[role]!.has(name))
			if (hasRoles) {
				return `\t${name}: roleEntityDef<${name}$Roles>('${name}', schemaDef),`
			}
			return `\t${name}: entityDef<${name}>('${name}', schemaDef),`
		}).join('\n')

		const allImports = [...entityNames, ...roleTypeImports]

		return `import { entityDef, roleEntityDef } from '@contember/bindx'
import { schemaNamesToDef } from '@contember/bindx-react'
import type { ${allImports.join(', ')} } from './entities'
import { schemaNames } from './names'

const schemaDef = schemaNamesToDef(schemaNames)

export const schema = {
${entries}
} as const
`
	}

	/**
	 * Resolves role permissions, flattening inheritance.
	 * Returns a map: role → (entity → Set<fieldName>)
	 */
	private resolveRoles(acl: Acl.Schema): Record<string, Map<string, Set<string>>> {
		const result: Record<string, Map<string, Set<string>>> = {}

		for (const [roleName, rolePerms] of Object.entries(acl.roles)) {
			// Skip implicit roles
			if (rolePerms.implicit) continue

			const entityFieldMap = new Map<string, Set<string>>()

			// Collect inherited fields first
			if (rolePerms.inherits) {
				for (const parentRole of rolePerms.inherits) {
					const parentFields = result[parentRole]
					if (parentFields) {
						for (const [entityName, fields] of parentFields) {
							const existing = entityFieldMap.get(entityName) ?? new Set()
							for (const field of fields) {
								existing.add(field)
							}
							entityFieldMap.set(entityName, existing)
						}
					}
				}
			}

			// Add own permissions
			for (const [entityName, entityPerms] of Object.entries(rolePerms.entities)) {
				const readPerms = entityPerms.operations.read
				if (!readPerms) continue

				const fields = entityFieldMap.get(entityName) ?? new Set<string>()
				for (const [fieldName, perm] of Object.entries(readPerms)) {
					if (perm === true || (this.allowPredicateAccess && perm !== false)) {
						fields.add(fieldName)
					}
				}
				if (fields.size > 0) {
					entityFieldMap.set(entityName, fields)
				}
			}

			result[roleName] = entityFieldMap
		}

		return result
	}

	/**
	 * Generates per-role entity interfaces for a single role.
	 */
	private generateRoleEntityTypes(
		model: Model.Schema,
		roleName: string,
		roleAccess: Map<string, Set<string>>,
	): string {
		let code = ''

		for (const entity of Object.values(model.entities)) {
			const accessibleFields = roleAccess.get(entity.name)
			if (!accessibleFields || accessibleFields.size === 0) continue

			code += this.generateRoleEntityType(model, entity, roleName, accessibleFields, roleAccess)
		}

		return code
	}

	private generateRoleEntityType(
		model: Model.Schema,
		entity: Model.Entity,
		roleName: string,
		accessibleFields: Set<string>,
		roleAccess: Map<string, Set<string>>,
	): string {
		const typeName = this.roleEntityName(roleName, entity.name)
		let code = `export type ${typeName} = {\n`

		acceptEveryFieldVisitor(model, entity, {
			visitColumn: ctx => {
				if (!accessibleFields.has(ctx.column.name)) return
				code += `\t${ctx.column.name}: ${columnToTsType(ctx.column)}${ctx.column.nullable ? ' | null' : ''}\n`
			},
			visitHasOne: ctx => {
				if (!accessibleFields.has(ctx.relation.name)) return
				const targetFields = roleAccess.get(ctx.targetEntity.name)
				const targetType = targetFields && targetFields.size > 0
					? this.roleEntityName(roleName, ctx.targetEntity.name)
					: ctx.targetEntity.name
				code += `\t${ctx.relation.name}: ${targetType}\n`
			},
			visitHasMany: ctx => {
				if (!accessibleFields.has(ctx.relation.name)) return
				const targetFields = roleAccess.get(ctx.targetEntity.name)
				const targetType = targetFields && targetFields.size > 0
					? this.roleEntityName(roleName, ctx.targetEntity.name)
					: ctx.targetEntity.name
				code += `\t${ctx.relation.name}: ${targetType}[]\n`
			},
		})

		code += '}\n\n'
		return code
	}

	private roleEntityName(roleName: string, entityName: string): string {
		return `${entityName}$${roleName}`
	}
}
