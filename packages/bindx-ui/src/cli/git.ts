import { execFileSync } from 'node:child_process'
import { relative } from 'node:path'

export function getGitRef(): string {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim()
	} catch {
		throw new Error('Failed to get current git ref. Are you in a git repository?')
	}
}

export function getGitPath(absolutePath: string): string {
	try {
		const result = execFileSync('git', ['ls-files', '--full-name', absolutePath], { encoding: 'utf-8' }).trim()
		if (result.length === 0) {
			const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim()
			return relative(gitRoot, absolutePath).replaceAll('\\', '/')
		}
		return result
	} catch {
		throw new Error(`Failed to resolve git path for: ${absolutePath}`)
	}
}

export function getOriginalSource(gitRef: string, gitPath: string): string {
	try {
		return execFileSync('git', ['show', `${gitRef}:${gitPath}`], { encoding: 'utf-8' })
	} catch {
		throw new Error(`Failed to retrieve source at ${gitRef}:${gitPath}. The ref or path may no longer exist.`)
	}
}
