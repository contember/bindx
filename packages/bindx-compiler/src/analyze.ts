/**
 * Pure analyzer core: `analyzeSource(code, filename) → ChainResult[]`.
 *
 * Per-chain, emit-or-bail: a chain yields a proven StaticSelection or a
 * machine-readable bailout. Over-approximation (extra fields) is acceptable;
 * under-approximation is impossible by construction (default deny on the unknown).
 */
import * as t from '@babel/types'
import { collectImportBindings, collectModuleBindings, type ImportBindings } from './imports.js'
import { findChains, type Chain } from './chain.js'
import { BodyAnalyzer } from './body.js'
import { BailError } from './resolve.js'
import { SelNode } from './selectionTree.js'
import { parseProgram } from './parse.js'
import { ContractFileCache, ContractResolver, type ContractLookup } from './contracts.js'
import type { ChainLoc, ChainResult, StaticSelection } from './types.js'

export { parseProgram }

export interface InternalChainResult {
	readonly chain: Chain
	readonly result: ChainResult
}

/** Options threading the contract resolver (cross-file discovery, non-relative aliases). */
export interface AnalyzeOptions {
	/** Absolute path of the source under analysis; enables relative cross-file contract resolution. */
	readonly filename?: string
	/** Prefix→path map for non-relative import specifiers (e.g. `{ '~': '/abs/app' }`). */
	readonly alias?: Record<string, string>
	/** Shared parsed-file cache; defaults to a module-level singleton across plugin instances. */
	readonly cache?: ContractFileCache
}

// Shared across analyzeProgram/plugin invocations, keyed internally by path+mtime.
const defaultContractCache = new ContractFileCache()

/** Analyze an already-parsed program; retains Babel node refs for the plugin. */
export function analyzeProgram(program: t.Program, options: AnalyzeOptions = {}): InternalChainResult[] {
	const bindings = collectImportBindings(program)
	const moduleBindings = collectModuleBindings(program)
	const resolver = new ContractResolver(program, {
		filename: options.filename,
		alias: options.alias ?? {},
		cache: options.cache ?? defaultContractCache,
	})
	const lookup: ContractLookup = tag => resolver.resolve(tag)
	const chains = findChains(program, bindings)
	return chains.map(chain => ({ chain, result: analyzeChain(chain, bindings, moduleBindings, lookup) }))
}

function analyzeChain(chain: Chain, bindings: ImportBindings, moduleBindings: ReadonlySet<string>, lookup: ContractLookup): ChainResult {
	const loc = chainLoc(chain.renderCall)
	if (chain.earlyBail) {
		return { loc, bailout: chain.earlyBail }
	}
	const propRoots = new Map<string, SelNode>(chain.entityProps.map(prop => [prop, new SelNode()]))
	const analyzer = new BodyAnalyzer(bindings, moduleBindings, lookup)
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

export function analyzeSource(code: string, filename: string, options: Omit<AnalyzeOptions, 'filename'> = {}): ChainResult[] {
	return analyzeProgram(parseProgram(code, filename), { ...options, filename }).map(r => r.result)
}
