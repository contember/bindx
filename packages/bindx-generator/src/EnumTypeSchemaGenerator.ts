/**
 * Enum type schema generator for bindx
 * Generates TypeScript enum types from Contember model enums
 */

import { Model } from '@contember/schema'
import { getEnumTypeName } from './utils'

export class EnumTypeSchemaGenerator {
	generate(model: Model.Schema): string {
		let code = ''

		for (const [enumName, values] of Object.entries(model.enums)) {
			code += `export type ${getEnumTypeName(enumName)} = ${values.map(v => `'${v}'`).join(' | ')}\n\n`
		}

		// Export enum values as const arrays for runtime use
		for (const [enumName, values] of Object.entries(model.enums)) {
			code += `export const ${enumName}Values = [${values.map(v => `'${v}'`).join(', ')}] as const\n`
		}

		return code
	}
}
