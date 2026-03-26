#!/usr/bin/env node

import { resolve } from 'node:path'
import { eject } from './eject.js'
import { restore } from './restore.js'
import { status } from './status.js'
import { diff } from './diff.js'

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

Examples:
  bindx-ui eject form/text-input
  bindx-ui eject form/*
  bindx-ui restore form/text-input
  bindx-ui status
  bindx-ui diff form/text-input

Environment:
  BINDX_UI_DIR  Override target directory (default: ./src/ui)
`)
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
		const componentPath = args[1]
		if (!componentPath) {
			console.error('Missing component path. Usage: bindx-ui diff <component-path>')
			process.exit(1)
		}
		diff(componentPath, targetDir)
		break
	}
	default:
		printHelp()
		if (command && command !== '--help' && command !== '-h') {
			process.exit(1)
		}
}
