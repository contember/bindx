# Selection Compiler — Experimental Plan

Build-time extraction of `createComponent()` implicit selections, replacing the runtime
proxy-execution pass with statically emitted metadata. Experimental; lives on
`experiment/selection-compiler`.

## Goals & principles

1. **Progressive enhancement, never mandatory.** A compiled app behaves identically to an
   uncompiled one. The compiler is an optimization/robustification layer; runtime proxy
   collection remains the universal fallback. (React Compiler philosophy, not Relay's
   mandatory-codegen model.)
2. **Emit-or-bail per component.** The compiler emits a selection only when it can prove it.
   Anything unprovable → the whole component bails to runtime collection, with a machine-readable
   reason. Over-approximation (extra fields) is acceptable; under-approximation (missing fields)
   is a correctness bug and must be impossible by construction.
3. **Replace only the per-component collection pass.** Cross-component composition
   (`analyzeJsx`/`getSelection` walk, slot handling, fragment merging) stays at runtime and is
   untouched. This makes the transform **purely local** — per file, per chain; no cross-module
   analysis, no type checker.
4. **The runtime collector is the oracle.** Every fixture is validated by comparing the
   compiler's output against what runtime proxy collection produces for the same component.

## What the compiler can do that runtime collection cannot

- Union **both** branches of every conditional (runtime execution follows one branch).
- Analyze `.map()` and other callbacks without sample data (`.mock()` workaround unneeded).
- Never execute user code during analysis → the entire crash-and-degrade machinery
  (tolerant scalar mocks, partial-scope recovery) becomes irrelevant for compiled components.

## Non-goals (v1)

- Nested bindx-component composition via static fragment references (`__compose` holes) — bail
  for now; phase 2 candidate.
- `interfaces()` mode — bail.
- unplugin/webpack/Next packaging, eslint plugin, SWC/oxc port — later.
- Explicit-selector entity props — already static; nothing to compile.

## Deliverables

| # | What | Where |
|---|------|-------|
| A | Runtime support for precompiled selections + validate mode | `packages/bindx`, `packages/bindx-react` |
| B | Analyzer core + Babel plugin + equivalence harness | `packages/bindx-compiler` (new) |
| C | Integration: end-to-end wiring, playground Vite setup, bail-rate measurement | after A+B |

A and B are independent — they share only the format contract below.

## Contract: static selection format

The compiler emits, and the runtime consumes, a plain serializable object. This is the **only**
coupling between A and B:

```ts
/** Selection for one implicit entity prop. Key = field name. */
type StaticFieldMap = Record<string, StaticFieldNode>

type StaticFieldNode =
	| true                     // scalar leaf (or relation touched without nested access)
	| {
		fields: StaticFieldMap   // nested selection → this field is a relation
		many?: true              // has-many (known from <HasMany> usage or collection params)
		params?: {               // has-many params; only statically-literal values
			filter?: unknown
			orderBy?: unknown
			limit?: number
			offset?: number
			totalCount?: boolean
		}
	}

/** Emitted as the 2nd argument of .render(): key = implicit entity prop name. */
type StaticSelection = Record<string, StaticFieldMap>
```

Notes:
- Relation-ness is derived from **usage** (nested access ⇒ relation), exactly like the runtime
  collector — `entityDef` carries no schema, so neither side may depend on a registry.
- Aliases don't occur in implicit render bodies (only in explicit selectors) — not represented.

## A — Runtime support (`bindx` + `bindx-react`)

1. **Converter** `staticSelectionToMeta(map: StaticFieldMap): SelectionMeta` placed next to
   `SelectionScope` in `packages/bindx/src/selection/`. Output must be indistinguishable from
   `SelectionScope.toSelectionMeta()` for the equivalent access pattern (`fieldName`, `alias`,
   `path`, `isRelation`, `isArray`, `nested`, `hasManyParams`). SelectionScope is the reference —
   mirror its path semantics exactly; test by comparing against scope-collected output for the
   same shapes.
2. **Builder API**: `.render(fn)` gains an optional second parameter
   `staticSelection?: StaticSelection`. Compiler-facing only — documented as such. Threaded
   through `ComponentBuilderImpl` → `buildComponent`.
