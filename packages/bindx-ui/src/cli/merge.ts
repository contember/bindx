import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export interface MergeResult {
	status: 'clean' | 'conflict' | 'error'
	content: string
	conflictCount: number
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

		const result = execSync(`diff3 -m "${localFile}" "${baseFile}" "${upstreamFile}"`, {
			encoding: 'utf-8',
		})

		return { status: 'clean', content: result, conflictCount: 0 }
	} catch (error: unknown) {
		if (isExecError(error) && error.status === 1) {
			const conflictCount = countConflictMarkers(error.stdout)
			return { status: 'conflict', content: error.stdout, conflictCount }
		}

		return { status: 'error', content: '', conflictCount: 0 }
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

function isExecError(error: unknown): error is { stdout: string; status: number } {
	return (
		typeof error === 'object'
		&& error !== null
		&& 'stdout' in error
		&& typeof (error as { stdout: unknown }).stdout === 'string'
		&& 'status' in error
		&& typeof (error as { status: unknown }).status === 'number'
	)
}

function countConflictMarkers(content: string): number {
	const matches = content.match(/^<<<<<<<\s/gm)
	return matches?.length ?? 0
}
