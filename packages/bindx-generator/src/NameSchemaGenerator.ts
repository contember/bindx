/**
 * Name schema generator for bindx
 * Generates runtime schema names (JSON structure) for query building
 */

import { Model } from '@contember/schema'
import { acceptEveryFieldVisitor } from '@contember/schema-utils'

export interface BindxSchemaEntityNames {
	readonly name: string
	readonly scalars: readonly string[]
	readonly fields: {
		readonly [fieldName: string]:
			| { readonly type: 'column'; readonly columnType?: string; readonly enumName?: string }
			| { readonly type: 'one'; readonly entity: string }
			| { readonly type: 'many'; readonly entity: string }
	}
}

export interface BindxSchemaNames {
	readonly entities: {
		readonly [entityName: string]: BindxSchemaEntityNames
	}
	readonly enums: {
		readonly [enumName: string]: readonly string[]
	}
}

export class NameSchemaGenerator {
	generate(model: Model.Schema): BindxSchemaNames {
		return {
			entities: Object.fromEntries(
				Object.values(model.entities).map(entity => {
					const fields: Record<string, BindxSchemaEntityNames['fields'][string]> = {}
					const scalars: string[] = []

					acceptEveryFieldVisitor(model, entity, {
						visitHasOne: ctx => {
							fields[ctx.relation.name] = {
								type: 'one',
								entity: ctx.targetEntity.name,
							}
						},
						visitHasMany: ctx => {
							fields[ctx.relation.name] = {
								type: 'many',
								entity: ctx.targetEntity.name,
							}
						},
						visitColumn: ctx => {
							scalars.push(ctx.column.name)
							fields[ctx.column.name] = ctx.column.type === Model.ColumnType.Enum
								? { type: 'column', columnType: ctx.column.columnType, enumName: ctx.column.columnType }
								: { type: 'column', columnType: ctx.column.columnType }
						},
					})

					return [entity.name, { name: entity.name, fields, scalars }]
				}),
			),
			enums: Object.fromEntries(
				Object.entries(model.enums).map(([name, values]) => [name, values]),
			),
		}
	}
}
