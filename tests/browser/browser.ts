import { execSync } from 'node:child_process'
import { describe, beforeAll, afterAll } from 'bun:test'

const TIMEOUT = 25_000
const PLAYGROUND_URL = process.env['PLAYGROUND_URL'] ?? 'http://localhost:15180'

function exec(cmd: string): string {
	try {
		const raw = execSync(cmd, { encoding: 'utf-8', timeout: TIMEOUT, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
		return raw.replace(/\x1B\[[0-9;]*m/g, '')
	} catch (e: unknown) {
		const err = e as { stdout?: string; stderr?: string; message?: string }
		const output = err.stdout?.trim() ?? err.stderr?.trim() ?? err.message ?? 'unknown error'
		throw new Error(`agent-browser command failed: ${cmd}\n${output}`)
	}
}

function q(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`
}

function resolveSelector(selectorOrTestId: string): string {
	if (selectorOrTestId.includes('[')) {
		return selectorOrTestId
	}
	return `[data-testid="${selectorOrTestId}"]`
}

export interface ElementHandle {
	readonly exists: boolean
	readonly text: string
	readonly value: string
	readonly isDisabled: boolean
	attr(name: string): string
	count(): number
	click(): void
	fill(value: string): void
	select(optionText: string): void
}

export function el(selector: string): ElementHandle {
	const sel = resolveSelector(selector)
	const quoted = q(sel)
	return {
		get exists(): boolean {
			return parseInt(exec(`agent-browser get count ${quoted}`), 10) > 0
		},
		get text(): string {
			return exec(`agent-browser get text ${quoted}`)
		},
		get value(): string {
			return exec(`agent-browser get value ${quoted}`)
		},
		get isDisabled(): boolean {
			return exec(`agent-browser is enabled ${quoted}`) !== 'true'
		},
		attr(name: string): string {
			return exec(`agent-browser get attr ${name} ${quoted}`)
		},
		count(): number {
			return parseInt(exec(`agent-browser get count ${quoted}`), 10) || 0
		},
		click(): void {
			exec(`agent-browser click ${quoted}`)
			exec('agent-browser wait 300')
		},
		fill(value: string): void {
			exec(`agent-browser fill ${quoted} ${q(value)}`)
			exec('agent-browser wait 300')
		},
		select(optionText: string): void {
			exec(`agent-browser select ${quoted} ${q(optionText)}`)
			exec('agent-browser wait 300')
		},
	}
}

/**
 * Build a `[data-testid="..."]` selector for compound selectors.
 * Usage: `el(\`\${tid('parent')} button\`)`
 */
export function tid(testId: string): string {
	return `[data-testid="${testId}"]`
}

export function wait(ms: number): void {
	exec(`agent-browser wait ${ms}`)
}

export function browserTest(name: string, fn: () => void): void {
	describe(name, () => {
		beforeAll(() => {
			exec(`agent-browser open ${PLAYGROUND_URL}`)
			exec('agent-browser wait --load networkidle')
			exec('agent-browser wait 500')
		})
		afterAll(() => {
			try {
				exec('agent-browser close')
			} catch {
				// ignore close errors
			}
		})
		fn()
	})
}

export function screenshot(path?: string): string {
	const target = path ?? `/tmp/browser-test-${Date.now()}.png`
	exec(`agent-browser screenshot ${target}`)
	return target
}
