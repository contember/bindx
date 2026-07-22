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
import { ModuleCache } from './moduleResolve.js'
import { ContractResolver, type ContractLookup } from './contracts.js'
import { TargetKindResolver, type TargetKindLookup } from './targetKind.js'
import { analyzeEntityRoot, findEntityElements, resolveEntityLikeLocals, type InternalEntityRootResult } from './entityRoots.js'
import type { ChainLoc, ChainResult, EntityRootResult, StaticSelection } from './types.js'

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
	readonly cache?: ModuleCache
	/**
	 * Component names treated as `<Entity>` for root scanning AND emission (phase 3.1). The
	 * `compiledSelection` attribute is injected on the wrapper element; it must reach the real
	 * `<Entity>` inside via the wrapper's `{...props}` spread (the opt-in requirement — no runtime
	 * change). Only affects entity-root analysis, not `createComponent` chains.
	 */
	readonly entityLike?: readonly string[]
	/**
	 * Reports the absolute path of every OTHER file consulted during this run (contract discovery,
	 * hole-target classification, re-export chases). A bundler feeds these to its watcher so a later
	 * edit to a contract/target module re-transforms the entry file and its injected literal never
	 * goes stale (a stale literal could otherwise flip into an under-fetch).
	 */
	readonly onDependency?: (absPath: string) => void
}

// Shared across analyzeProgram/plugin invocations, keyed internally by path+mtime.
const defaultModuleCache = new ModuleCache()

interface ProgramContext {
	readonly bindings: ImportBindings
	readonly moduleBindings: ReadonlySet<string>
	readonly lookup: ContractLookup
	readonly targetKinds: TargetKindLookup
}

function programContext(program: t.Program, options: AnalyzeOptions): ProgramContext {
	const resolverOptions = {
		filename: options.filename,
		alias: options.alias ?? {},
		cache: options.cache ?? defaultModuleCache,
		onDependency: options.onDependency,
	}
	const contracts = new ContractResolver(program, resolverOptions)
	const targets = new TargetKindResolver(program, resolverOptions)
	return {
		bindings: collectImportBindings(program),
		moduleBindings: collectModuleBindings(program),
		lookup: tag => contracts.resolve(tag),
		targetKinds: tag => targets.resolve(tag),
	}
}

/** Analyze an already-parsed program; retains Babel node refs for the plugin. */
export function analyzeProgram(program: t.Program, options: AnalyzeOptions = {}): InternalChainResult[] {
	const { bindings, moduleBindings, lookup, targetKinds } = programContext(program, options)
	const chains = findChains(program, bindings)
	return chains.map(chain => ({ chain, result: analyzeChain(chain, bindings, moduleBindings, lookup, targetKinds) }))
}

/** Analyze every top-level `<Entity>` (+ `entityLike`) selection root in a program (phase 3 / 3.1). */
export function analyzeEntityRootsInProgram(program: t.Program, options: AnalyzeOptions = {}): InternalEntityRootResult[] {
	const { bindings, moduleBindings, lookup, targetKinds } = programContext(program, options)
	const entityLikeLocals = resolveEntityLikeLocals(program, new Set(options.entityLike ?? []))
	return findEntityElements(program, bindings, entityLikeLocals).map(element => ({
		element,
		result: analyzeEntityRoot(element, bindings, moduleBindings, lookup, targetKinds),
	}))
}

function analyzeChain(
	chain: Chain,
	bindings: ImportBindings,
	moduleBindings: ReadonlySet<string>,
	lookup: ContractLookup,
	targetKinds: TargetKindLookup,
): ChainResult {
	const loc = chainLoc(chain.renderCall)
	if (chain.earlyBail) {
		return { loc, bailout: chain.earlyBail }
	}
	const propRoots = new Map<string, SelNode>(chain.entityProps.map(prop => [prop, new SelNode()]))
	const analyzer = new BodyAnalyzer(bindings, moduleBindings, lookup, targetKinds)
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

/** Convenience source-level entry for `<Entity>` root analysis (measure / tests). */
export function analyzeEntityRoots(code: string, filename: string, options: Omit<AnalyzeOptions, 'filename'> = {}): EntityRootResult[] {
	return analyzeEntityRootsInProgram(parseProgram(code, filename), { ...options, filename }).map(r => r.result)
}
