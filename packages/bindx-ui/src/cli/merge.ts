import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isExecError } from './utils.js'

export interface MergeResult {
	status: 'clean' | 'conflict' | 'error'
	content: string
	conflictCount: number
	errorMessage?: string
}

export function threeWayMerge(local: string, base: string, upstream: string): MergeResult {
	const tempDir = mkdtempSync(join(tmpdir(), 'bindx-merge-'))
	const localFile = join(tempDir, 'local')
	const baseFile = join(tempDir, 'base')
	const upstreamFile = join(tempDir, 'upstream')

	try {
		writeFileSync(localFile, local, 'utf-8')
		writeFileSync(baseFile, base, 'utf-8')
		writeFileSync(upstreamFile, upstream, 'utf-8')

		const result = execFileSync('diff3', ['-m', localFile, baseFile, upstreamFile], {
			encoding: 'utf-8',
		})

		return { status: 'clean', content: result, conflictCount: 0 }
	} catch (error: unknown) {
		if (isExecError(error) && error.status === 1) {
			const conflictCount = countConflictMarkers(error.stdout)
			return { status: 'conflict', content: error.stdout, conflictCount }
		}

		if (isMissingBinaryError(error)) {
			return {
				status: 'error',
				content: '',
				conflictCount: 0,
				errorMessage:
					'`diff3` binary not found on PATH. Install GNU diffutils '
					+ '(macOS: `brew install diffutils`, Debian/Ubuntu: `apt install diffutils`, '
					+ 'Alpine: `apk add diffutils`) or use `--agent` for AI-assisted merge.',
			}
		}

		return {
			status: 'error',
			content: '',
			conflictCount: 0,
			errorMessage: error instanceof Error ? error.message : String(error),
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

function isMissingBinaryError(error: unknown): boolean {
	return (
		typeof error === 'object'
		&& error !== null
		&& 'code' in error
		&& (error as { code: unknown }).code === 'ENOENT'
	)
}

function countConflictMarkers(content: string): number {
	const matches = content.match(/^<<<<<<<\s/gm)
	return matches?.length ?? 0
}
