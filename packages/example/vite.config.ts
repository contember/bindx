import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
	plugins: [react()],
	root: __dirname,
	server: {
		port: 5180,
		strictPort: true,
	},
	resolve: {
		alias: {
			'../src/index.js': path.resolve(__dirname, '../src/index.ts'),
		},
		dedupe: ['react', 'react-dom'],
	},
})
