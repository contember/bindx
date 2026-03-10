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
	const raw = stripAnsi(exec(`agent-browser eval '${code.replace(/'/g, "'\\''")}'`))
	// agent-browser eval returns JSON-serialized values — strip surrounding quotes for strings
	if (raw.startsWith('"') && raw.endsWith('"')) {
		return raw.slice(1, -1)
	}
	return raw
}

/**
 * Build a `[data-testid="..."]` selector.
 * Use to compose selectors: `${tid('parent')} ${tid('child')}`
 */
export function tid(testId: string): string {
	return `[data-testid="${testId}"]`
}

/**
 * Resolve a selector string.
 * Strings containing `[` are treated as raw CSS selectors (e.g. from `tid()`).
 * Everything else is treated as a data-testid value.
 */
function resolveSelector(selectorOrTestId: string): string {
	if (selectorOrTestId.includes('[')) {
		return selectorOrTestId
	}
	return `[data-testid="${selectorOrTestId}"]`
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

/**
 * Query helpers — accept a data-testid string or any CSS selector.
 *
 * Simple:   query.text('article-title')
 * Nested:   query.attr(`${tid('parent')} ${tid('child')}`, 'data-direction')
 * Raw CSS:  query.text('table tr:first-child td')
 */
export const query = {
	/** Get text content */
	text(selector: string): string {
		const sel = resolveSelector(selector)
		return evalJs(`document.querySelector('${sel}')?.textContent?.trim() ?? ''`)
	},

	/** Check if element exists */
	exists(selector: string): boolean {
		const sel = resolveSelector(selector)
		return evalJs(`document.querySelector('${sel}') !== null`) === 'true'
	},

	/** Check if element is disabled */
	isDisabled(selector: string): boolean {
		const sel = resolveSelector(selector)
		return evalJs(`document.querySelector('${sel}')?.disabled === true`) === 'true'
	},

	/** Get input/select value */
	value(selector: string): string {
		const sel = resolveSelector(selector)
		return evalJs(`document.querySelector('${sel}')?.value ?? ''`)
	},

	/** Get an attribute value */
	attr(selector: string, attr: string): string {
		const sel = resolveSelector(selector)
		return evalJs(`document.querySelector('${sel}')?.getAttribute('${attr}') ?? ''`)
	},

	/** Count matching elements (or children if childSelector provided) */
	count(selector: string, childSelector?: string): number {
		const sel = resolveSelector(selector)
		const query = childSelector
			? `document.querySelector('${sel}')?.querySelectorAll(':scope > ${childSelector}').length ?? 0`
			: `document.querySelectorAll('${sel}').length`
		const result = evalJs(query)
		return parseInt(result, 10) || 0
	},
}

/**
 * Interaction helpers — accept a data-testid string or any CSS selector.
 */
export const action = {
	/** Click an element */
	click(selector: string): void {
		const sel = resolveSelector(selector)
		evalJs(`document.querySelector('${sel}')?.click()`)
		exec('agent-browser wait 300')
	},

	/** Fill an input field (clears existing value) */
	fill(selector: string, value: string): void {
		const sel = resolveSelector(selector)
		const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
		evalJs(`(() => {
			const el = document.querySelector('${sel}');
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
	select(selector: string, optionText: string): void {
		const sel = resolveSelector(selector)
		const escaped = optionText.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
		evalJs(`(() => {
			const sel = document.querySelector('${sel}');
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
