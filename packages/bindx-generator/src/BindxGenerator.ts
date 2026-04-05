/**
 * Main bindx schema generator
 *
 * Generates TypeScript schema files from Contember Model.Schema.
 */

import { Model, Acl } from '@contember/schema'
import { EntityTypeSchemaGenerator } from './EntityTypeSchemaGenerator'
import { EnumTypeSchemaGenerator } from './EnumTypeSchemaGenerator'
import { NameSchemaGenerator } from './NameSchemaGenerator'
import { RoleSchemaGenerator, type RoleSchemaGeneratorOptions } from './RoleSchemaGenerator'

export interface BindxGeneratorOptions extends RoleSchemaGeneratorOptions {
	// Reserved for future options
}

export interface GeneratedFiles {
	'entities.ts': string
	'names.ts'?: string
	'enums.ts': string
	'types.ts': string
	'schema.ts': string
	'index.ts': string
}

export class BindxGenerator {
	private readonly entityTypeSchemaGenerator: EntityTypeSchemaGenerator
	private readonly enumTypeSchemaGenerator: EnumTypeSchemaGenerator
	private readonly nameSchemaGenerator: NameSchemaGenerator
	private readonly roleSchemaGenerator: RoleSchemaGenerator

	constructor(private readonly options: BindxGeneratorOptions = {}) {
		this.entityTypeSchemaGenerator = new EntityTypeSchemaGenerator()
		this.enumTypeSchemaGenerator = new EnumTypeSchemaGenerator()
		this.nameSchemaGenerator = new NameSchemaGenerator()
		this.roleSchemaGenerator = new RoleSchemaGenerator(options)
	}

	/**
	 * Generate schema files
	 */
	generate(model: Model.Schema, acl?: Acl.Schema): GeneratedFiles {
		const enumsCode = this.enumTypeSchemaGenerator.generate(model)
		let entitiesCode = this.entityTypeSchemaGenerator.generate(model)
		const namesSchema = this.nameSchemaGenerator.generate(model)

		// Append per-role entity types if ACL is provided
		if (acl) {
			entitiesCode += '\n' + this.roleSchemaGenerator.generateRoleEntities(model, acl)
		}

		const namesCode = `import type { BindxSchemaNames } from './types'

export const schemaNames: BindxSchemaNames = ${JSON.stringify(namesSchema, null, '\t')}
`

		const typesCode = this.generateTypesFile()
		const schemaCode = acl
			? this.roleSchemaGenerator.generateSchemaFile(model, acl)
			: this.generateSchemaFile(model)

		const indexCode = `export * from './enums'
export * from './entities'
export * from './names'
export * from './types'
export * from './schema'
`

		return {
			'entities.ts': entitiesCode,
			'names.ts': namesCode,
			'enums.ts': enumsCode,
			'types.ts': typesCode,
			'schema.ts': schemaCode,
			'index.ts': indexCode,
		}
	}

	private generateSchemaFile(model: Model.Schema): string {
		const entityNames = Object.values(model.entities).map(e => e.name).sort()

		const imports = entityNames.join(', ')
		const entries = entityNames
			.map(name => `\t${name}: entityDef<${name}>('${name}', schemaDef),`)
			.join('\n')

		return `import { entityDef } from '@contember/bindx'
import { schemaNamesToDef } from '@contember/bindx-react'
import type { ${imports} } from './entities'
import { schemaNames } from './names'

const schemaDef = schemaNamesToDef(schemaNames)

export const schema = {
${entries}
} as const
`
	}

	private generateTypesFile(): string {
		return `/**
 * Shared types for bindx schema
 */

export interface BindxSchemaEntityNames {
	readonly name: string
	readonly scalars: readonly string[]
	readonly fields: {
		readonly [fieldName: string]:
			| { readonly type: 'column'; readonly columnType?: string; readonly enumName?: string }
			| { readonly type: 'one'; readonly entity: string; readonly nullable?: boolean }
			| { readonly type: 'many'; readonly entity: string; readonly relationKind?: 'oneHasMany' | 'manyHasMany'; readonly nullable?: boolean }
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
`
	}
}

/**
 * Generate bindx schema files from Contember model
 *
 * @example
 * ```ts
 * const files = generate(model)
 * ```
 */
export function generate(
	model: Model.Schema,
	aclOrOptions?: Acl.Schema | BindxGeneratorOptions,
	options?: BindxGeneratorOptions,
): GeneratedFiles {
	// Support both generate(model, acl, options) and generate(model, options)
	let acl: Acl.Schema | undefined
	let opts: BindxGeneratorOptions | undefined

	if (aclOrOptions && 'roles' in aclOrOptions) {
		acl = aclOrOptions
		opts = options
	} else {
		opts = aclOrOptions as BindxGeneratorOptions | undefined
	}

	const generator = new BindxGenerator(opts)
	return generator.generate(model, acl)
}
