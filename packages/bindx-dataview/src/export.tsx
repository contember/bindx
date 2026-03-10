/**
 * DataView export functionality.
 *
 * Provides CSV export and a trigger component that downloads all matching data.
 *
 * Usage:
 * ```tsx
 * <DataViewExportTrigger baseName="articles">
 *   <button>Export CSV</button>
 * </DataViewExportTrigger>
 * ```
 */

import React, { forwardRef, type ReactElement, useCallback, useState } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { useDataViewContext } from './DataViewContext.js'
import { useBindxContext } from '@contember/bindx-react'
import type { ListQuery, ListQueryResult, QueryFieldSpec } from '@contember/bindx'

// ============================================================================
// Export Factory Interface
// ============================================================================

export interface ExportResult {
	readonly blob: Blob
	readonly extension: string
}

export interface ExportFactoryArgs {
	readonly data: readonly Record<string, unknown>[]
	readonly columns: readonly { name: string; fieldName: string | null }[]
}

export interface ExportFactory {
	create(args: ExportFactoryArgs): ExportResult
}

// ============================================================================
// CSV Export Factory
// ============================================================================

export class CsvExportFactory implements ExportFactory {
	create({ data, columns }: ExportFactoryArgs): ExportResult {
		const fieldColumns = columns.filter(c => c.fieldName !== null)
		const headers = fieldColumns.map(c => String(c.name))

		const rows = data.map(row => {
			return fieldColumns.map(col => {
				const value = col.fieldName ? row[col.fieldName] : ''
				return escapeCsvValue(value)
			})
		})

		const csvContent = [
			headers.join(','),
			...rows.map(row => row.join(',')),
		].join('\n')

		return {
			blob: new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
			extension: 'csv',
		}
	}
}

function flattenValue(value: unknown): string {
	if (value === null || value === undefined) return ''

	if (Array.isArray(value)) {
		return value.map(flattenValue).join('; ')
	}

	if (typeof value === 'object') {
		// Nested relation — flatten by extracting scalar values
		const parts: string[] = []
		for (const val of Object.values(value)) {
			if (val !== null && val !== undefined && typeof val !== 'object') {
				parts.push(String(val))
			} else if (typeof val === 'object') {
				const nested = flattenValue(val)
				if (nested) parts.push(nested)
			}
		}
		return parts.join(' ')
	}

	return String(value)
}

function escapeCsvValue(value: unknown): string {
	const str = flattenValue(value)
	if (str === '') return ''
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

// ============================================================================
// Export Trigger
// ============================================================================

const defaultExportFactory = new CsvExportFactory()

export interface DataViewExportTriggerProps {
	/** Button element */
	children: React.ReactElement
	/** Base file name. Default: entityType-date */
	baseName?: string
	/** Export factory. Default: CSV */
	exportFactory?: ExportFactory
	/** Only export visible columns (respects selection state). Default: false */
	onlyVisible?: boolean
}

export const DataViewExportTrigger = forwardRef<HTMLButtonElement, DataViewExportTriggerProps>(
	({ baseName, exportFactory = defaultExportFactory, onlyVisible = false, ...props }, ref) => {
		const { columns, entityType, filtering, selection } = useDataViewContext()
		const { adapter } = useBindxContext()
		const [isExporting, setIsExporting] = useState(false)

		const handleExport = useCallback(async (): Promise<void> => {
			if (!adapter || isExporting) return
			setIsExporting(true)

			try {
				const visibleColumns = onlyVisible
					? columns.filter((c, i) => selection.isVisible(c.fieldName ?? `col-${i}`))
					: columns

				// Build query spec from column fields
				const fields: QueryFieldSpec[] = visibleColumns
					.filter(c => c.fieldName !== null)
					.map(c => ({ name: c.fieldName!, sourcePath: [c.fieldName!] }))

				const listQuery: ListQuery = {
					type: 'list',
					entityType,
					filter: filtering.resolvedWhere,
					orderBy: undefined,
					limit: undefined,
					offset: undefined,
					spec: { fields },
				}

				const results = await adapter.query([listQuery])
				const result = results[0]
				if (!result || result.type !== 'list') {
					console.error('Export failed: unexpected result')
					return
				}

				const exportColumns = visibleColumns
					.filter(c => c.fieldName !== null)
					.map(c => ({ name: String(c.header ?? c.fieldName ?? ''), fieldName: c.fieldName }))

				const { blob, extension } = exportFactory.create({
					data: (result as ListQueryResult).data,
					columns: exportColumns,
				})

				// Trigger download
				const fileName = `${baseName ?? `${entityType}-${new Date().toISOString().split('T')[0]}`}.${extension}`
				const url = URL.createObjectURL(blob)
				const link = document.createElement('a')
				link.href = url
				link.download = fileName
				document.body.appendChild(link)
				link.click()
				document.body.removeChild(link)
				URL.revokeObjectURL(url)
			} finally {
				setIsExporting(false)
			}
		}, [adapter, columns, entityType, filtering.resolvedWhere, exportFactory, baseName, isExporting, onlyVisible, selection])

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, handleExport)}
				disabled={isExporting}
				data-state={isExporting ? 'exporting' : 'idle'}
				{...otherProps}
			/>
		)
	},
)
DataViewExportTrigger.displayName = 'DataViewExportTrigger'

// ============================================================================
// Fetch all data hook (for custom export)
// ============================================================================

export interface FetchAllDataResult {
	data: readonly Record<string, unknown>[]
}

export function useDataViewFetchAllData(): () => Promise<FetchAllDataResult | null> {
	const { columns, entityType, filtering } = useDataViewContext()
	const { adapter } = useBindxContext()

	return useCallback(async (): Promise<FetchAllDataResult | null> => {
		if (!adapter) return null

		const fields: QueryFieldSpec[] = columns
			.filter(c => c.fieldName !== null)
			.map(c => ({ name: c.fieldName!, sourcePath: [c.fieldName!] }))

		const listQuery: ListQuery = {
			type: 'list',
			entityType,
			filter: filtering.resolvedWhere,
			orderBy: undefined,
			limit: undefined,
			offset: undefined,
			spec: { fields },
		}

		const results = await adapter.query([listQuery])
		const result = results[0]
		if (!result || result.type !== 'list') return null
		return { data: (result as ListQueryResult).data }
	}, [adapter, columns, entityType, filtering.resolvedWhere])
}
