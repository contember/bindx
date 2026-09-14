import type { BailoutReason } from '../src/index.js'

/** A chain the harness compares field-tree-equal (or superset) against the oracle. */
export interface EqualCase {
	readonly component: unknown
	readonly prop: string
	/** 'equal' = strict field-tree equality; 'superset' = runtime ⊆ compiler (branch union). */
	readonly expect?: 'equal' | 'superset'
}

/** A chain the harness expects the compiler to bail on. */
export interface BailCase {
	readonly expect: 'bail'
	readonly code: BailoutReason
}

export type FixtureCase = EqualCase | BailCase
