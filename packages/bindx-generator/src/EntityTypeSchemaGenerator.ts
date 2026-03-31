/**
 * Entity type schema generator for bindx
 * Generates TypeScript entity types from Contember model
 * 
 * Output format is designed to work with bindx's type system,
 * separating columns, hasOne, and hasMany for proper type inference.
 */

import { Model } from '@contember/schema'
import { acceptEveryFieldVisitor } from '@contember/schema-utils'
import { columnToTsType, getEnumTypeName } from './utils'

export class EntityTypeSchemaGenerator {
	generate(model: Model.Schema): string {
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

		// Generate entity types
		for (const entity of Object.values(model.entities)) {
			code += this.generateEntityTypeCode(model, entity)
		}

		// Generate schema type
		code += '\n'
		code += `export interface BindxEntities {\n`
		for (const entity of Object.values(model.entities)) {
			code += `\t${entity.name}: ${entity.name}\n`
		}
		code += '}\n\n'

		code += `export interface BindxSchema {\n`
		code += '\tentities: BindxEntities\n'
		code += '}\n'

		return code
	}

	private generateEntityTypeCode(model: Model.Schema, entity: Model.Entity): string {
		let code = `export type ${entity.name} = {\n`

		let columnsCode = ''
		let hasOneCode = ''
		let hasManyCode = ''

		acceptEveryFieldVisitor(model, entity, {
			visitHasMany: ctx => {
				hasManyCode += `\t\t${ctx.relation.name}: ${ctx.targetEntity.name}[]\n`
			},
			visitHasOne: ctx => {
				hasOneCode += `\t\t${ctx.relation.name}: ${ctx.targetEntity.name}\n`
			},
			visitColumn: ctx => {
				columnsCode += `\t\t${ctx.column.name}: ${columnToTsType(ctx.column)}${ctx.column.nullable ? ' | null' : ''}\n`
			},
		})

		code += columnsCode
		code += hasOneCode
		code += hasManyCode
		code += '}\n\n'

		return code
	}
}
