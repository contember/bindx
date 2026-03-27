import { createHash } from 'node:crypto'

export function hashContent(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export function stripHeader(content: string): string {
	const firstNewline = content.indexOf('\n')
	if (firstNewline === -1) {
		return content
	}
	const firstLine = content.slice(0, firstNewline)
	if (firstLine.startsWith('// Ejected from')) {
		return content.slice(firstNewline + 1)
	}
	return content
}

export function isExecError(error: unknown): error is { stdout: string; status: number } {
	return (
		typeof error === 'object'
		&& error !== null
		&& 'stdout' in error
		&& typeof (error as { stdout: unknown }).stdout === 'string'
		&& 'status' in error
		&& typeof (error as { status: unknown }).status === 'number'
	)
}
