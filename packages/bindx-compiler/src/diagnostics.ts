/**
 * Single decision point for all compiler console output. Per file it emits per-mode lines and
 * ALWAYS warns on INTERNAL_ERROR (crash containment, see babelPlugin.ts) — one code path so a
 * contained crash never double-prints (no BAIL info line on top of its warn in verbose mode).
 */
import { relative } from 'node:path'
import type { BailoutReason } from './types.js'

export type DiagnosticsMode = 'off' | 'summary' | 'verbose'

/** Outcome of one analyzed unit (createComponent chain or `<Entity>` root) for reporting. */
export interface DiagnosticEntry {
	readonly compiled: boolean
	readonly line: number
	/** Present iff bailed. INTERNAL_ERROR always warns regardless of mode. */
	readonly code?: BailoutReason
	/** Human-readable context surfaced with an INTERNAL_ERROR warn. */
	readonly message?: string
}

export interface DiagnosticTotals {
	readonly compiled: number
	readonly bailed: number
}

const TAG = '[bindx-compiler]'

function rel(filename: string | undefined): string {
	return filename ? relative(process.cwd(), filename) : '<unknown>'
}

/**
 * Emit console output for one file's outcomes and return its totals. INTERNAL_ERROR entries always
 * warn (file + loc); other bails print only under 'verbose' (per bail) or 'summary' (one file line
 * when the file has any bail). Files with zero bails stay silent in 'summary'.
 */
export function reportFile(filename: string | undefined, entries: readonly DiagnosticEntry[], mode: DiagnosticsMode): DiagnosticTotals {
	const file = rel(filename)
	let compiled = 0
	let bailed = 0
	for (const entry of entries) {
		if (entry.compiled) {
			compiled++
			continue
		}
		bailed++
		if (entry.code === 'INTERNAL_ERROR') {
			// Always surfaced: an internal crash was contained; this unit degrades to the runtime proxy pass.
			console.warn(`${TAG} ${file}:${entry.line} INTERNAL_ERROR ${entry.message ?? ''}`.trimEnd())
		} else if (mode === 'verbose') {
			console.info(`${TAG} ${file}:${entry.line} BAIL ${entry.code}`)
		}
	}
	if (mode === 'verbose' && compiled + bailed > 0) {
		console.info(`${TAG} ${file}: ${compiled} compiled, ${bailed} bailed`)
	} else if (mode === 'summary' && bailed > 0) {
		const codes = entries.filter(e => !e.compiled && e.code !== undefined).map(e => e.code).join(', ')
		console.info(`${TAG} ${file}: ${compiled} compiled, ${bailed} bailed (${codes})`)
	}
	return { compiled, bailed }
}

/** Grand-total line for a bundler layer accumulating across files (Vite `buildEnd`). */
export function reportTotals(totals: DiagnosticTotals): void {
	console.info(`${TAG} total: ${totals.compiled} compiled, ${totals.bailed} bailed`)
}
