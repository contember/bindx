/**
 * `createRelationColumn()` — factory for building relation column components (hasOne, hasMany).
 *
 * Parallel to `createColumn()` for scalar types. Handles:
 * - Related entity metadata extraction (entityName, selection)
 * - Collection phase (collectSelection)
 * - Filter item rendering (renderFilterItem)
 * - Cell rendering with children render function
 *
 * UI layers provide renderFilter and renderCellWrapper via config.
 */

import React from 'react'
import type { FieldRef, FilterArtifact, FilterHandler, EntityAccessor, SelectionMeta } from '@contember/bindx'
import { SelectionScope } from '@contember/bindx'
import { createCollectorProxy, collectSelection as collectJsxSelection, SCOPE_REF } from '@contember/bindx-react'
import type { ColumnTypeDef } from './columnTypes.js'

/** If a render result is a FieldRef-like object with `.value`, extract the string value. */
function unwrapRenderResult(result: React.ReactNode): React.ReactNode {
	if (result && typeof result === 'object' && 'value' in result) {
		const val = (result as { value: unknown }).value
		return val != null ? String(val) : ''
	}
	return result
}
import { ColumnLeaf, type ColumnLeafProps } from './columnLeaf.js'
import { extractFieldName, extractRelatedEntityName } from './fieldRef.js'
import { accessField, getRelatedAccessor } from './columnTypes.js'

// ============================================================================
// Config
// ============================================================================

export interface RelationColumnConfig {
	/** Renders the filter UI in column header popover. Receives relation context. */
	readonly renderFilter?: (ctx: RelationFilterContext) => React.ReactNode
	/** Wraps cell content (e.g. tooltip with filter actions). */
	readonly renderCellWrapper?: (ctx: RelationCellWrapperContext) => React.ReactNode
}

export interface RelationFilterContext {
	readonly filterName: string
	readonly entityName: string
	readonly selection: SelectionMeta
	readonly renderItem: (accessor: EntityAccessor<object>) => React.ReactNode
}

export interface RelationCellWrapperContext {
	readonly content: React.ReactNode
	readonly item: EntityAccessor<object>
	readonly fieldName: string
	readonly filterName: string
	readonly fieldRef: FieldRef<unknown>
}

// ============================================================================
// Props
// ============================================================================

export interface RelationColumnProps<TEntity, TSelected> {
	field: object
	header?: React.ReactNode
	filter?: boolean
	renderCellWrapper?: (content: React.ReactNode, item: EntityAccessor<object>) => React.ReactNode
	children: (entity: EntityAccessor<TEntity, TSelected>) => React.ReactNode
}

/**
 * Walks the JSX a cell renderer returned so nested components declare their
 * selection. Proxy touches alone only see the refs passed as props; a nested
 * `<HasMany>` or `createComponent()` registers its fields only when analyzed.
 *
 * The analyzer's return value is deliberately discarded: every component
 * registers through the scope of the ref it received, which is the only way to
 * attribute a field to the right entity — the rendered JSX may mix refs of the
 * related entity with refs of the row entity.
 */
function analyzeRenderedSelection(rendered: React.ReactNode): void {
	collectJsxSelection(rendered)
}

function getSelectionScope(ref: unknown): SelectionScope | null {
	if (typeof ref !== 'object' || ref === null || !(SCOPE_REF in ref)) return null
	const scope = ref[SCOPE_REF]
	return scope instanceof SelectionScope ? scope : null
}

function replaceSelectionFields(target: SelectionMeta, source: SelectionMeta): void {
	target.fields.clear()
	for (const [name, field] of source.fields) {
		target.fields.set(name, field)
	}
}

// ============================================================================
// Factory
// ============================================================================

interface RelationCellConfig {
	/** How to collect selection for the relation (differs between hasOne and hasMany) */
	collectSelection: (renderer: (ref: unknown) => React.ReactNode, fieldRef: FieldRef<unknown>) => void
	/** How to render the cell content (differs between hasOne and hasMany) */
	renderCell: (accessor: EntityAccessor<object>, fieldName: string, renderer: (ref: unknown) => React.ReactNode) => React.ReactNode
}

