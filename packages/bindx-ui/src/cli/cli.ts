#!/usr/bin/env node

import { resolve } from 'node:path'
import { eject } from './eject.js'
import { restore } from './restore.js'
import { status } from './status.js'
import { diff } from './diff.js'
import { backport, backportAll, syncMetadata } from './backport.js'

const args = process.argv.slice(2)
const command = args[0]
const targetDir = resolve(process.cwd(), process.env['BINDX_UI_DIR'] ?? './src/ui')

function printHelp(): void {
	console.log(`
Usage: bindx-ui <command> [options]

Commands:
  eject <component-path>    Eject a component for local customization
  eject <folder>/*          Eject all components in a folder
  restore <component-path>  Restore a component to package default
  status                    Show status of ejected components
  diff <component-path>     Show diff between local and package version
  diff upstream <path>      Show diff between base and current upstream
  diff local <path>         Show diff between base and local file
  backport <path>           Backport upstream changes to ejected component
  backport --all            Backport all ejected components
  backport --sync <path>    Sync metadata after agent-assisted merge

Options:
  --agent                   Generate AI agent prompt instead of merging
  --dry-run                 Show what would happen without making changes
  --all                     Apply to all ejected components

Examples:
  bindx-ui eject form/text-input
  bindx-ui eject form/*
  bindx-ui restore form/text-input
  bindx-ui status
  bindx-ui diff form/text-input
  bindx-ui diff upstream form/text-input
  bindx-ui diff local form/text-input
  bindx-ui backport form/text-input
  bindx-ui backport --all
  bindx-ui backport --agent form/text-input
  bindx-ui backport --sync form/text-input

Environment:
  BINDX_UI_DIR  Override target directory (default: ./src/ui)
`)
}

function hasFlag(flag: string): boolean {
	return args.includes(flag)
}

function getNonFlagArgs(): string[] {
	return args.slice(1).filter(a => !a.startsWith('--'))
}

switch (command) {
	case 'eject': {
		const componentPath = args[1]
		if (!componentPath) {
			console.error('Missing component path. Usage: bindx-ui eject <component-path>')
			process.exit(1)
		}
		eject(componentPath, targetDir)
		break
	}
	case 'restore': {
		const componentPath = args[1]
		if (!componentPath) {
			console.error('Missing component path. Usage: bindx-ui restore <component-path>')
			process.exit(1)
		}
		restore(componentPath, targetDir)
		break
	}
	case 'status':
		status(targetDir)
		break
	case 'diff': {
		const nonFlags = getNonFlagArgs()
		const firstArg = nonFlags[0]

		if (firstArg === 'upstream' || firstArg === 'local') {
			const componentPath = nonFlags[1]
			if (!componentPath) {
				console.error(`Missing component path. Usage: bindx-ui diff ${firstArg} <component-path>`)
				process.exit(1)
			}
			diff(componentPath, targetDir, firstArg)
		} else {
			if (!firstArg) {
				console.error('Missing component path. Usage: bindx-ui diff <component-path>')
				process.exit(1)
			}
			diff(firstArg, targetDir)
		}
		break
	}
	case 'backport': {
		const isSync = hasFlag('--sync')
		const isAll = hasFlag('--all')
		const isAgent = hasFlag('--agent')
		const isDryRun = hasFlag('--dry-run')
		const nonFlags = getNonFlagArgs()
		const componentPath = nonFlags[0]

		if (isSync) {
			if (!componentPath) {
				console.error('Missing component path. Usage: bindx-ui backport --sync <component-path>')
				process.exit(1)
			}
			syncMetadata(componentPath, targetDir)
		} else if (isAll) {
			backportAll(targetDir, { agent: isAgent, dryRun: isDryRun })
		} else {
			if (!componentPath) {
				console.error('Missing component path. Usage: bindx-ui backport <component-path>')
				process.exit(1)
			}
			backport(componentPath, targetDir, { agent: isAgent, dryRun: isDryRun })
		}
		break
	}
	default:
		printHelp()
		if (command && command !== '--help' && command !== '-h') {
			process.exit(1)
		}
}
