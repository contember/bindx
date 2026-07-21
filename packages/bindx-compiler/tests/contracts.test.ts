/**
 * Phase-2.2 collector contracts: a contract component forms NO hole; its callback is
 * analyzed like a <HasMany>/<HasOne> child. Every host chain is validated against the
 * runtime proxy collector (the oracle) for STRICT field-tree equality — including the
 * footer-editor shape (item callback capturing a host-root field) that defeated holes.
 */
import { describe, expect, test } from 'bun:test'
import { isBailed, type AnalyzedChain } from '../src/index.js'
import { analyzeFixture, compilerPlain, runtimePlain } from './harness.js'
import * as fixture from './fixtures/contracts.js'

const DIR = import.meta.dir
const results = analyzeFixture(DIR, 'contracts.tsx')

// Fixture host exports in source order (all use the `article` implicit prop).
const EXPORTS = ['SameFile', 'CrossFile', 'HostCapture', 'EntityOf', 'DroppedFnProp', 'MissingCallback', 'Unparseable'] as const
const oracle = fixture as unknown as Record<string, unknown>

function chainAt(index: number): AnalyzedChain {
	const result = results[index]!
	if (isBailed(result)) {
		throw new Error(`chain #${index} unexpectedly bailed: ${result.bailout.code}`)
	}
	return result
}

describe('collector contracts — discovery + no hole', () => {
	test('every host chain is recognized (one per export)', () => {
		expect(results.length).toBe(EXPORTS.length)
	})

	test('#0 same-file contract target forms no hole; tags collected as a relation', () => {
		const result = chainAt(0)
		expect(result.holes).toEqual([])
		expect(compilerPlain(result, 'article')).toMatchObject({ tags: { name: true } })
	})

	test('#1 cross-file contract target (imported sibling) forms no hole', () => {
		const result = chainAt(1)
		expect(result.holes).toEqual([])
		expect(compilerPlain(result, 'article')).toMatchObject({ tags: { name: true } })
	})

	test('#2 footer-editor shape: host-root capture lands at the article root', () => {
		const plain = compilerPlain(chainAt(2), 'article')
		expect(plain).toMatchObject({ tags: { name: true }, title: true })
	})

	test('#3 entityOf collects the has-one relation', () => {
		expect(compilerPlain(chainAt(3), 'article')).toMatchObject({ author: { name: true } })
	})

	test('#4 non-contract function prop is dropped with no bail and no hole', () => {
		const result = chainAt(4)
		expect(result.holes).toEqual([])
		expect(compilerPlain(result, 'article')).toMatchObject({ tags: { name: true } })
	})

	test('#5 missing callback records the relation only', () => {
		const plain = compilerPlain(chainAt(5), 'article')
		expect(Object.keys(plain)).toEqual(['tags'])
	})

	test('#6 unparseable contract (spread) falls back to hole rules → FUNCTION_PROP_ON_HOLE bail', () => {
		const result = results[6]!
		expect(isBailed(result)).toBe(true)
		if (isBailed(result)) {
			expect(result.bailout.code).toBe('FUNCTION_PROP_ON_HOLE')
		}
	})
})

describe('collector contracts — oracle equivalence (strict)', () => {
	EXPORTS.forEach((name, index) => {
		const result = results[index]!
		if (isBailed(result)) {
			return // bailed chains fall back to runtime collection → trivially equivalent
		}
		test(`${name} — compiled field tree equals the runtime oracle`, () => {
			const compiled = compilerPlain(result, 'article')
			const reference = runtimePlain(oracle[name], 'article')
			expect(compiled).toEqual(reference)
		})
	})
})
