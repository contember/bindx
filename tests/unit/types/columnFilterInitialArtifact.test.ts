/**
 * Type-level tests for the `filterInitialArtifact` column prop.
 *
 * A column built by `createColumn` carries its filter artifact type
 * (`filterInitialArtifact` accepts only that type), and the prop sits in a
 * parameter, so it is contravariant. The unparameterized `ColumnComponent` must
 * still accept every specific column, or annotating such a column with it stops
 * compiling. Enum columns narrow the artifact's values to the enum.
 *
 * Positive cases are real assignments, so they exercise the compiler's own
 * assignability check. Negative cases use `assertFalse<IsAssignable<S, T>>()`
 * (see `selectionErasure.test.ts` for why not `@ts-expect-error`).
 */

import { describe, expect, test } from 'bun:test'
import type { EnumFilterArtifact, EnumListFilterArtifact, FieldRef, TextFilterArtifact } from '@contember/bindx'
import {
	createColumn,
	DataGridTextColumn,
	enumColumnDef,
	textColumnDef,
	type ColumnComponent,
	type ColumnComponentProps,
	type DataGridEnumColumnProps,
	type DataGridEnumListColumnProps,
} from '@contember/bindx-dataview'

type IsAssignable<TSource, TTarget> = [TSource] extends [TTarget] ? true : false

function assertTrue<T extends true>(): void {}
function assertFalse<T extends false>(): void {}

const TextColumn: ColumnComponent = createColumn(textColumnDef, { renderCell: () => null })
const EnumColumn: ColumnComponent = createColumn(enumColumnDef, { renderCell: () => null })
const BuiltInTextColumn: ColumnComponent = DataGridTextColumn

type TextColumnProps = Parameters<typeof DataGridTextColumn<string>>[0]

describe('ColumnComponent — filter artifact type', () => {
	test('a column built by createColumn is assignable to the unparameterized ColumnComponent', () => {
		expect(typeof TextColumn).toBe('function')
		expect(typeof EnumColumn).toBe('function')
		expect(typeof BuiltInTextColumn).toBe('function')
	})

	test('a column takes an initial artifact of its own filter type only', () => {
		assertTrue<IsAssignable<{ field: FieldRef<string>; filterInitialArtifact: TextFilterArtifact }, TextColumnProps>>()
		assertFalse<IsAssignable<{ field: FieldRef<string>; filterInitialArtifact: EnumFilterArtifact }, TextColumnProps>>()
		expect(true).toBe(true)
	})

	test('the unparameterized ColumnComponent takes no initial artifact', () => {
		assertFalse<IsAssignable<{ field: FieldRef<string>; filterInitialArtifact: TextFilterArtifact }, ColumnComponentProps<string, never>>>()
		expect(true).toBe(true)
	})
})

type Status = 'draft' | 'published'

describe('enum columns — initial artifact values', () => {
	test('an enum column takes only values of its enum', () => {
		assertTrue<IsAssignable<EnumFilterArtifact<'published'>, NonNullable<DataGridEnumColumnProps<Status>['filterInitialArtifact']>>>()
		assertFalse<IsAssignable<EnumFilterArtifact<'archived'>, NonNullable<DataGridEnumColumnProps<Status>['filterInitialArtifact']>>>()
		expect(true).toBe(true)
	})

	test('an enum list column takes only values of its enum', () => {
		assertTrue<IsAssignable<EnumListFilterArtifact<'draft'>, NonNullable<DataGridEnumListColumnProps<Status>['filterInitialArtifact']>>>()
		assertFalse<IsAssignable<EnumListFilterArtifact<'archived'>, NonNullable<DataGridEnumListColumnProps<Status>['filterInitialArtifact']>>>()
		expect(true).toBe(true)
	})
})
