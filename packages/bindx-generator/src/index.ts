/**
 * @contember/bindx-generator
 *
 * Schema generator for @contember/bindx.
 * Generates TypeScript types and runtime schema definitions from
 * Contember Model.Schema.
 */

export { BindxGenerator, generate } from './BindxGenerator'
export type { BindxGeneratorOptions, GeneratedFiles } from './BindxGenerator'

export { EntityTypeSchemaGenerator } from './EntityTypeSchemaGenerator'
export { EnumTypeSchemaGenerator } from './EnumTypeSchemaGenerator'
export { NameSchemaGenerator } from './NameSchemaGenerator'
export type { BindxSchemaNames, BindxSchemaEntityNames } from './NameSchemaGenerator'

export { columnToTsType, getEnumTypeName, capitalizeFirstLetter } from './utils'
