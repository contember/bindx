import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { bindxUI } from '../bindx-ui/src/vite-plugin.js'

export default defineConfig({
	plugins: [tailwindcss(), react(), bindxUI({ dir: './ui-overrides' })],
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
