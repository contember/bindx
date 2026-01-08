/**
 * Utility functions for bindx schema generation
 */

import { Model } from '@contember/schema'

/**
 * Convert Contember column type to TypeScript type string
 */
export const columnToTsType = (column: Model.AnyColumn): string => {
	const baseType = (() => {
		switch (column.type) {
			case Model.ColumnType.Enum:
				return getEnumTypeName(column.columnType)
			case Model.ColumnType.String:
				return 'string'
			case Model.ColumnType.Int:
				return 'number'
			case Model.ColumnType.Double:
				return 'number'
			case Model.ColumnType.Bool:
				return 'boolean'
			case Model.ColumnType.DateTime:
				return 'string'
			case Model.ColumnType.Time:
				return 'string'
			case Model.ColumnType.Date:
				return 'string'
			case Model.ColumnType.Json:
				return 'JSONValue'
			case Model.ColumnType.Uuid:
				return 'string'
			default:
				((_: never) => {
					throw new Error(`Unknown column type ${_}`)
				})(column.type)
		}
	})()
	return column.list ? `readonly ${baseType}[]` : baseType
}

/**
 * Generate TypeScript enum type name from Contember enum name
 */
export const getEnumTypeName = (enumName: string): string => {
	return `${enumName}Enum`
}

/**
 * Capitalize first letter of a string
 */
export const capitalizeFirstLetter = (value: string): string => {
	return value.charAt(0).toUpperCase() + value.slice(1)
}
