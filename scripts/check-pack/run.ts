// Packs every publishable package the way the publish script does (`bun pm pack`)
// and fails when a `main`/`module`/`types`/`bin`/`exports`/`imports` target is missing from the tarball.
// Run after `bun run build`.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

interface PackResult {
	readonly name: string
	readonly missing: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectExportTargets(value: unknown, targets: string[]): void {
	if (typeof value === 'string') {
		targets.push(value)
	} else if (Array.isArray(value)) {
		value.forEach(item => collectExportTargets(item, targets))
	} else if (isRecord(value)) {
		Object.values(value).forEach(item => collectExportTargets(item, targets))
	}
}

function collectTargets(manifest: Record<string, unknown>): string[] {
	const targets: string[] = []
	for (const field of ['main', 'module', 'types', 'typings']) {
		const value = manifest[field]
		if (typeof value === 'string') {
			targets.push(value)
		}
	}
	const bin = manifest['bin']
	if (typeof bin === 'string') {
		targets.push(bin)
	} else if (isRecord(bin)) {
		collectExportTargets(bin, targets)
	}
	collectExportTargets(manifest['exports'], targets)
	collectExportTargets(manifest['imports'], targets)
	return targets
}

function normalizePath(target: string): string {
	return target.replace(/^\.\//, '')
}

function escapeRegExp(value: string): string {
	return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

// A subpath pattern (`./src/*`) is satisfied when at least one packed file matches it.
function isTargetPacked(target: string, files: ReadonlySet<string>): boolean {
	const path = normalizePath(target)
	if (!path.includes('*')) {
		return files.has(path)
	}
	const pattern = new RegExp(`^${path.split('*').map(escapeRegExp).join('.+')}$`)
	return [...files].some(file => pattern.test(file))
}

function readManifest(source: string, label: string): Record<string, unknown> {
	const manifest: unknown = JSON.parse(source)
	if (!isRecord(manifest)) {
		throw new Error(`${label}: package.json is not an object`)
	}
	return manifest
}

function packPackage(packageDir: string, destination: string): PackResult {
	const output = execFileSync('bun', ['pm', 'pack', '--quiet', '--destination', destination], {
		cwd: packageDir,
		encoding: 'utf8',
	})
	const tarballName = output.trim().split('\n').pop() ?? ''
	const tarball = resolve(packageDir, destination, tarballName)
	const files = new Set(
		execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
			.split('\n')
			.filter(line => line.startsWith('package/'))
			.map(line => line.slice('package/'.length)),
	)
	const packedManifest = readManifest(
		execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
		packageDir,
	)
	const name = typeof packedManifest['name'] === 'string' ? packedManifest['name'] : packageDir
	const missing = collectTargets(packedManifest).filter(target => !isTargetPacked(target, files))
	return { name, missing }
}

function findPublishablePackages(packagesDir: string): string[] {
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter(entry => entry.isDirectory())
		.map(entry => join(packagesDir, entry.name))
		.filter(dir => {
			try {
				return readManifest(readFileSync(join(dir, 'package.json'), 'utf8'), dir)['private'] !== true
			} catch (error) {
				if (isRecord(error) && error['code'] === 'ENOENT') {
					return false
				}
				throw error
			}
		})
}

function main(): void {
	const destination = mkdtempSync(join(tmpdir(), 'bindx-check-pack-'))
	try {
		const results = findPublishablePackages(resolve('packages')).map(dir => packPackage(dir, destination))
		const failures = results.filter(result => result.missing.length > 0)
		for (const result of results) {
			console.log(`${result.missing.length > 0 ? 'FAIL' : 'ok  '} ${result.name}`)
			result.missing.forEach(target => console.log(`       missing: ${target}`))
		}
		if (failures.length > 0) {
			console.error(`\n${failures.length} package(s) reference files that are not in the tarball. Did you run \`bun run build\`?`)
			process.exitCode = 1
		}
	} finally {
		rmSync(destination, { recursive: true, force: true })
	}
}

main()
