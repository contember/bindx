export { analyzeSource, analyzeProgram, parseProgram, type InternalChainResult } from './analyze.js'
export { bindxCompilerPlugin, default } from './babelPlugin.js'
export { selectionToAst } from './emit.js'
export { fieldMapToPlain, selectionToPlain } from './selectionTree.js'
export type {
	StaticSelection,
	StaticFieldMap,
	StaticFieldNode,
	StaticHasManyParams,
	AnalyzedHole,
	HoleEntityProp,
	ChainResult,
	AnalyzedChain,
	BailedChain,
	BailoutReason,
	Bailout,
	ChainLoc,
} from './types.js'
export { isBailed } from './types.js'
