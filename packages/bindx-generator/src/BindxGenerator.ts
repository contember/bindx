/**
 * Main bindx schema generator
 * 
 * Generates TypeScript schema files from Contember Model.Schema and Acl.Schema.
 * Supports both single-role and multi-role generation with ACL-based field filtering.
 */

import { Acl, Model } from '@contember/schema'
import { EntityTypeSchemaGenerator } from './EntityTypeSchemaGenerator'
import { EnumTypeSchemaGenerator } from './EnumTypeSchemaGenerator'
import { NameSchemaGenerator } from './NameSchemaGenerator'
import { RoleSchemaGenerator, RoleSchemaGeneratorOptions } from './RoleSchemaGenerator'
import { RoleNameSchemaGenerator } from './RoleNameSchemaGenerator'
import { capitalizeFirstLetter } from './utils'

export interface BindxGeneratorOptions extends RoleSchemaGeneratorOptions {
	/**
	 * Whether to generate role-based schemas.
	 * When true, generates separate schema types for each role in acl.
	 * When false, generates a single schema with all entities and fields.
	 * Default: true if acl is provided, false otherwise
	 */
	roleAware?: boolean
}

export interface GeneratedFiles {
	'entities.ts': string
	'names.ts'?: string
	'enums.ts': string
	'types.ts': string
	'index.ts': string
}

export class BindxGenerator {
	private readonly entityTypeSchemaGenerator: EntityTypeSchemaGenerator
	private readonly enumTypeSchemaGenerator: EnumTypeSchemaGenerator
	private readonly nameSchemaGenerator: NameSchemaGenerator
	private readonly roleSchemaGenerator: RoleSchemaGenerator
	private readonly roleNameSchemaGenerator: RoleNameSchemaGenerator

	constructor(private readonly options: BindxGeneratorOptions = {}) {
		this.entityTypeSchemaGenerator = new EntityTypeSchemaGenerator()
		this.enumTypeSchemaGenerator = new EnumTypeSchemaGenerator()
		this.nameSchemaGenerator = new NameSchemaGenerator()
		this.roleSchemaGenerator = new RoleSchemaGenerator(options)
		this.roleNameSchemaGenerator = new RoleNameSchemaGenerator(options)
	}

	/**
	 * Generate schema files without role-based ACL filtering
	 */
	generate(model: Model.Schema): GeneratedFiles {
		const enumsCode = this.enumTypeSchemaGenerator.generate(model)
		const entitiesCode = this.entityTypeSchemaGenerator.generate(model)
		const namesSchema = this.nameSchemaGenerator.generate(model)

		const namesCode = `import type { BindxSchemaNames } from './types'

export const schemaNames: BindxSchemaNames = ${JSON.stringify(namesSchema, null, '\t')}
`

		const typesCode = this.generateTypesFile()

		const indexCode = `export * from './enums'
export * from './entities'
export * from './names'
export * from './types'

import { schemaNames } from './names'
import type { BindxSchema } from './entities'
import { createBindx } from '@contember/react-bindx'

/**
 * Pre-configured bindx instance for this schema
 */
export const { useEntity, useEntityList, Entity, createComponent } = createBindx<BindxSchema>(schemaNames as any)
`

		return {
			'entities.ts': entitiesCode,
			'names.ts': namesCode,
			'enums.ts': enumsCode,
			'types.ts': typesCode,
			'index.ts': indexCode,
		}
	}

	/**
	 * Generate schema files with role-based ACL filtering
	 */
	generateWithRoles(model: Model.Schema, acl: Acl.Schema): GeneratedFiles {
		const enumsCode = this.enumTypeSchemaGenerator.generate(model)
		const entitiesCode = this.roleSchemaGenerator.generate(model, acl)

		const typesCode = this.generateTypesFile()

		const indexCode = `export * from './enums'
export * from './entities'
export * from './types'

import type { RoleSchemas } from './entities'
import type { SchemaInput, RoleAwareBindx } from '@contember/react-bindx'
import { createRoleAwareBindx } from '@contember/react-bindx'

/**
 * Creates a typed role-aware bindx instance for this schema.
 *
 * @param schema - Schema loaded from API (ContemberSchema), binding-common Schema,
 *                 or a SchemaRegistry instance
 *
 * @example
 * \`\`\`tsx
 * // With binding-common's Schema (from useEnvironment)
 * const schema = useEnvironment().getSchema()
 * const { RoleAwareProvider, Entity, HasRole } = createBindx(schema)
 *
 * // With SchemaLoader
 * const schema = await SchemaLoader.loadSchema(client)
 * const { RoleAwareProvider, Entity, HasRole } = createBindx(schema)
 *
 * // Usage:
 * <RoleAwareProvider hasRole={(role) => userRoles.has(role)}>
 *   <Entity name="Article" id={id}>
 *     {entity => <HasRole role="admin">{adminEntity => ...}</HasRole>}
 *   </Entity>
 * </RoleAwareProvider>
 * \`\`\`
 */
export function createBindx(schema: SchemaInput): RoleAwareBindx<RoleSchemas> {
	return createRoleAwareBindx<RoleSchemas>(schema)
}
`

		return {
			'entities.ts': entitiesCode,
			'enums.ts': enumsCode,
			'types.ts': typesCode,
			'index.ts': indexCode,
		}
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
 * // Without ACL
 * const files = generate(model)
 * 
 * // With role-based ACL
 * const files = generate(model, acl)
 * ```
 */
export function generate(
	model: Model.Schema,
	acl?: Acl.Schema,
	options?: BindxGeneratorOptions,
): GeneratedFiles {
	const generator = new BindxGenerator(options)

	if (acl) {
		return generator.generateWithRoles(model, acl)
	}

	return generator.generate(model)
}
