import { describe, expect, test } from 'bun:test'
import { isBailed } from '../src/index.js'
import type { FixtureCase } from './fixtureTypes.js'
import { analyzeFixture, compilerPlain, isSubset, runtimePlain } from './harness.js'

import * as scalars from './fixtures/scalars.js'
import * as nestedHasOne from './fixtures/nestedHasOne.js'
import * as hasManyParams from './fixtures/hasManyParams.js'
import * as ternary from './fixtures/ternary.js'
import * as mapHasMany from './fixtures/mapHasMany.js'
import * as constAlias from './fixtures/constAlias.js'
import * as condition from './fixtures/condition.js'
import * as condProps from './fixtures/condProps.js'
import * as jsxProps from './fixtures/jsxProps.js'
import * as irrelevantChain from './fixtures/irrelevantChain.js'
import * as bails from './fixtures/bails.js'

interface FixtureModule {
	readonly cases: FixtureCase[]
}

const FIXTURES: ReadonlyArray<readonly [string, FixtureModule]> = [
	['scalars.tsx', scalars],
	['nestedHasOne.tsx', nestedHasOne],
	['hasManyParams.tsx', hasManyParams],
	['ternary.tsx', ternary],
	['mapHasMany.tsx', mapHasMany],
	['constAlias.tsx', constAlias],
	['condition.tsx', condition],
	['condProps.tsx', condProps],
	['jsxProps.tsx', jsxProps],
	['irrelevantChain.tsx', irrelevantChain],
	['bails.tsx', bails],
]

const DIR = import.meta.dir

describe('equivalence: compiler vs runtime oracle', () => {
	for (const [file, mod] of FIXTURES) {
		describe(file, () => {
			const results = analyzeFixture(DIR, file)

			test('chain count matches cases', () => {
				expect(results.length).toBe(mod.cases.length)
			})

			mod.cases.forEach((testCase, index) => {
				if (testCase.expect === 'bail') {
					test(`chain #${index} bails with ${testCase.code}`, () => {
						const result = results[index]!
						expect(isBailed(result)).toBe(true)
						if (isBailed(result)) {
							expect(result.bailout.code).toBe(testCase.code)
						}
					})
					return
				}

				test(`chain #${index} (${testCase.prop}) ${testCase.expect ?? 'equal'}`, () => {
					const result = results[index]!
					expect(isBailed(result)).toBe(false)
					const compiler = compilerPlain(result, testCase.prop)
					const runtime = runtimePlain(testCase.component, testCase.prop)
					if (testCase.expect === 'superset') {
						expect(isSubset(runtime, compiler)).toBe(true)
					} else {
						expect(compiler).toEqual(runtime)
					}
				})
			})
		})
	}
})
