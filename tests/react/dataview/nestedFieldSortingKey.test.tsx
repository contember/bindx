// Regression test for <issue-url — filled in after filing>
//
// A DataGrid column declared with a NESTED field ref — field={it.relation.scalar},
// e.g. a scalar on a oneHasOne view entity — registers its sortingField as the
// dotted path ('relation.scalar'): createColumn derives it via extractFieldName,
// which joins FIELD_REF_META.fullPath. But useSortingState's setOrderBy and
// directionOf key by FIELD_REF_META.fieldName — the LEAF segment only — so the
// `sortableFields.has(...)` guard never matches a nested ref and a header click
// is a silent no-op (and the sort indicator never lights). Seeding the same
// dotted key via initialSorting resolves to the correct nested orderBy, which
// shows the dotted path is the canonical sorting key; only the ref→key
// derivation in setOrderBy/directionOf disagrees with it.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, cleanup, act } from '@testing-library/react'
import {
	defineSchema,
	scalar,
	hasOne,
	createCollectorProxy,
} from '@contember/bindx-react'
import { SelectionScope, SchemaRegistry } from '@contember/bindx'
import { extractFieldName, useSortingState } from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema — a Project with a oneHasOne stats relation (view-entity shape)
// ============================================================================

interface ProjectStats {
	id: string
	memberCount: number
}

interface Project {
	id: string
	name: string
	stats: ProjectStats | null
}

interface TestSchema {
	Project: Project
	ProjectStats: ProjectStats
}

const testSchema = defineSchema<TestSchema>({
	entities: {
		Project: {
			fields: {
				id: scalar(),
				name: scalar(),
				stats: hasOne('ProjectStats'),
			},
		},
		ProjectStats: {
			fields: {
				id: scalar(),
				memberCount: scalar(),
			},
		},
	},
})

const schemaRegistry = new SchemaRegistry(testSchema)

function createProjectProxy() {
	const scope = new SelectionScope()
	return createCollectorProxy<Project>(scope, 'Project', schemaRegistry)
}

// ============================================================================
// Tests
// ============================================================================

describe('useSortingState — nested field refs', () => {
	test('should toggle sorting when setOrderBy receives the same nested ref the column registered as sortable', () => {
		const it = createProjectProxy()
		const nestedRef = it.stats.memberCount

		// Premise: this is exactly what createColumn stores as the column's
		// sortingField (and therefore what lands in sortableFields).
		expect(extractFieldName(nestedRef)).toBe('stats.memberCount')

		const { result } = renderHook(() =>
			useSortingState({ sortableFields: new Set(['stats.memberCount']) }),
		)

		// A header click dispatches setOrderBy(fieldRef, 'next') with the SAME
		// ref the column was declared with.
		act(() => {
			result.current.setOrderBy(nestedRef, 'next')
		})

		// FAILS today: setOrderBy keys the guard by FIELD_REF_META.fieldName
		// ('memberCount'), which is not in sortableFields, so the call is a
		// silent no-op — resolvedOrderBy stays undefined and directionOf null.
		expect(result.current.resolvedOrderBy).toEqual([{ stats: { memberCount: 'asc' } }])
		expect(result.current.directionOf(nestedRef)).toBe('asc')
	})

	test('should sort by a top-level ref (control — unaffected by the bug)', () => {
		const it = createProjectProxy()
		const topLevelRef = it.name

		const { result } = renderHook(() =>
			useSortingState({ sortableFields: new Set(['name']) }),
		)

		act(() => {
			result.current.setOrderBy(topLevelRef, 'next')
		})

		expect(result.current.resolvedOrderBy).toEqual([{ name: 'asc' }])
		expect(result.current.directionOf(topLevelRef)).toBe('asc')
	})

	test('should resolve a dotted initialSorting key to a nested orderBy (control — shows the dotted path is the canonical key)', () => {
		const { result } = renderHook(() =>
			useSortingState({
				sortableFields: new Set(['stats.memberCount']),
				initialSorting: { 'stats.memberCount': 'desc' },
			}),
		)

		expect(result.current.resolvedOrderBy).toEqual([{ stats: { memberCount: 'desc' } }])
	})
})
