/**
 * Bail-rate measurement: run the analyzer over every .tsx file under a directory
 * and report how many createComponent chains compile vs bail, and why. The result
 * decides what phase 2 tackles first.
 *
 * Usage: bun run measure [dir]   (default: packages/example)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { analyzeSource, isBailed, type BailoutReason } from '../src/index.js'

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function findTsxFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIRS.has(entry)) {
			continue
		}
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			out.push(...findTsxFiles(full))
		} else if (entry.endsWith('.tsx')) {
			out.push(full)
		}
	}
	return out
}

function main(): void {
	const target = process.argv[2] ?? 'packages/example'
	const root = process.cwd()
	const files = findTsxFiles(target).sort()

	let totalChains = 0
	let compiled = 0
	const byReason = new Map<BailoutReason, number>()

	for (const file of files) {
		const code = readFileSync(file, 'utf8')
		let results
		try {
			results = analyzeSource(code, file)
		} catch (error) {
			console.log(`${relative(root, file)}  PARSE ERROR: ${String(error)}`)
			continue
		}
		if (results.length === 0) {
			continue
		}
		console.log(relative(root, file))
		for (const result of results) {
			totalChains++
			if (isBailed(result)) {
				byReason.set(result.bailout.code, (byReason.get(result.bailout.code) ?? 0) + 1)
				console.log(`  L${result.loc.line}  BAIL  ${result.bailout.code}  — ${result.bailout.message}`)
			} else {
				compiled++
				console.log(`  L${result.loc.line}  OK    [${result.entityProps.join(', ')}]`)
			}
		}
	}

	const bailed = totalChains - compiled
	const pct = (n: number): string => (totalChains === 0 ? '0' : ((n / totalChains) * 100).toFixed(0))

	console.log('\n=== Summary ===')
	console.log(`files scanned:   ${files.length}`)
	console.log(`total chains:    ${totalChains}`)
	console.log(`compiled:        ${compiled} (${pct(compiled)}%)`)
	console.log(`bailed:          ${bailed} (${pct(bailed)}%)`)
	if (byReason.size > 0) {
		console.log('bailed by reason:')
		for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${reason.padEnd(28)} ${count}`)
		}
	}
}

main()
