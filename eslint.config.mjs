import reactHooks from 'eslint-plugin-react-hooks'
import tsParser from '@typescript-eslint/parser'

// Deliberately narrow: only the React hooks rules. The repo has no lint culture
// yet, so a broad style ruleset would bury the signal. See PR that added this.
export default [
	{
		ignores: [
			'**/dist/**',
			'**/node_modules/**',
			'**/generated/**',
			'**/*.d.ts',
		],
	},
	{
		files: ['packages/*/src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: {
			'react-hooks': reactHooks,
		},
		rules: {
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
		},
	},
]
