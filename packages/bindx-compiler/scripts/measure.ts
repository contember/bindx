/**
 * Bail-rate measurement: run the analyzer over every .tsx file under a directory
 * and report how many createComponent chains compile vs bail, and why. The result
 * decides what phase 2 tackles first.
 *
 * Usage: bun run measure [dir]   (default: packages/example)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { analyzeEntityRoots, analyzeSource, isBailed, isEntityRootBailed, type BailoutReason } from '../src/index.js'

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

/** Walk up from the script to the workspace root (package.json with `workspaces`). */
function findRepoRoot(): string {
	let dir = import.meta.dir
	for (;;) {
		const pkg = join(dir, 'package.json')
		if (existsSync(pkg)) {
			try {
				const json: unknown = JSON.parse(readFileSync(pkg, 'utf8'))
				if (json && typeof json === 'object' && 'workspaces' in json) {
					return dir
				}
			} catch {
				// ignore unparsable package.json and keep walking up
			}
		}
		const parent = dirname(dir)
		if (parent === dir) {
			return process.cwd() // no workspace root found — fall back to cwd
		}
		dir = parent
	}
}

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

/** Parse CLI flags: positional dir + `--entity-like=Name1,Name2` (phase 3.1). */
function parseArgs(argv: readonly string[]): { dir: string | undefined; entityLike: string[] } {
	let dir: string | undefined
	const entityLike: string[] = []
	for (const arg of argv) {
		if (arg.startsWith('--entity-like=')) {
			entityLike.push(...arg.slice('--entity-like='.length).split(',').map(s => s.trim()).filter(Boolean))
		} else if (!arg.startsWith('--') && dir === undefined) {
			dir = arg
		}
	}
	return { dir, entityLike }
}

function main(): void {
	const root = findRepoRoot()
	const { dir: dirArg, entityLike } = parseArgs(process.argv.slice(2))
	const arg = dirArg ?? 'packages/example'
	// Explicit relative paths resolve against the repo root, not the (variable) cwd.
	const target = isAbsolute(arg) ? arg : join(root, arg)
	if (!existsSync(target)) {
		console.error(`measure: target not found: ${target}`)
		process.exit(1)
	}
	const files = findTsxFiles(target).sort()

	let totalChains = 0
	let compiled = 0
	let compiledWithHoles = 0
	let totalHoles = 0
	const byReason = new Map<BailoutReason, number>()

	let totalRoots = 0
	let rootsCompiled = 0
	let rootsWithHoles = 0
	let rootHoles = 0
	const rootByReason = new Map<BailoutReason, number>()

	for (const file of files) {
		const code = readFileSync(file, 'utf8')
		let results
		let roots
		try {
			results = analyzeSource(code, file)
			roots = analyzeEntityRoots(code, file, { entityLike })
		} catch (error) {
			console.log(`${relative(root, file)}  PARSE ERROR: ${String(error)}`)
			continue
		}
		if (results.length === 0 && roots.length === 0) {
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
				const holes = result.holes.length
				if (holes > 0) {
					compiledWithHoles++
					totalHoles += holes
				}
				const suffix = holes > 0 ? ` (${holes} hole${holes === 1 ? '' : 's'})` : ''
				console.log(`  L${result.loc.line}  OK    [${result.entityProps.join(', ')}]${suffix}`)
			}
		}
		for (const result of roots) {
			totalRoots++
			if (isEntityRootBailed(result)) {
				rootByReason.set(result.bailout.code, (rootByReason.get(result.bailout.code) ?? 0) + 1)
				console.log(`  ENTITY L${result.loc.line}  BAIL  ${result.bailout.code}  — ${result.bailout.message}`)
			} else {
				rootsCompiled++
				const holes = result.holes.length
				if (holes > 0) {
					rootsWithHoles++
					rootHoles += holes
				}
				console.log(`  ENTITY L${result.loc.line}  OK (${holes} hole${holes === 1 ? '' : 's'})`)
			}
		}
	}

	const bailed = totalChains - compiled
	const pct = (n: number, total: number): string => (total === 0 ? '0' : ((n / total) * 100).toFixed(0))

	console.log('\n=== Summary ===')
	console.log(`files scanned:       ${files.length}`)
	console.log(`total chains:        ${totalChains}`)
	console.log(`compiled:            ${compiled} (${pct(compiled, totalChains)}%)`)
	console.log(`  with holes:        ${compiledWithHoles}`)
	console.log(`  total holes:       ${totalHoles}`)
	console.log(`bailed:              ${bailed} (${pct(bailed, totalChains)}%)`)
	if (byReason.size > 0) {
		console.log('bailed by reason:')
		for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${reason.padEnd(28)} ${count}`)
		}
	}

	const rootsBailed = totalRoots - rootsCompiled
	console.log(`\nentity roots:        ${rootsCompiled} compiled / ${rootsBailed} bailed (of ${totalRoots})`)
	console.log(`  with holes:        ${rootsWithHoles}`)
	console.log(`  total holes:       ${rootHoles}`)
	if (rootByReason.size > 0) {
		console.log('entity roots bailed by reason:')
		for (const [reason, count] of [...rootByReason.entries()].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${reason.padEnd(28)} ${count}`)
		}
	}
}

main()
