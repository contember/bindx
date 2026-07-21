/**
 * Static selection format — the ONLY coupling between the compiler (deliverable B)
 * and the runtime consumer (deliverable A). Mirror of docs/compiler-plan.md.
 */

/** Has-many parameters; only statically-literal values are emitted. */
export interface StaticHasManyParams {
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
	totalCount?: boolean
}

/** A single field: scalar leaf (`true`) or a relation with nested selection. */
export type StaticFieldNode =
	| true
	| {
		fields: StaticFieldMap
		many?: true
		params?: StaticHasManyParams
	}

/** Selection for one implicit entity prop. Key = field name. */
export type StaticFieldMap = Record<string, StaticFieldNode>

/** Per implicit entity prop → its static field map. Emitted as `CompiledSelection.props`. */
export type StaticSelection = Record<string, StaticFieldMap>

/** Where a hole's target prop value comes from: host entity prop + member path (empty = root). */
export interface HoleEntityProp {
	readonly source: string
	readonly path: readonly string[]
}

/**
 * A nested component that received entity-derived values (phase 2). The compiler emits
 * a reference to it as a thunk (`component: () => Identifier`) so the runtime resolves
 * its selection surface lazily — no host render body execution, TDZ-safe.
 */
export interface AnalyzedHole {
	/** Identifier name of the component tag; emitted as an arrow thunk referencing it. */
	readonly component: string
	/** Target prop name → source entity prop + member path. Merged per JSX element. */
	readonly entityProps: Record<string, HoleEntityProp>
	/** Statically-literal non-entity props of the element; non-literal ones are omitted. */
	readonly literalProps?: Record<string, unknown>
}

/**
 * Machine-readable bail codes. A component bails as a whole when any trigger fires;
 * the caller falls back to runtime proxy collection (always sound).
 */
export type BailoutReason =
	| 'INTERFACES_MODE'
	| 'EXPLICIT_RENDER_FN'
	| 'DYNAMIC_ENTITY_NAME'
	| 'ENTITY_ESCAPES_TO_CALL'
	| 'ENTITY_ESCAPES_TO_COMPONENT'
	| 'ENTITY_IN_EXPRESSION_PROP'
	| 'FUNCTION_PROP_ON_HOLE'
	| 'MEMBER_COMPONENT_TAG'
	| 'ENTITY_SPREAD'
	| 'COMPUTED_MEMBER'
	| 'NON_LITERAL_HASMANY_PARAM'
	| 'ENTITY_REASSIGNMENT'
	| 'UNCLASSIFIED'

/** A bail with human-readable context. */
export interface Bailout {
	readonly code: BailoutReason
	readonly message: string
}

/** Source location of the recognized chain (the `createComponent(...)` call). */
export interface ChainLoc {
	readonly start: number
	readonly end: number
	readonly line: number
	readonly column: number
}

/** A chain the compiler proved: its implicit props, static selection, and nested-component holes. */
export interface AnalyzedChain {
	readonly loc: ChainLoc
	readonly entityProps: readonly string[]
	readonly selection: StaticSelection
	readonly holes: readonly AnalyzedHole[]
}

/** A chain the compiler could not prove; must fall back to runtime collection. */
export interface BailedChain {
	readonly loc: ChainLoc
	readonly bailout: Bailout
}

export type ChainResult = AnalyzedChain | BailedChain

export function isBailed(result: ChainResult): result is BailedChain {
	return 'bailout' in result
}
