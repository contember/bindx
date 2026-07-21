/**
 * Pure analyzer core: `analyzeSource(code, filename) → ChainResult[]`.
 *
 * Per-chain, emit-or-bail: a chain yields a proven StaticSelection or a
 * machine-readable bailout. Over-approximation (extra fields) is acceptable;
 * under-approximation is impossible by construction (default deny on the unknown).
 */
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { collectImportBindings, collectModuleBindings, type ImportBindings } from './imports.js'
import { findChains, type Chain } from './chain.js'
import { BodyAnalyzer } from './body.js'
import { BailError } from './resolve.js'
import { SelNode } from './selectionTree.js'
import type { ChainLoc, ChainResult, StaticSelection } from './types.js'

export interface InternalChainResult {
	readonly chain: Chain
	readonly result: ChainResult
}

export function parseProgram(code: string, _filename: string): t.Program {
	const file = parse(code, {
		sourceType: 'module',
		plugins: ['jsx', 'typescript'],
	})
	return file.program
}

/** Analyze an already-parsed program; retains Babel node refs for the plugin. */
export function analyzeProgram(program: t.Program): InternalChainResult[] {
	const bindings = collectImportBindings(program)
	const moduleBindings = collectModuleBindings(program)
	const chains = findChains(program, bindings)
	return chains.map(chain => ({ chain, result: analyzeChain(chain, bindings, moduleBindings) }))
}

function analyzeChain(chain: Chain, bindings: ImportBindings, moduleBindings: ReadonlySet<string>): ChainResult {
	const loc = chainLoc(chain.renderCall)
	if (chain.earlyBail) {
		return { loc, bailout: chain.earlyBail }
	}
	const propRoots = new Map<string, SelNode>(chain.entityProps.map(prop => [prop, new SelNode()]))
	const analyzer = new BodyAnalyzer(bindings, moduleBindings)
	try {
		if (chain.conditionFn) {
			analyzer.analyzeFunction(chain.conditionFn, propRoots)
		}
		if (chain.renderFn) {
			analyzer.analyzeFunction(chain.renderFn, propRoots)
		}
	} catch (error) {
		if (error instanceof BailError) {
			return { loc, bailout: error.bailout }
		}
		throw error
	}

	const selection: StaticSelection = {}
	for (const [prop, node] of propRoots) {
		if (node.hasFields()) {
			selection[prop] = node.toFieldMap()
		}
	}
	return { loc, entityProps: chain.entityProps, selection, holes: analyzer.holes }
}

function chainLoc(call: t.CallExpression): ChainLoc {
	return {
		start: call.start ?? 0,
		end: call.end ?? 0,
		line: call.loc?.start.line ?? 0,
		column: call.loc?.start.column ?? 0,
	}
}

export function analyzeSource(code: string, filename: string): ChainResult[] {
	return analyzeProgram(parseProgram(code, filename)).map(r => r.result)
}
