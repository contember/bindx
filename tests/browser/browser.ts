import { execSync } from 'node:child_process'
import { describe, beforeAll, afterAll } from 'bun:test'
import crypto from 'node:crypto'

const EXEC_TIMEOUT = 30_000
const POLL_INTERVAL = 200
const POLL_TIMEOUT = 10_000
const PLAYGROUND_URL = process.env['PLAYGROUND_URL'] ?? 'http://localhost:15180'


let currentSession: string | null = null

function exec(cmd: string): string {
	const sessionFlag = currentSession ? `--session ${currentSession} ` : ''
	const fullCmd = cmd.replace(/^agent-browser /, `agent-browser ${sessionFlag}`)
	try {
		const raw = execSync(fullCmd, { encoding: 'utf-8', timeout: EXEC_TIMEOUT, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
		return raw.replace(/\x1B\[[0-9;]*m/g, '')
	} catch (e: unknown) {
		const err = e as { stdout?: string; stderr?: string; message?: string }
		const output = err.stdout?.trim() ?? err.stderr?.trim() ?? err.message ?? 'unknown error'
		throw new Error(`agent-browser command failed: ${fullCmd}\n${output}`)
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

/**
 * Poll a condition until it returns true or timeout.
 * Use instead of fixed sleep — stable on both fast local and slow CI.
 */
export function waitFor(
	condition: () => boolean,
	{ timeout = POLL_TIMEOUT, interval = POLL_INTERVAL, message }: { timeout?: number; interval?: number; message?: string } = {},
): void {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		try {
			if (condition()) return
		} catch {
			// condition threw — treat as not yet ready
		}
		Bun.sleepSync(interval)
	}
	// One final check — let it throw naturally if still false
	if (!condition()) {
		const elapsed = Date.now() - start
		const hint = message ?? condition.toString().slice(0, 120)
		throw new Error(`waitFor timed out after ${elapsed}ms: ${hint}`)
	}
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
			exec(`agent-browser scrollintoview ${quoted}`)
			exec(`agent-browser click ${quoted}`)
			Bun.sleepSync(500)
		},
		fill(value: string): void {
			exec(`agent-browser scrollintoview ${quoted}`)
			exec(`agent-browser fill ${quoted} ${q(value)}`)
			Bun.sleepSync(500)
		},
		select(optionText: string): void {
			exec(`agent-browser scrollintoview ${quoted}`)
			exec(`agent-browser select ${quoted} ${q(optionText)}`)
			Bun.sleepSync(500)
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
	Bun.sleepSync(ms)
}

export function browserTest(name: string, fn: () => void, hash?: string): void {
	describe(name, () => {
		beforeAll(() => {
			currentSession = `test-${crypto.randomUUID().slice(0, 8)}`
			const url = hash ? `${PLAYGROUND_URL}#${hash}` : PLAYGROUND_URL
			exec(`agent-browser open ${url}`)
			waitFor(() => {
				try {
					return exec('agent-browser get title').length > 0
				} catch {
					return false
				}
			}, { timeout: 15_000 })
		}, 30_000)
		afterAll(() => {
			try {
				exec('agent-browser close')
			} catch {
				// ignore close errors
			}
			currentSession = null
		}, 15_000)
		fn()
	})
}

export function evalJs(js: string): string {
	return exec(`agent-browser eval ${q(js)}`)
}

export function screenshot(path?: string): string {
	const target = path ?? `/tmp/browser-test-${Date.now()}.png`
	exec(`agent-browser screenshot ${target}`)
	return target
}
