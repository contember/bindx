export {
	analyzeSource,
	analyzeProgram,
	analyzeEntityRoots,
	analyzeEntityRootsInProgram,
	type AnalyzeOptions,
} from './analyze.js'
export { bindxCompilerPlugin, default, type BindxCompilerOptions } from './babelPlugin.js'
export {
	bindxCompiler,
	type BindxCompilerViteOptions,
	type BindxCompilerVitePlugin,
	type BindxTransformContext,
	type BindxTransformResult,
} from './vitePlugin.js'
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