3. **`buildComponent`**: when `staticSelection` is present, `ensureImplicitCollected()` builds
   `selectionsMap` entries from the converter (per entity prop that appears in the static object)
   and **skips the proxy pass entirely**. Entity props absent from the static object (possible
   future partial emit) fall back to the proxy pass — v1 may simply treat presence as all-or-nothing,
   matching the compiler's emit-or-bail.
4. **Validate mode**: exported `setStaticSelectionValidation(enabled: boolean)` (module-level flag
   in bindx-react). When enabled and a static selection is present, ALSO run the proxy pass and
   deep-diff the resulting `SelectionMeta` per prop; mismatch → single `console.warn` with
   component display name and a readable diff. This is the trust-building mode (dev/CI).
5. Tests: converter equivalence, static path used (proxy pass provably not executed — e.g. render
   fn with a side-effect counter), fallback without static arg unchanged, validate mode
   both agree/disagree cases.

## B — Compiler (`packages/bindx-compiler`, new package)

Dependencies: `@babel/core`, `@babel/parser`, `@babel/traverse`, `@babel/types`. Private package
(not published) for now; wire into root tsconfig project references + workspace.

### Structure

- `src/analyze.ts` — pure core: `analyzeSource(code, filename) → ChainResult[]` where
  `ChainResult = { loc, entityProps: string[], selection: StaticSelection } | { loc, bailout: BailoutReason }`.
- `src/babelPlugin.ts` — Babel plugin: runs the analyzer, injects the `StaticSelection` object
  literal as the 2nd argument of the chain's `.render(...)` call. Bailed chains are left untouched.
- `src/index.ts` — exports both.
- `tests/fixtures/*.tsx` + harness (below).

### Chain recognition

- Track `createComponent` via import binding from `@contember/bindx-react` (accept any
  `@contember/bindx*` source). Follow the fluent chain syntactically.
- `.entity(name, def)` (2 args) → implicit entity prop `name`. `.entity(name, def, selector)`
  (3 args) → explicit; ignore (not collected via proxy today either).
- `.props()`, `.use()`, `.mock()`, `.slots()`, `.roles()` → chain metadata, no effect on analysis
  (`.mock()` values are irrelevant — the compiler never executes anything).
- `.condition(fn)` → analyze `fn` like a render body (runtime collection executes it too).
- `.interfaces(...)` → **bail** (interfaces mode).
- `.render(fn)` → analyze `fn`.

### Analysis rules

Walk the entire function body (all branches, all nested function expressions — control flow is
irrelevant because union is sound):

- **Roots**: destructured implicit entity props (`({ article })`) or member access off an
  identifier param (`p.article`). Callback params of `<HasOne>`/`<HasMany>` children become new
  roots scoped to the callback, rooted at the relation's path.
- **Local aliases**: `const a = article.author` extends the root set. `let`/reassignment of an
  entity-rooted binding → bail.
- **Member chains** on a root record the path (`article.author.name` → `author.fields.name`).
  Skip `$`-prefixed meta properties and whatever else the runtime collector proxy ignores —
  read `packages/bindx-react/src/jsx/proxy.ts` + `SelectionScope` and mirror their skip-list.
- **Recognized components** (imported from `@contember/bindx*`): `Field`/`Attribute`/`Show`
  (`field={<path>}` → leaf), `HasOne` (relation + children-callback root), `HasMany` (relation,
  `many: true`, JSX props `limit/offset/orderBy/filter/totalCount` → `params` when the values are
  **literals** — otherwise bail), `If` and other selection-neutral bindx components → recurse
  into children only.
- **Bail triggers** (component-level, with reason codes): entity-rooted value passed to an
  unrecognized function call or as a prop to an unrecognized component; spread of an entity root;
  computed member access `article[x]`; non-literal HasMany params; `interfaces()`;
  render body not an inline function literal (imported/renamed render fn); any expression form
  the analyzer cannot confidently classify (**default deny**).
