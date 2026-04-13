import { GraphQlField, GraphQlFragment, GraphQlFragmentSpread, GraphQlInlineFragment } from '@contember/graphql-builder'

/**
 * Standard GraphQL fragments for Contember mutation responses.
 * These are fixed parts of the Contember Content API schema.
 */
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
	nodeSelection?: import('@contember/graphql-builder').GraphQlSelectionSet,
): import('@contember/graphql-builder').GraphQlSelectionSet {
	const items: import('@contember/graphql-builder').GraphQlSelectionSet = [
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
 * Recursively traverses the mutation data structure to find inline create
 * operations and builds a selection requesting `id` for each nested relation.
 *
 * Example: for mutation data `{ approval: { create: { rounds: [{ create: { reviews: [{ create: {...} }] } }] } } }`
 * produces selection: `{ id, approval { id, rounds { id, reviews { id } } } }`
 */
export function buildNodeSelectionFromMutationData(
	data: Record<string, unknown>,
): import('@contember/graphql-builder').GraphQlSelectionSet {
	const fields: import('@contember/graphql-builder').GraphQlSelectionSet = [
		new GraphQlField(null, 'id'),
	]

	for (const [fieldName, value] of Object.entries(data)) {
		if (value === null || value === undefined) continue

		if (Array.isArray(value)) {
			// HasMany operations: array of { create: {...}, connect: {...}, ... }
			const nestedSelection = buildSelectionFromHasManyOps(value)
			if (nestedSelection) {
				fields.push(new GraphQlField(null, fieldName, {}, nestedSelection))
			}
		} else if (typeof value === 'object') {
			// HasOne operation: { create: {...} }, { update: {...} }, { connect: {...} }
			const nestedSelection = buildSelectionFromHasOneOp(value as Record<string, unknown>)
			if (nestedSelection) {
				fields.push(new GraphQlField(null, fieldName, {}, nestedSelection))
			}
		} else {
			// Scalar field — request in node selection for content-based matching
			fields.push(new GraphQlField(null, fieldName))
		}
	}

	return fields
}

/**
 * Builds selection from a hasOne operation object.
 * Returns selection if the operation contains a create or update with nested creates.
 */
function buildSelectionFromHasOneOp(
	op: Record<string, unknown>,
): import('@contember/graphql-builder').GraphQlSelectionSet | undefined {
	if ('create' in op && typeof op['create'] === 'object' && op['create'] !== null) {
		return buildNodeSelectionFromMutationData(op['create'] as Record<string, unknown>)
	}
	if ('update' in op && typeof op['update'] === 'object' && op['update'] !== null) {
		return buildNodeSelectionFromMutationData(op['update'] as Record<string, unknown>)
	}
	return undefined
}

/**
 * Builds selection from hasMany operations array.
 * Merges selections from all create/update operations to produce a unified selection.
 */
function buildSelectionFromHasManyOps(
	ops: unknown[],
): import('@contember/graphql-builder').GraphQlSelectionSet | undefined {
	let hasNested = false

	// Collect field names from create/update operations, split by type
	const scalarFields = new Set<string>()
	const nestedFields = new Map<string, Record<string, unknown>>()

	for (const item of ops) {
		if (typeof item !== 'object' || item === null) continue
		const op = item as Record<string, unknown>

		let nestedData: Record<string, unknown> | null = null
		if ('create' in op && typeof op['create'] === 'object' && op['create'] !== null) {
			nestedData = op['create'] as Record<string, unknown>
			hasNested = true
		} else if ('update' in op && typeof op['update'] === 'object' && op['update'] !== null) {
			const update = op['update'] as Record<string, unknown>
			nestedData = ('data' in update ? update['data'] : update) as Record<string, unknown>
			hasNested = true
		}

		if (nestedData) {
			for (const [key, value] of Object.entries(nestedData)) {
				if (value === null || value === undefined) continue
				if (typeof value === 'object') {
					nestedFields.set(key, value as Record<string, unknown>)
				} else {
					scalarFields.add(key)
				}
			}
		}
	}

	if (!hasNested) return undefined

	// Build selection with id + scalar fields + nested relation fields
	const fields: import('@contember/graphql-builder').GraphQlSelectionSet = [
		new GraphQlField(null, 'id'),
	]

	for (const fieldName of scalarFields) {
		fields.push(new GraphQlField(null, fieldName))
	}

	for (const [fieldName, value] of nestedFields) {
		if (Array.isArray(value)) {
			const nestedSelection = buildSelectionFromHasManyOps(value)
			if (nestedSelection) {
				fields.push(new GraphQlField(null, fieldName, {}, nestedSelection))
			}
		} else {
			const nestedSelection = buildSelectionFromHasOneOp(value as Record<string, unknown>)
			if (nestedSelection) {
				fields.push(new GraphQlField(null, fieldName, {}, nestedSelection))
			}
		}
	}

	return fields
}
