import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { bindxUI } from '../bindx-ui/src/vite-plugin.js'
// Relative src import (like bindxUI above) so vite bundles the config and maps
// the package's `.js` specifiers to `.ts`; the workspace dep is declared for types.
import { bindxCompilerPlugin } from '../bindx-compiler/src/index.js'

// Experimental: compile implicit selections at build time. Opt-in via env so the
// runtime proxy pass stays the default. See docs/compiler-plan.md.
const compilerEnabled = process.env['BINDX_COMPILER'] === '1'

export default defineConfig({
	plugins: [
		tailwindcss(),
		react(compilerEnabled ? { babel: { plugins: [bindxCompilerPlugin] } } : undefined),
		bindxUI({ dir: './ui-overrides' }),
	],
	define: {
		__BINDX_COMPILER__: JSON.stringify(compilerEnabled),
	},
	root: __dirname,
	server: {
		port: 15180,
		strictPort: true,
	},
	resolve: {
		alias: {
			'../src/index.js': path.resolve(__dirname, '../src/index.ts'),
		},
		dedupe: ['react', 'react-dom', '@contember/bindx', '@contember/bindx-react', '@contember/bindx-dataview', '@contember/bindx-form'],
	},
})
