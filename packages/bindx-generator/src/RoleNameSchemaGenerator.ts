/**
 * Role-aware name schema generator for bindx
 * Generates runtime schema names filtered by ACL permissions per role
 */

import { Acl, Model } from '@contember/schema'
import { acceptEveryFieldVisitor } from '@contember/schema-utils'
import { BindxSchemaEntityNames, BindxSchemaNames } from './NameSchemaGenerator'
import { capitalizeFirstLetter } from './utils'

export interface RoleSchemaNames {
	readonly [roleName: string]: BindxSchemaNames
}

/**
 * Checks if a role has read permission for an entity
 */
function hasEntityReadPermission(
	entityPermissions: Acl.EntityPermissions | undefined,
): boolean {
	if (!entityPermissions) return false
	const readOps = entityPermissions.operations?.read
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
	if (fieldPermission === undefined) return false
	if (fieldPermission === false) return false
	if (fieldPermission === true) return true
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
		return {}
	}
	visited.add(roleName)

	const role = acl.roles[roleName]
	if (!role) return {}

	const merged: Record<string, Acl.EntityPermissions> = {}

	if (role.inherits) {
		for (const inheritedRole of role.inherits) {
			const inheritedPermissions = getMergedPermissions(acl, inheritedRole, visited)
			for (const [entityName, entityPerms] of Object.entries(inheritedPermissions)) {
				if (!merged[entityName]) {
					merged[entityName] = { predicates: {}, operations: {} }
				}
				const existingOps = merged[entityName].operations
				const inheritedOps = entityPerms.operations
				merged[entityName] = {
					...merged[entityName],
					operations: {
						...existingOps,
						read: { ...existingOps?.read, ...inheritedOps?.read },
					},
				}
			}
		}
	}

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
				},
			}
		}
	}

	return merged
}

export interface RoleNameSchemaGeneratorOptions {
	flattenInheritance?: boolean
	allowPredicateAccess?: boolean
}

export class RoleNameSchemaGenerator {
	private options: Required<RoleNameSchemaGeneratorOptions>

	constructor(options: RoleNameSchemaGeneratorOptions = {}) {
		this.options = {
			flattenInheritance: options.flattenInheritance ?? true,
			allowPredicateAccess: options.allowPredicateAccess ?? true,
		}
	}

	generate(model: Model.Schema, acl: Acl.Schema): RoleSchemaNames {
		const result: Record<string, BindxSchemaNames> = {}

		for (const roleName of Object.keys(acl.roles)) {
			result[roleName] = this.generateForRole(model, acl, roleName)
		}

		return result
	}

	private generateForRole(model: Model.Schema, acl: Acl.Schema, roleName: string): BindxSchemaNames {
		const permissions = this.options.flattenInheritance
			? getMergedPermissions(acl, roleName)
			: acl.roles[roleName]?.entities ?? {}

		const entities: Record<string, BindxSchemaEntityNames> = {}

		for (const entity of Object.values(model.entities)) {
			const entityPerms = permissions[entity.name]
			if (!hasEntityReadPermission(entityPerms)) {
				continue
			}

			const fields: Record<string, BindxSchemaEntityNames['fields'][string]> = {}
			const scalars: string[] = []

			acceptEveryFieldVisitor(model, entity, {
				visitHasOne: ctx => {
					if (!hasFieldReadPermission(entityPerms, ctx.relation.name, this.options.allowPredicateAccess)) {
						return
					}
					const targetEntityPerms = permissions[ctx.targetEntity.name]
					if (!hasEntityReadPermission(targetEntityPerms)) {
						return
					}
					fields[ctx.relation.name] = {
						type: 'one',
						entity: ctx.targetEntity.name,
					}
				},
				visitHasMany: ctx => {
					if (!hasFieldReadPermission(entityPerms, ctx.relation.name, this.options.allowPredicateAccess)) {
						return
					}
					const targetEntityPerms = permissions[ctx.targetEntity.name]
					if (!hasEntityReadPermission(targetEntityPerms)) {
						return
					}
					fields[ctx.relation.name] = {
						type: 'many',
						entity: ctx.targetEntity.name,
					}
				},
				visitColumn: ctx => {
					if (!hasFieldReadPermission(entityPerms, ctx.column.name, this.options.allowPredicateAccess)) {
						return
					}
					scalars.push(ctx.column.name)
					fields[ctx.column.name] = {
						type: 'column',
					}
				},
			})

			entities[entity.name] = { name: entity.name, fields, scalars }
		}

		// Filter enums to only include those used by accessible entities
		const usedEnums = new Set<string>()
		for (const entity of Object.values(model.entities)) {
			const entityPerms = permissions[entity.name]
			if (!hasEntityReadPermission(entityPerms)) continue

			acceptEveryFieldVisitor(model, entity, {
				visitColumn: ctx => {
					if (ctx.column.type === Model.ColumnType.Enum) {
						if (hasFieldReadPermission(entityPerms, ctx.column.name, this.options.allowPredicateAccess)) {
							usedEnums.add(ctx.column.columnType)
						}
					}
				},
				visitHasOne: () => {},
				visitHasMany: () => {},
			})
		}

		const enums = Object.fromEntries(
			Object.entries(model.enums).filter(([name]) => usedEnums.has(name)),
		)

		return { entities, enums }
	}

	/**
	 * Generate TypeScript code that exports the role schema names
	 */
	generateCode(model: Model.Schema, acl: Acl.Schema): string {
		const schemaNames = this.generate(model, acl)

		let code = `import type { BindxSchemaNames } from './types'\n\n`

		// Export individual role schemas
		for (const roleName of Object.keys(acl.roles)) {
			const roleTypeName = capitalizeFirstLetter(roleName)
			code += `export const ${roleTypeName}SchemaNames: BindxSchemaNames = ${JSON.stringify(schemaNames[roleName], null, '\t')}\n\n`
		}

		// Export combined role schemas object
		code += `export const RoleSchemaNames = {\n`
		for (const roleName of Object.keys(acl.roles)) {
			const roleTypeName = capitalizeFirstLetter(roleName)
			code += `\t${roleName}: ${roleTypeName}SchemaNames,\n`
		}
		code += `} as const\n`

		return code
	}
}
