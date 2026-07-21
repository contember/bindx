/**
 * Equivalence harness: the runtime proxy collector is the oracle. For each fixture
 * we (a) trigger real collection and normalize via convertToQuerySelection, and
 * (b) run analyzeSource and normalize identically, then compare per entity prop.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPONENT_SELECTIONS, convertToQuerySelection, type SelectionMeta } from '@contember/bindx-react'
import { analyzeSource, isBailed, selectionToPlain, type ChainResult } from '../src/index.js'

export function analyzeFixture(dir: string, file: string): ChainResult[] {
	const path = join(dir, 'fixtures', file)
	// Pass the real path so relative cross-file contract specifiers resolve on disk.
	return analyzeSource(readFileSync(path, 'utf8'), path)
}

/** Runtime oracle: trigger `$prop` collection, normalize to the plain field tree. */
export function runtimePlain(component: unknown, prop: string): Record<string, unknown> {
	// Fragment access triggers static collection (same idiom as createComponentUse.test.tsx).
	void (component as Record<string, unknown>)[`$${prop}`]
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	const selection = selections?.get(prop)?.selection
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
	const plain = selectionToPlain(result.selection)
	const forProp = plain[prop]
	return (forProp && typeof forProp === 'object') ? forProp as Record<string, unknown> : {}
}

/** Drop `__params` (never present in the implicit path, but defensive). */
function stripParams(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (key === '__params') {
			continue
		}
		out[key] = value && typeof value === 'object' ? stripParams(value as Record<string, unknown>) : value
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
			if (other !== true && !(other && typeof other === 'object')) {
				return false
			}
		} else if (value && typeof value === 'object') {
			if (!other || typeof other !== 'object') {
				return false
			}
			if (!isSubset(value as Record<string, unknown>, other as Record<string, unknown>)) {
				return false
			}
		}
	}
	return true
}
