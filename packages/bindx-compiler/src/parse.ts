/**
 * Shared Babel parse setup. Extracted so both the analyzer and the cross-file
 * contract resolver parse identically without an analyze↔contracts import cycle.
 */
import { parse } from '@babel/parser'
import type * as t from '@babel/types'

/**
 * Parser plugins a file needs, by extension: `.ts` must not enable `jsx` (it would misparse
 * `<T>value` casts), plain JS gets no `typescript`. Unknown or missing names get both.
 */
export function parserPluginsFor(filename: string | null | undefined): Array<'jsx' | 'typescript'> {
	if (filename && /\.[cm]?ts$/.test(filename)) {
		return ['typescript']
	}
	if (filename && /\.[cm]?jsx?$/.test(filename)) {
		return ['jsx']
	}
	return ['jsx', 'typescript']
}

export function parseProgram(code: string, filename?: string): t.Program {
	const file = parse(code, {
		sourceType: 'module',
		plugins: parserPluginsFor(filename),
	})
	return file.program
}
