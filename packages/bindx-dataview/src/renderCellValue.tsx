/**
 * Utility for rendering cell values from column metadata and entity accessor.
 * Extracted from DataGrid to be usable by any table rendering component.
 */

import React from 'react'
import type { ColumnMeta } from './columns.js'
import type { EntityAccessor } from '@contember/bindx-react'

export function renderCellValue(col: ColumnMeta, accessor: EntityAccessor<unknown>): React.ReactNode {
	if (col.type === 'action') {
		return col.cellRenderer ? col.cellRenderer(accessor) : null
	}

	if (!col.fieldName) return null

	const fieldRef = (accessor as unknown as Record<string, unknown>)[col.fieldName]
	if (!fieldRef) return null

	if (col.type === 'text' || col.type === 'number' || col.type === 'date' || col.type === 'dateTime'
		|| col.type === 'boolean' || col.type === 'enum' || col.type === 'enumList'
		|| col.type === 'uuid' || col.type === 'isDefined' || col.type === 'custom') {
		const value = (fieldRef as { value?: unknown }).value ?? null

		if (col.cellRenderer) {
			return col.cellRenderer(value)
		}

		if (col.type === 'boolean') {
			return value != null ? String(value) : ''
		}

		if (col.type === 'isDefined') {
			return value != null ? '✓' : '✗'
		}

		if (col.type === 'dateTime' && typeof value === 'string') {
			return formatDateTime(value)
		}

		if (col.type === 'enumList' && Array.isArray(value)) {
			return value.join(', ')
		}

		return value != null ? String(value) : ''
	}

	if (col.type === 'hasOne') {
		if (col.relationRenderer) {
			const result = col.relationRenderer(fieldRef)
			if (result && typeof result === 'object' && 'value' in result) {
				return (result as { value: unknown }).value != null
					? String((result as { value: unknown }).value)
					: ''
			}
			return result
		}
		return null
	}

	if (col.type === 'hasMany') {
		const items = (fieldRef as { items?: unknown[] }).items
		if (!Array.isArray(items) || items.length === 0) return ''

		if (col.relationRenderer) {
			return items.map((item, i) => {
				const result = col.relationRenderer!(item)
				if (result && typeof result === 'object' && 'value' in result) {
					const val = (result as { value: unknown }).value
					return <React.Fragment key={i}>{i > 0 ? ', ' : ''}{val != null ? String(val) : ''}</React.Fragment>
				}
				return <React.Fragment key={i}>{i > 0 ? ', ' : ''}{result}</React.Fragment>
			})
		}
		return null
	}

	return null
}

function formatDateTime(value: string): string {
	const date = new Date(value)
	if (isNaN(date.getTime())) return value
	return date.toLocaleString()
}
