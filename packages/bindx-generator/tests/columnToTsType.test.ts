import { describe, expect, test } from 'bun:test'
import { columnToTsType } from '../src/index'
import { Model } from '@contember/schema'

const column = (type: Model.ColumnType, columnType: string, list?: boolean): Model.AnyColumn => ({
	name: 'value',
	columnName: 'value',
	type,
	columnType,
	nullable: true,
	...(list === undefined ? {} : { list }),
})

describe('columnToTsType', () => {
	test('types an exact decimal as a string', () => {
		expect(columnToTsType(column(Model.ColumnType.Numeric, 'numeric'))).toBe('string')
	})

	test('types a list of exact decimals as a readonly string array', () => {
		expect(columnToTsType(column(Model.ColumnType.Numeric, 'numeric', true))).toBe('readonly string[]')
	})
})
