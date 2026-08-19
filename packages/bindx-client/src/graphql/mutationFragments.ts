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
	return buildSelectionFromDataObjects([data])
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Unwraps a create/update operation to the data object it writes.
 */
function extractOperationData(op: unknown): Record<string, unknown> | undefined {
	if (!isRecord(op)) return undefined

	const create = op['create']
	if (isRecord(create)) return create

	const update = op['update']
	if (isRecord(update)) {
		const data = update['data']
		return isRecord(data) ? data : update
	}

	return undefined
}

/**
 * Builds one selection set covering every given data object.
 *
 * Sibling ops in a hasMany often carry different subsets of the same relation
 * (unset fields are absent from create data), so both scalars and nested
 * relations are unioned — keeping only the last shape would emit a selection
 * the other siblings' responses cannot be content-matched against.
 */
function buildSelectionFromDataObjects(
	dataObjects: readonly Record<string, unknown>[],
): GraphQlSelectionSet {
	const scalarFields = new Set<string>()
	const nestedOps = new Map<string, unknown[]>()

	const collectNested = (fieldName: string, ops: readonly unknown[]): void => {
		const collected = nestedOps.get(fieldName)
		if (collected) {
			collected.push(...ops)
		} else {
			nestedOps.set(fieldName, [...ops])
		}
	}

	for (const data of dataObjects) {
		for (const [fieldName, value] of Object.entries(data)) {
			if (value === null || value === undefined) continue

			if (Array.isArray(value)) {
				collectNested(fieldName, value)
			} else if (isRecord(value)) {
				collectNested(fieldName, [value])
			} else if (fieldName !== 'id') {
				scalarFields.add(fieldName)
			}
		}
	}

	const fields: GraphQlSelectionSet = [new GraphQlField(null, 'id')]

	for (const fieldName of scalarFields) {
		fields.push(new GraphQlField(null, fieldName))
	}

	for (const [fieldName, ops] of nestedOps) {
		const nested = buildSelectionFromOps(ops)
		if (nested) fields.push(new GraphQlField(null, fieldName, {}, nested))
	}

	return fields
}

/**
 * Merges the selections of all create/update operations written to one field.
 */
function buildSelectionFromOps(ops: readonly unknown[]): GraphQlSelectionSet | undefined {
	const dataObjects: Record<string, unknown>[] = []

	for (const op of ops) {
		const data = extractOperationData(op)
		if (data) dataObjects.push(data)
	}

	if (dataObjects.length === 0) return undefined

	return buildSelectionFromDataObjects(dataObjects)
}
