/**
 * Shared Babel parse setup. Extracted so both the analyzer and the cross-file
 * contract resolver parse identically without an analyze↔contracts import cycle.
 */
import { parse } from '@babel/parser'
import * as t from '@babel/types'

export function parseProgram(code: string, _filename?: string): t.Program {
	const file = parse(code, {
		sourceType: 'module',
		plugins: ['jsx', 'typescript'],
	})
	return file.program
}
