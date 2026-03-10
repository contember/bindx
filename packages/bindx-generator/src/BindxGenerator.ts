/**
 * Main bindx schema generator
 *
 * Generates TypeScript schema files from Contember Model.Schema.
 */

import { Model } from '@contember/schema'
import { EntityTypeSchemaGenerator } from './EntityTypeSchemaGenerator'
import { EnumTypeSchemaGenerator } from './EnumTypeSchemaGenerator'
import { NameSchemaGenerator } from './NameSchemaGenerator'

export interface BindxGeneratorOptions {
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

	constructor(private readonly options: BindxGeneratorOptions = {}) {
		this.entityTypeSchemaGenerator = new EntityTypeSchemaGenerator()
		this.enumTypeSchemaGenerator = new EnumTypeSchemaGenerator()
		this.nameSchemaGenerator = new NameSchemaGenerator()
	}

	/**
	 * Generate schema files
	 */
	generate(model: Model.Schema): GeneratedFiles {
		const enumsCode = this.enumTypeSchemaGenerator.generate(model)
		const entitiesCode = this.entityTypeSchemaGenerator.generate(model)
		const namesSchema = this.nameSchemaGenerator.generate(model)

		const namesCode = `import type { BindxSchemaNames } from './types'

export const schemaNames: BindxSchemaNames = ${JSON.stringify(namesSchema, null, '\t')}
`

		const typesCode = this.generateTypesFile()
		const schemaCode = this.generateSchemaFile(model)

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
			.map(name => `\t${name}: entityDef<${name}>('${name}'),`)
			.join('\n')

		return `import { entityDef } from '@contember/bindx'
import type { ${imports} } from './entities'

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
			| { readonly type: 'column' }
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
	options?: BindxGeneratorOptions,
): GeneratedFiles {
	const generator = new BindxGenerator(options)
	return generator.generate(model)
}
