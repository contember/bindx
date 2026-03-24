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
