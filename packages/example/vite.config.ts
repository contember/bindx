import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
	plugins: [tailwindcss(), react()],
	root: __dirname,
	server: {
		port: 15180,
		strictPort: true,
	},
	resolve: {
		alias: {
			'../src/index.js': path.resolve(__dirname, '../src/index.ts'),
		},
		dedupe: ['react', 'react-dom'],
	},
})
