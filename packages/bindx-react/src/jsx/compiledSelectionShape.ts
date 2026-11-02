/**
 * Runtime shape check for a compiler-emitted {@link CompiledSelection} literal.
 * A stale or corrupt literal must never be half-read into the fetch plan —
 * consumers fall back to the runtime proxy pass when this check fails.
 */
import type { CompiledSelection } from './compiledSelection.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): boolean {
	return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isValidFieldMap(value: unknown): boolean {
	return isPlainObject(value) && Object.values(value).every(isValidFieldNode)
}

function isValidFieldNode(node: unknown): boolean {
	if (node === true) {
		return true
	}
	if (!isPlainObject(node) || !isValidFieldMap(node['fields'])) {
		return false
	}
	return (node['many'] === undefined || node['many'] === true)
		&& (node['params'] === undefined || isPlainObject(node['params']))
}

function isValidThunkMap(value: unknown): boolean {
	return value === undefined
		|| (isPlainObject(value) && Object.values(value).every(thunk => typeof thunk === 'function'))
}

function isValidHole(hole: unknown, entityPropNames: readonly string[]): boolean {
	if (!isPlainObject(hole) || typeof hole['component'] !== 'function' || !isPlainObject(hole['entityProps'])) {
		return false
	}
	const hasValidOrigins = Object.values(hole['entityProps']).every(origin =>
		isPlainObject(origin)
		&& typeof origin['source'] === 'string'
		&& entityPropNames.includes(origin['source'])
		&& isStringArray(origin['path']),
	)
	return hasValidOrigins
		&& (hole['literalProps'] === undefined || isPlainObject(hole['literalProps']))
		&& isValidThunkMap(hole['extraProps'])
}

/**
 * True when `value` is a v2 literal whose field maps and holes are well-formed and
 * reference only `entityPropNames` (the host's implicit entity props; `['entity']` for <Entity>).
 */
export function isValidCompiledSelection(
	value: unknown,
	entityPropNames: readonly string[],
): value is CompiledSelection {
	if (!isPlainObject(value) || value['v'] !== 2 || !isPlainObject(value['props'])) {
		return false
	}
	const hasValidProps = Object.entries(value['props']).every(([propName, fieldMap]) =>
		entityPropNames.includes(propName) && isValidFieldMap(fieldMap),
	)
	const holes = value['holes']
	return hasValidProps
		&& (holes === undefined || (Array.isArray(holes) && holes.every(hole => isValidHole(hole, entityPropNames))))
}
