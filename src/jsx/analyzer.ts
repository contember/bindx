import type { ReactNode, ReactElement } from 'react'
import { Children, isValidElement } from 'react'
import type { JsxSelectionMeta, JsxSelectionFieldMeta, SelectionProvider } from './types.js'
import { BINDX_COMPONENT, FIELD_REF_META } from './types.js'
import { SelectionMetaCollector, mergeSelections, createEmptySelection } from './SelectionMeta.js'
import { isEntityFragmentComponent, ENTITY_FRAGMENT_PROPS } from './createEntityFragment.js'

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

	// Handle React Fragment
	if (typeof element.type === 'symbol') {
		// Fragment - analyze children
		const children = element.props.children
		if (children) {
			analyzeJsx(children, selection)
		}
		return
	}

	// Handle host elements (div, span, etc.)
	if (typeof element.type === 'string') {
		const children = element.props.children
		if (children) {
			analyzeJsx(children, selection)
		}
		return
	}

	// Handle function components
	const component = element.type as unknown

	// Check if it's an EntityFragmentComponent - needs special handling
	if (isEntityFragmentComponent(component)) {
		handleEntityFragmentComponent(component, element.props as Record<string, unknown>, selection)
		return
	}

	// Check if it's a bindx component with getSelection
	// Note: memo() returns an object, not a function, so we check for both
	if (
		(typeof component === 'function' || typeof component === 'object') &&
		component !== null &&
		'getSelection' in component &&
		typeof (component as SelectionProvider).getSelection === 'function'
	) {
		const provider = component as SelectionProvider

		// Collector function for nested selection analysis
		const collectNested = (children: ReactNode): JsxSelectionMeta => {
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
export function convertToQuerySelection(jsxSelection: JsxSelectionMeta): Record<string, unknown> {
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
 * Handles EntityFragmentComponent in JSX analysis.
 * Merges the fragment's pre-computed selection into the parent selection,
 * adjusted to the correct path context based on the entity prop.
 */
function handleEntityFragmentComponent(
	component: { [ENTITY_FRAGMENT_PROPS]: Map<string, { selection: JsxSelectionMeta }> },
	props: Record<string, unknown>,
	parentSelection: SelectionMetaCollector,
): void {
	const entityPropsMap = component[ENTITY_FRAGMENT_PROPS]

	// For each entity prop in the fragment component
	for (const [propName, meta] of entityPropsMap) {
		const propValue = props[propName]

		if (!propValue || typeof propValue !== 'object') {
			continue
		}

		// Case 1: Prop is a FieldRef from a relation (e.g., article.fields.author)
		// This has FIELD_REF_META with a path to adjust
		if (FIELD_REF_META in propValue) {
			const refMeta = (propValue as { [FIELD_REF_META]: { path: string[]; fieldName: string } })[FIELD_REF_META]

			// For each field in the fragment's selection, add it with the correct path context
			for (const [_key, field] of meta.selection.fields) {
				// Only process root-level fields from the fragment
				if (field.path.length === 1) {
					// Create a new field meta with the path adjusted to the parent context
					const adjustedField: JsxSelectionFieldMeta = {
						...field,
						path: [...refMeta.path, ...field.path],
					}

					// If the field has nested selection, we need to preserve it
					if (field.nested) {
						adjustedField.nested = field.nested
					}

					parentSelection.addField(adjustedField)
				}
			}
		}
		// Case 2: Prop is an EntityRef from Entity children callback (root level)
		// This doesn't have FIELD_REF_META, just merge the fields directly
		else if ('id' in propValue && 'fields' in propValue) {
			// This is an EntityRef - merge fragment's selection directly
			for (const [_key, field] of meta.selection.fields) {
				if (field.path.length === 1) {
					parentSelection.addField({ ...field })
				}
			}
		}
	}
}

/**
 * Debug helper - prints selection tree
 */
export function debugSelection(selection: JsxSelectionMeta, indent = 0): string {
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
