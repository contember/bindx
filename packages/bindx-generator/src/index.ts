/**
 * @contember/bindx-generator
 * 
 * Schema generator for @contember/bindx with role-based ACL support.
 * Generates TypeScript types and runtime schema definitions from
 * Contember Model.Schema and Acl.Schema.
 */

export { BindxGenerator, generate } from './BindxGenerator'
export type { BindxGeneratorOptions, GeneratedFiles } from './BindxGenerator'

export { EntityTypeSchemaGenerator } from './EntityTypeSchemaGenerator'
export { EnumTypeSchemaGenerator } from './EnumTypeSchemaGenerator'
export { NameSchemaGenerator } from './NameSchemaGenerator'
export type { BindxSchemaNames, BindxSchemaEntityNames } from './NameSchemaGenerator'

export { RoleSchemaGenerator } from './RoleSchemaGenerator'
export type { RoleSchemaGeneratorOptions } from './RoleSchemaGenerator'

export { RoleNameSchemaGenerator } from './RoleNameSchemaGenerator'
export type { RoleSchemaNames } from './RoleNameSchemaGenerator'

export { columnToTsType, getEnumTypeName, capitalizeFirstLetter } from './utils'
