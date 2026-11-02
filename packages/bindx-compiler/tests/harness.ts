/**
 * Equivalence harness: the runtime proxy collector is the oracle. For each fixture
 * we (a) trigger real collection and normalize via convertToQuerySelection, and
 * (b) run analyzeSource and normalize identically, then compare per entity prop.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPONENT_SELECTIONS, convertToQuerySelection, type SelectionMeta } from '@contember/bindx-react'
import { analyzeSource, isBailed, type ChainResult } from '../src/index.js'
import { selectionToPlain } from '../src/selectionTree.js'

export function analyzeFixture(dir: string, file: string): ChainResult[] {
	const path = join(dir, 'fixtures', file)
	// Pass the real path so relative cross-file contract specifiers resolve on disk.
	return analyzeSource(readFileSync(path, 'utf8'), path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isSelectionMeta(value: unknown): value is SelectionMeta {
	return isRecord(value) && value['fields'] instanceof Map
}

/** Reads the `$prop` fragment getter, which runs a component's static collection. */
export function triggerCollection(component: object, prop: string): void {
	Reflect.get(component, `$${prop}`)
}

/** The selection a component collected for `prop` (after {@link triggerCollection}). */
export function collectedSelection(component: unknown, prop: string): SelectionMeta | undefined {
	if (typeof component !== 'function' && !isRecord(component)) {
		return undefined
	}
	triggerCollection(component, prop)
	const selections: unknown = Reflect.get(component, COMPONENT_SELECTIONS)
	const entry: unknown = selections instanceof Map ? selections.get(prop) : undefined
	const selection = isRecord(entry) ? entry['selection'] : undefined
	return isSelectionMeta(selection) ? selection : undefined
}

/** Runtime oracle: trigger `$prop` collection, normalize to the plain field tree. */
export function runtimePlain(component: unknown, prop: string): Record<string, unknown> {
	const selection = collectedSelection(component, prop)
	if (!selection) {
		return {}
	}
	return stripParams(convertToQuerySelection(selection))
}

/** Compiler side: normalize the emitted StaticSelection to the same plain field tree. */
export function compilerPlain(result: ChainResult, prop: string): Record<string, unknown> {
	if (isBailed(result)) {
		return {}
	}
	const forProp = selectionToPlain(result.selection)[prop]
	return isRecord(forProp) ? forProp : {}
}

/** Drop `__params` (never present in the implicit path, but defensive). */
function stripParams(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (key === '__params') {
			continue
		}
		out[key] = isRecord(value) ? stripParams(value) : value
	}
	return out
}

/** Deep subset: is every key/leaf of `sub` present in `sup` (runtime ⊆ compiler)? */
export function isSubset(sub: Record<string, unknown>, sup: Record<string, unknown>): boolean {
	for (const [key, value] of Object.entries(sub)) {
		if (!(key in sup)) {
			return false
		}
		const other = sup[key]
		if (value === true) {
			if (other !== true && !isRecord(other)) {
				return false
			}
		} else if (isRecord(value)) {
			if (!isRecord(other) || !isSubset(value, other)) {
				return false
			}
		}
	}
	return true
}
