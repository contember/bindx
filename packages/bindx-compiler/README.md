# @contember/bindx-compiler

Build-time selection compiler for `@contember/bindx`. It analyzes `createComponent().….render()` chains and `<Entity>` children and injects the selection they read as a literal, so the runtime no longer runs the collector proxy pass for them.

It is opt-in and emit-or-bail: anything it cannot prove is left untouched, and the runtime collects that part as before. The runtime also falls back to the proxy pass when a compiled literal is malformed or contradicts the schema.

## Installation

```bash
npm install -D @contember/bindx-compiler
```

`@contember/bindx-react` must be the same version.

## Vite

```ts
import { fileURLToPath } from 'node:url'
import { bindxCompiler } from '@contember/bindx-compiler'
import react from '@vitejs/plugin-react'

export default {
	plugins: [
		bindxCompiler({
			// Non-relative import prefixes, so cross-module targets and contracts resolve.
			alias: { '~': fileURLToPath(new URL('.', import.meta.url)) },
			// Components that forward their children to <Entity> (treated as roots).
			entityLike: ['MyEntityWrapper'],
			// 'off' | 'summary' | 'verbose': per-file bail reasons and a build total.
			diagnostics: 'summary',
		}),
		react(),
	],
}
```

The plugin runs before `react()` (`enforce: 'pre'`) and re-transforms a file when a module it read during analysis changes. `bindxCompilerPlugin` is the same pass as a plain Babel plugin.

## Runtime controls (`@contember/bindx-react`)

- `setCompiledSelectionsEnabled(false)` ignores every compiled literal, without a rebuild.
- `setStaticSelectionValidation(true)` also runs the runtime walk and warns (`static selection under-fetches for …`) when it asks for more than the compiled selection. Use it in development or a test run, not in production: it does both passes.

## Measuring

`bun run scripts/measure.ts <dir> [--entity-like=Name,…]` (from a checkout) reports how many chains and roots compile, and why the rest bail.

On a large production app, 614 chains and roots compiled and 23 bailed. Its browser end-to-end suite gave the same results with and without the compiler, and validate mode reported no under-fetch. The production build took about 60 % longer (20 s → 32 s). Page load times showed no measurable difference.

Design and soundness rules: [`docs/compiler-plan.md`](../../docs/compiler-plan.md), [`docs/selection-collection.md`](../../docs/selection-collection.md).
