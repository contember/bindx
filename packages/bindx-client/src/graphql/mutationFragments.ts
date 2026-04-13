import {
	GraphQlField,
	GraphQlFragment,
	GraphQlFragmentSpread,
	GraphQlInlineFragment,
	type GraphQlSelectionSet,
} from '@contember/graphql-builder'

export const mutationFragments: Record<string, GraphQlFragment> = {
	MutationError: new GraphQlFragment('MutationError', '_MutationError', [
		new GraphQlField(null, 'paths', {}, [
			new GraphQlInlineFragment('_FieldPathFragment', [
				new GraphQlField(null, 'field'),
			]),
			new GraphQlInlineFragment('_IndexPathFragment', [
				new GraphQlField(null, 'index'),
				new GraphQlField(null, 'alias'),
			]),
		]),
		new GraphQlField(null, 'message'),
		new GraphQlField(null, 'type'),
	]),
	ValidationResult: new GraphQlFragment('ValidationResult', '_ValidationResult', [
		new GraphQlField(null, 'valid'),
		new GraphQlField(null, 'errors', {}, [
			new GraphQlField(null, 'path', {}, [
				new GraphQlInlineFragment('_FieldPathFragment', [
					new GraphQlField(null, 'field'),
				]),
				new GraphQlInlineFragment('_IndexPathFragment', [
					new GraphQlField(null, 'index'),
					new GraphQlField(null, 'alias'),
				]),
			]),
			new GraphQlField(null, 'message', {}, [
				new GraphQlField(null, 'text'),
			]),
		]),
	]),
}

/**
 * Builds the standard mutation result selection set.
 * Includes ok, errorMessage, errors, validation, and optionally a node selection.
 */
export function buildMutationSelection(
	operation: 'create' | 'update' | 'upsert' | 'delete',
	nodeSelection?: GraphQlSelectionSet,
): GraphQlSelectionSet {
	const items: GraphQlSelectionSet = [
		new GraphQlField(null, 'ok'),
		new GraphQlField(null, 'errorMessage'),
		new GraphQlField(null, 'errors', {}, [
			new GraphQlFragmentSpread('MutationError'),
		]),
	]
	if (operation !== 'delete') {
		items.push(
			new GraphQlField(null, 'validation', {}, [
				new GraphQlFragmentSpread('ValidationResult'),
			]),
		)
	}
	if (nodeSelection) {
		items.push(new GraphQlField(null, 'node', {}, nodeSelection))
	}
	return items
}

/**
 * Builds a GraphQL node selection set from mutation data.
 * Recursively traverses create/update operations to request `id` and scalar
 * fields at each nesting level. Scalar fields are needed for content-based
 * matching of nested entity IDs after persist.
 */
export function buildNodeSelectionFromMutationData(
	data: Record<string, unknown>,
): GraphQlSelectionSet {
	const fields: GraphQlSelectionSet = [new GraphQlField(null, 'id')]

	for (const [fieldName, value] of Object.entries(data)) {
		if (value === null || value === undefined) continue

		if (Array.isArray(value)) {
			const nested = buildSelectionFromOps(value)
			if (nested) fields.push(new GraphQlField(null, fieldName, {}, nested))
		} else if (typeof value === 'object') {
			const nested = buildSelectionFromCreateOrUpdate(value as Record<string, unknown>)
			if (nested) fields.push(new GraphQlField(null, fieldName, {}, nested))
		} else {
			fields.push(new GraphQlField(null, fieldName))
		}
	}

	return fields
}

/**
 * Extracts the inner data from a create or update operation and recurses.
 */
function buildSelectionFromCreateOrUpdate(
	op: Record<string, unknown>,
): GraphQlSelectionSet | undefined {
	if ('create' in op && typeof op['create'] === 'object' && op['create'] !== null) {
		return buildNodeSelectionFromMutationData(op['create'] as Record<string, unknown>)
	}
	if ('update' in op && typeof op['update'] === 'object' && op['update'] !== null) {
		const update = op['update'] as Record<string, unknown>
		const data = ('data' in update ? update['data'] : update) as Record<string, unknown>
		return buildNodeSelectionFromMutationData(data)
	}
	return undefined
}

/**
 * Merges selections from all create/update operations in a hasMany array.
 * Collects the union of scalar + relation fields across all operations.
 */
function buildSelectionFromOps(ops: unknown[]): GraphQlSelectionSet | undefined {
	const scalarFields = new Set<string>()
	const nestedFields = new Map<string, Record<string, unknown>>()
	let hasOps = false

	for (const item of ops) {
		if (typeof item !== 'object' || item === null) continue
		const op = item as Record<string, unknown>

		const innerData =
			('create' in op && typeof op['create'] === 'object' && op['create'] !== null)
				? op['create'] as Record<string, unknown>
				: ('update' in op && typeof op['update'] === 'object' && op['update'] !== null)
					? (() => { const u = op['update'] as Record<string, unknown>; return ('data' in u ? u['data'] : u) as Record<string, unknown> })()
					: null

		if (!innerData) continue
		hasOps = true

		for (const [key, value] of Object.entries(innerData)) {
			if (value === null || value === undefined) continue
			if (typeof value === 'object') {
				nestedFields.set(key, value as Record<string, unknown>)
			} else {
				scalarFields.add(key)
			}
		}
	}

	if (!hasOps) return undefined

	const fields: GraphQlSelectionSet = [new GraphQlField(null, 'id')]

	for (const fieldName of scalarFields) {
		fields.push(new GraphQlField(null, fieldName))
	}

	for (const [fieldName, value] of nestedFields) {
		if (Array.isArray(value)) {
			const nested = buildSelectionFromOps(value)
			if (nested) fields.push(new GraphQlField(null, fieldName, {}, nested))
		} else {
			const nested = buildSelectionFromCreateOrUpdate(value as Record<string, unknown>)
			if (nested) fields.push(new GraphQlField(null, fieldName, {}, nested))
		}
	}

	return fields
}
