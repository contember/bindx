import { execSync } from 'node:child_process'

const TIMEOUT = 25_000

function exec(cmd: string): string {
	try {
		return execSync(cmd, { encoding: 'utf-8', timeout: TIMEOUT, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
	} catch (e: unknown) {
		const err = e as { stdout?: string; stderr?: string; message?: string }
		const output = err.stdout?.trim() ?? err.stderr?.trim() ?? err.message ?? 'unknown error'
		throw new Error(`agent-browser command failed: ${cmd}\n${output}`)
	}
}

function stripAnsi(str: string): string {
	return str.replace(/\x1B\[[0-9;]*m/g, '')
}

function evalJs(code: string): string {
	return stripAnsi(exec(`agent-browser eval '${code.replace(/'/g, "'\\''")}'`))
}

/** Open a URL and wait for it to be ready */
export function open(url: string): void {
	exec(`agent-browser open ${url}`)
	exec('agent-browser wait --load networkidle')
	exec('agent-browser wait 500')
}

/** Close the browser session */
export function close(): void {
	try {
		exec('agent-browser close')
	} catch {
		// ignore close errors
	}
}

/** Wait for a given number of milliseconds */
export function wait(ms: number): void {
	exec(`agent-browser wait ${ms}`)
}

/** Query helpers scoped to data-testid */
export const query = {
	/** Get text content of element by data-testid */
	text(testId: string): string {
		return evalJs(`document.querySelector('[data-testid="${testId}"]')?.textContent?.trim() ?? ''`)
	},

	/** Check if element exists */
	exists(testId: string): boolean {
		return evalJs(`document.querySelector('[data-testid="${testId}"]') !== null`) === 'true'
	},

	/** Check if element is disabled */
	isDisabled(testId: string): boolean {
		return evalJs(`document.querySelector('[data-testid="${testId}"]')?.disabled === true`) === 'true'
	},

	/** Get input/select value */
	value(testId: string): string {
		return evalJs(`document.querySelector('[data-testid="${testId}"]')?.value ?? ''`)
	},

	/** Get an attribute value */
	attr(testId: string, attr: string): string {
		return evalJs(`document.querySelector('[data-testid="${testId}"]')?.getAttribute('${attr}') ?? ''`)
	},

	/** Count child elements matching optional selector */
	count(testId: string, childSelector = '*'): number {
		const result = evalJs(`document.querySelector('[data-testid="${testId}"]')?.querySelectorAll(':scope > ${childSelector}').length ?? 0`)
		return parseInt(result, 10) || 0
	},
}

/** Interaction helpers scoped to data-testid */
export const action = {
	/** Click an element */
	click(testId: string): void {
		evalJs(`document.querySelector('[data-testid="${testId}"]')?.click()`)
		exec('agent-browser wait 300')
	},

	/** Fill an input field (clears existing value) */
	fill(testId: string, value: string): void {
		const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
		evalJs(`(() => {
			const el = document.querySelector('[data-testid="${testId}"]');
			if (!el) return;
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
				|| Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
			setter?.call(el, '${escaped}');
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		})()`)
		exec('agent-browser wait 300')
	},

	/** Select an option in a dropdown by visible text (partial match) */
	select(testId: string, optionText: string): void {
		const escaped = optionText.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
		evalJs(`(() => {
			const sel = document.querySelector('[data-testid="${testId}"]');
			if (!sel) return;
			const opt = Array.from(sel.options).find(o => o.textContent.includes('${escaped}'));
			if (!opt) return;
			sel.value = opt.value;
			sel.dispatchEvent(new Event('change', { bubbles: true }));
		})()`)
		exec('agent-browser wait 300')
	},
}

/** Take a screenshot (useful for debugging failed tests) */
export function screenshot(path?: string): string {
	const target = path ?? `/tmp/browser-test-${Date.now()}.png`
	exec(`agent-browser screenshot ${target}`)
	return target
}
