import type { ReactNode, ReactElement } from 'react'
import { isValidElement } from 'react'
import type { SelectionMeta, SelectionFieldMeta, SelectionProvider } from './types.js'
import { SelectionMetaCollector, mergeSelections } from './SelectionMeta.js'

/**
 * Analyzes JSX tree to extract field selection metadata.
 * This is called during the collection phase to determine which fields need to be fetched.
 */
export function analyzeJsx(node: ReactNode, selection: SelectionMetaCollector): void {
	// Handle null/undefined
	if (node === null || node === undefined) {
		return
	}

	// Handle primitives (string, number, boolean)
	if (typeof node !== 'object') {
		return
	}

	// Handle arrays
	if (Array.isArray(node)) {
		for (const child of node) {
			analyzeJsx(child, selection)
		}
		return
	}

	// Must be a React element at this point
	if (!isValidElement(node)) {
		return
	}

	const element = node as ReactElement<{ children?: ReactNode }>

	// Handle React Fragment and host elements (div, span, etc.) - just analyze children
	if (typeof element.type === 'symbol' || typeof element.type === 'string') {
		if (element.props.children) {
			analyzeJsx(element.props.children, selection)
		}
		return
	}

	// Handle function components
	const component = element.type as unknown

	// Check if it's a component with getSelection (createComponent, Field, HasOne, HasMany, If, Show, etc.)
	if (
		component !== null &&
		(typeof component === 'object' || typeof component === 'function') &&
		'getSelection' in component &&
		typeof (component as SelectionProvider).getSelection === 'function'
	) {
		const provider = component as SelectionProvider

		// Collector function for nested selection analysis
		const collectNested = (children: ReactNode): SelectionMeta => {
			const nestedSelection = new SelectionMetaCollector()
			analyzeJsx(children, nestedSelection)
			return nestedSelection
		}

		// Get selection info from the component
		const fieldSelection = provider.getSelection(element.props, collectNested)

		// Add to selection
		if (fieldSelection) {
			if (Array.isArray(fieldSelection)) {
				for (const field of fieldSelection) {
					selection.addField(field)
				}
			} else {
				selection.addField(fieldSelection)
			}
		}

		return
	}

	// Check if component has staticRender — like Contember OSS's Component(render, staticRender) pattern.
	// staticRender receives the same props (with collector proxies during analysis) and returns JSX to analyze.
	if (
		component !== null &&
		(typeof component === 'object' || typeof component === 'function') &&
		'staticRender' in component &&
		typeof (component as { staticRender: unknown }).staticRender === 'function'
	) {
		const staticJsx = (component as { staticRender: (props: Record<string, unknown>) => ReactNode }).staticRender(
			element.props as Record<string, unknown>,
		)
		if (staticJsx) {
			analyzeJsx(staticJsx, selection)
		}
		return
	}

	// For non-bindx components, try to analyze children
	// This handles wrapper components that pass children through
	const children = element.props.children
	if (children) {
		analyzeJsx(children, selection)
	}
}

/**
 * Collects all field selections from a JSX tree.
 * Entry point for the collection phase.
 */
export function collectSelection(jsx: ReactNode): SelectionMetaCollector {
	const selection = new SelectionMetaCollector()
	analyzeJsx(jsx, selection)
	return selection
}

/**
 * Converts JSX selection metadata to the format used by query builder
 */
export function convertToQuerySelection(jsxSelection: SelectionMeta): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const [_, field] of jsxSelection.fields) {
		if (field.path.length !== 1) {
			// Skip nested paths - they're handled by parent relations
			continue
		}

		if (field.isRelation && field.nested) {
			// Relation with nested selection
			const nestedQuery = convertToQuerySelection(field.nested)

			if (field.isArray && field.hasManyParams) {
				// HasMany with params
				result[field.fieldName] = {
					...nestedQuery,
					__params: field.hasManyParams,
				}
			} else {
				result[field.fieldName] = nestedQuery
			}
		} else {
			// Scalar field
			result[field.fieldName] = true
		}
	}

	return result
}

/**
 * Debug helper - prints selection tree
 */
export function debugSelection(selection: SelectionMeta, indent = 0): string {
	const lines: string[] = []
	const prefix = '  '.repeat(indent)

	for (const [key, field] of selection.fields) {
		let line = `${prefix}${field.fieldName}`

		if (field.isArray) {
			line += '[]'
		}
		if (field.isRelation) {
			line += ' (relation)'
		}
		if (field.hasManyParams) {
			const params = JSON.stringify(field.hasManyParams)
			line += ` ${params}`
		}

		lines.push(line)

		if (field.nested) {
			lines.push(debugSelection(field.nested, indent + 1))
		}
	}

	return lines.join('\n')
}
