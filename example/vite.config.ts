import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
	plugins: [react()],
	root: __dirname,
	resolve: {
		alias: {
			'../src/index.js': path.resolve(__dirname, '../src/index.ts'),
		},
	},
})