export function createRelationColumn<TFilterArtifact extends FilterArtifact>(
	columnType: ColumnTypeDef<unknown, TFilterArtifact>,
	cellConfig: RelationCellConfig,
	uiConfig: RelationColumnConfig = {},
) {
	function buildLeaf(props: Record<string, unknown>): ColumnLeafProps {
		const fieldRef = props['field'] as FieldRef<unknown> | undefined
		const fieldName = fieldRef ? extractFieldName(fieldRef) : null
		const renderer = props['children'] as ((ref: unknown) => React.ReactNode) | undefined
		const header = props['header'] as React.ReactNode | undefined
		const filterEnabled = (props['filter'] as boolean | undefined) ?? true
		const customCellWrapper = props['renderCellWrapper'] as ((content: React.ReactNode, item: EntityAccessor<object>) => React.ReactNode) | undefined

		const relatedEntityName = extractRelatedEntityName(fieldRef) ?? ''

		// Collect selection metadata for the related entity (for filter fetching)
		const relatedSelection: SelectionMeta = { fields: new Map() }
		if (relatedEntityName && renderer) {
			const scope = new SelectionScope()
			const proxy = createCollectorProxy(scope, relatedEntityName)
			analyzeRenderedSelection(renderer(proxy))
			replaceSelectionFields(relatedSelection, scope.toSelectionMeta())
		}

		const renderFilterItem = renderer
			? (accessor: EntityAccessor<object>): React.ReactNode => unwrapRenderResult(renderer(accessor))
			: (() => null)

		const filterName = filterEnabled && fieldName ? fieldName : null

		// Resolve renderFilter — use UI config, or leave undefined (headless)
		// Note: relation filter UI ignores artifact/setArtifact (uses hooks internally)
		const renderFilter = filterName && relatedEntityName && uiConfig.renderFilter
			? (_filterProps: { artifact: FilterArtifact; setArtifact: (artifact: FilterArtifact) => void }) =>
				uiConfig.renderFilter!({ filterName, entityName: relatedEntityName, selection: relatedSelection, renderItem: renderFilterItem })
			: undefined

		// Resolve renderCellWrapper — user prop overrides UI config default
		const resolvedCellWrapper = customCellWrapper
			?? (filterName && fieldName && fieldRef && uiConfig.renderCellWrapper
				? (content: React.ReactNode, item: EntityAccessor<object>) =>
					uiConfig.renderCellWrapper!({ content, item, fieldName, filterName, fieldRef })
				: undefined)

		return {
			name: fieldName ?? `col-${Math.random().toString(36).slice(2, 8)}`,
			fieldName,
			fieldRef: fieldRef ?? null,
			sortingField: null,
			filterName,
			filterHandler: filterName
				? columnType.createFilterHandler(fieldName!) as FilterHandler<FilterArtifact>
				: undefined,
			isTextSearchable: false,
			columnType: columnType.name as ColumnLeafProps['columnType'],
			relatedEntityName,
			relatedSelection,
			renderFilterItem,
			renderFilter,
			renderCellWrapper: resolvedCellWrapper,
			header,
			collectSelection: () => {
				if (renderer && fieldRef) {
					cellConfig.collectSelection(renderer, fieldRef)
					const authoritativeScope = getSelectionScope(fieldRef)
					if (authoritativeScope) {
						replaceSelectionFields(relatedSelection, authoritativeScope.toSelectionMeta())
					}
				}
			},
			renderCell: (accessor: EntityAccessor<object>) => {
				if (!fieldName || !renderer) return null
				return cellConfig.renderCell(accessor, fieldName, renderer)
			},
		}
	}

	const Component = Object.assign(
		function RelationColumn<TEntity, TSelected>(_props: RelationColumnProps<TEntity, TSelected>): null {
			return null
		},
		{
			staticRender: (props: Record<string, unknown>): React.ReactNode => {
				return React.createElement(ColumnLeaf, buildLeaf(props) as ColumnLeafProps)
			},
			buildLeaf,
		},
	)

	return Component as RelationColumnComponent
}

export interface RelationColumnComponent {
	<TEntity, TSelected>(props: RelationColumnProps<TEntity, TSelected>): null
	staticRender: (props: Record<string, unknown>) => React.ReactNode
	buildLeaf: (props: Record<string, unknown>) => ColumnLeafProps
}

// ============================================================================
// Cell configs for hasOne and hasMany
// ============================================================================

export const hasOneCellConfig: RelationCellConfig = {
	collectSelection: (renderer, fieldRef) => {
		analyzeRenderedSelection(renderer(fieldRef))
	},
	renderCell: (accessor, fieldName, renderer) => {
		const related = getRelatedAccessor(accessor, fieldName)
		if (!related) return null
		return unwrapRenderResult(renderer(related))
	},
}

export const hasManyCellConfig: RelationCellConfig = {
	collectSelection: (renderer, fieldRef) => {
		const ref = fieldRef as { map?: (fn: (item: unknown, index: number) => unknown) => unknown[] }
		const rendered: React.ReactNode[] = []
		ref.map?.((item) => { rendered.push(renderer(item)); return null })
		analyzeRenderedSelection(rendered)
	},
	renderCell: (accessor, fieldName, renderer) => {
		const ref = accessField(accessor, fieldName) as { items?: EntityAccessor<object>[] } | null
		const items = ref?.items
		if (!Array.isArray(items) || items.length === 0) return ''

		return items.map((item, i) => (
			<React.Fragment key={i}>{i > 0 ? ', ' : ''}{unwrapRenderResult(renderer(item))}</React.Fragment>
		))
	},
}
