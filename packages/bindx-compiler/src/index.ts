export {
	analyzeSource,
	analyzeProgram,
	analyzeEntityRoots,
	analyzeEntityRootsInProgram,
	parseProgram,
	type AnalyzeOptions,
	type InternalChainResult,
} from './analyze.js'
export { ENTITY_ROOT_KEY, type InternalEntityRootResult } from './entityRoots.js'
export { bindxCompilerPlugin, default, type BindxCompilerOptions } from './babelPlugin.js'
export {
	ContractFileCache,
	ContractResolver,
	type CallbackContract,
	type CollectorContract,
	type ContractLookup,
} from './contracts.js'
export { ModuleCache } from './moduleResolve.js'
export { TargetKindResolver, type TargetKind, type TargetKindLookup } from './targetKind.js'
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
	EntityRootResult,
	AnalyzedEntityRoot,
	BailedEntityRoot,
	BailoutReason,
	Bailout,
	ChainLoc,
} from './types.js'
export { isBailed, isEntityRootBailed } from './types.js'