- Plain JSX/host elements and unknown components: recurse into their **children** (matching
  `analyzeJsx`'s children-walk), but any entity-rooted value in their **props** other than
  children → bail (see above).

### Equivalence harness (the important part)

For each fixture:
1. Import the fixture module directly (Bun executes TSX natively) — trigger runtime collection via
   the `$propName` fragment getters, read `COMPONENT_SELECTIONS`, normalize via
   `convertToQuerySelection`-style plain form.
2. Run `analyzeSource` on the fixture source, normalize the emitted `StaticSelection` the same way.
3. Deep-equal per entity prop. Expected-bail fixtures assert the bailout reason instead.

Fixture set (minimum): scalar fields; nested has-one; has-many with literal params; both-branch
ternary (document expected superset vs runtime — see below); map over has-many children callback;
alias `const`; `.condition()` accesses; `.use()`/`.mock()`/`.props()` present but irrelevant;
each bail trigger.

**Ternary caveat**: branch-union fixtures will legitimately differ from the runtime oracle
(compiler = union, runtime = one branch). The harness must assert `runtime ⊆ compiler` for these
instead of strict equality — flag them explicitly in the fixture (e.g. exported marker).

## C — Integration (after A + B land)

1. Babel plugin emit → A's `.render(fn, static)` — end-to-end test: transformed source, verify
   proxy pass skipped and fetch identical (MockAdapter query spec comparison).
2. Playground: wire the plugin into `packages/example` Vite config via `@vitejs/plugin-react`'s
   `babel.plugins` option, behind an env flag; validate mode on.
3. Measure: compile every `createComponent` in `packages/example` + test corpus, report
   compiled-vs-bailed percentage and reasons — this decides what phase 2 tackles first.
4. Docs: short section in `docs/selection-collection.md`.

## Phase 2 — nested-component composition (holes) — IMPLEMENTED

Status: **implemented** on `experiment/selection-compiler`. Runtime resolution
(`applyCompiledSelection`, `packages/bindx-react/src/jsx/compiledSelection.ts`), compiler hole
emission (`packages/bindx-compiler`), full hole-equivalence + end-to-end tests, and the dataview
relation-column fix have all landed and are green.

Result (re-measured on `~/projects/external/npi`, packages/admin, 257 chains):
**251/257 compiled = 98 %** (phase 1 was 216/257 = 84 %). 35 chains carry 99 holes total. Only 6
bails remain: 5 `ENTITY_IN_EXPRESSION_PROP`, 1 `ENTITY_REASSIGNMENT` — the `ENTITY_ESCAPES_TO_COMPONENT`
class that dominated phase 1 is gone.

Motivation: phase 1 compiled 216/257 chains (84 %); 40 of 41 bails were `ENTITY_ESCAPES_TO_COMPONENT`.
Phase 2 turns those escapes into **holes**: statically-emitted references to the nested component,
resolved at collection time through the component's existing runtime selection surface
(`getSelection` / `staticRender`) — the Relay-fragment-spread equivalent, without executing the
host render body.

### Contract v2: compiled selection shape

The 2nd argument of `.render()` changes shape (breaking change within the experiment — update
runtime, emit, fixtures, docs together):

```ts
interface CompiledSelection {
	/** Per implicit entity prop — same StaticFieldMap as phase 1. */
	props: Record<string, StaticFieldMap>
	/** Nested components that received entity-derived values. */
	holes?: CompiledHole[]
}

interface CompiledHole {
	/** Thunk, not a direct reference — dodges TDZ for components defined later in the module
	    (same reason runtime collection is lazy). Resolved inside ensureImplicitCollected. */
	component: () => unknown
	/** Target prop name → where the value comes from: host entity prop + member path.
	    Empty path = the root itself. */
	entityProps: Record<string, { source: string; path: string[] }>
	/** Statically-literal non-entity props of the JSX element (strings, numbers, booleans,
	    literal objects/arrays). Non-literal non-entity props are simply omitted. */
	literalProps?: Record<string, unknown>
}
```

### Runtime resolution (bindx-react)

In `ensureImplicitCollected`, when a compiled selection is present:

1. Build a live `SelectionScope` per entity prop and drive it from `props[name]` (refactor of the
   phase-1 converter: keep the scope open instead of immediately snapshotting).
2. For each hole: resolve `component()`; build the value for each `entityProps` entry by creating
   the source prop's collector proxy and **replaying the member path via property gets**
   (`path.reduce((o, k) => o[k], proxy)`) — identical semantics to the proxy pass by construction
   (scalar-vs-relation deferral, `SCOPE_REF`/`FIELD_REF_META` markers all come out right).
3. Feed the assembled props to the target's selection surface, mirroring `analyzeJsx` order:
   `getSelection(props, collectNested)` if present, else `staticRender(props)` + `collectSelection`
   on its result. Missing props: `getSelection` skips absent props naturally; for `staticRender`
   wrap the props object so unknown keys fall back to the tolerant scalar mock. Errors are
   contained per hole (same report-and-continue policy as `analyzeJsx`).
4. Target has neither surface (plain React component): the hole contributes nothing — the runtime
   proxy pass is equally blind there, so compiled behavior stays exactly equivalent (this is the
   documented npi dummy-`<Field>` blind spot). In validate mode, emit a dev-only warn naming the
   component so the blind spot becomes discoverable instead of silent.
5. Finalize scopes → `SelectionMeta` → fragments, as today. The host render fn is still never
   executed.

### Compiler side

- `ENTITY_ESCAPES_TO_COMPONENT` no longer bails when the escape is a prop on a **component-typed
  JSX element with a resolvable identifier** (local or imported — the emit references the
  identifier via a thunk in the same module scope). Multiple entity props on one element form one
  hole. Children of the element keep being analyzed statically (not part of the hole).
- Still bails: entity in a non-JSX call argument (`ENTITY_ESCAPES_TO_CALL`), entity in a
  **non-literal expression prop that isn't a plain path** (e.g. `prop={fn(article)}`), spread onto
  an element, member-expression/namespace component tags (v2 keeps it simple: identifier tags only).
- Emit: object literal with thunks — no longer pure JSON; snapshot tests must cover thunk emission.
- Measure script: report per-chain hole counts; summary gains `compiled (with holes)`.

### Equivalence harness

The oracle (runtime proxy pass) DOES resolve nested `getSelection`/`staticRender` components —
so hole-carrying fixtures are directly comparable end-to-end once runtime resolution lands:
compiled (fields + resolved holes) must equal oracle. Plain-component fixtures: both sides blind →
equal by omission. Fixture set: createComponent target, `withCollector` target, plain component
target (with and without sibling dummy `<Field>`s), multiple entity props on one element,
entity-derived path (`article.author`) into a target, hole target defined later in the module (TDZ),
literal + non-literal extra props.

### Related runtime fix (in scope — npi workaround removal) — DONE

`DataGridHasOneColumn`'s `collectSelection` (bindx-dataview `createRelationColumn.tsx`) discarded
the renderer's returned JSX, so nested `<HasMany>`/`<Field>` inside relation-column renderers were
never collected (npi worked around it with a `.map()` trick). Fixed: `walkRendererJsx` now runs
`collectSelection` on the renderer's returned JSX in addition to the proxy capture, in both the
`buildLeaf` `relatedSelection` computation and the hasOne/hasMany cell configs. The JSX walk drives
the collector proxy (via `HasMany.getSelection`'s `map`), registering nested fields into the parent
scope — mirroring `collectImplicitSelections`. Errors are contained per column. Independent of the
compiler; benefits uncompiled apps too. Regression test: `tests/react/dataview/createRelationColumn.test.tsx`
("nested declarative selection (npi regression)").

### Explicit non-goal

Statically analyzing **plain React component bodies** (even same-file) to collect their
`useField`-style reads is deliberately out: compiled selection would then be *stronger* than the
runtime fallback, so an app could work compiled and under-fetch uncompiled — breaking the
progressive-enhancement equivalence guarantee. The path for that blind spot is diagnostics
(validate-mode warn now, eslint rule later), or a future runtime analyzer improvement — not a
compiler-only fix.

## Future (explicitly out of scope now)

Unplugin packaging, eslint plugin reusing the analyzer (bail reasons as lint diagnostics),
oxc/SWC port if Babel cost ever matters.
