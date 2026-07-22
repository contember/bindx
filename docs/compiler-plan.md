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

Result (re-measured on the reference app, 257 chains):
**242/257 compiled = 94 %** (phase 1 was 216/257 = 84 %). 26 chains carry 82 holes total. 15 bails
remain: 9 `FUNCTION_PROP_ON_HOLE`, 5 `ENTITY_IN_EXPRESSION_PROP`, 1 `ENTITY_REASSIGNMENT` — the
`ENTITY_ESCAPES_TO_COMPONENT` class that dominated phase 1 is gone.

> **Soundness correction (was 98 %).** An earlier measurement read 251/257 = 98 % but was
> **unsound**: a hole element's function props / render-prop children were dropped from the emitted
> hole (they are non-literal), yet a hole target's `staticRender` may *invoke* such a closure during
> collection with a collector proxy — the reference app's `SelectField` does exactly
> `<HasOne field={props.field}>{e => props.children(e)}</HasOne>`. The runtime oracle therefore
> collected fields from the closure body (e.g. `it => <Field field={it.name}/>` → `author.name`) that
> the compiled path could not → **compiled ⊂ runtime → under-fetch → `UnfetchedFieldError`** in
> compiled apps. Emit-or-bail requires under-approximation to be impossible by construction, so these
> chains now **bail** (`FUNCTION_PROP_ON_HOLE`). The 4-point rate drop is the honest cost of closing
> the under-fetch class; see the phase-2.1 recovery note below.

### FUNCTION_PROP_ON_HOLE — dropping a closure from a hole must be provably safe

A function-valued prop (or function children) on a **hole** element is safe to omit from the hole
**iff invoking it at collection time cannot reach a selection scope**. The only gateways are (a) the
closure's OWN parameters — a `staticRender` may invoke it with a collector proxy, and *any* param use
(including passing a param onward to another call) lets the proxy in — and (b) captured entity-rooted
bindings (roots / aliases). So the compiler classifies each dropped inline closure:

- Body references **no own parameters** (transitively — nested inner functions' params are *their*
  own; what matters is whether OUR params or entity roots are reachable) and **no entity roots** →
  **SAFE**: omit it, keep the chain compiled. Covers `onClick={() => save()}`, `format={() => null}`.
- Otherwise → **BAIL** `FUNCTION_PROP_ON_HOLE`. Default deny: when unsure, bail.

Scope: only **inline** arrow / function-expression prop values and render-prop children of hole
elements. Closures that capture roots in a non-hole expression prop already bail as
`ENTITY_IN_EXPRESSION_PROP` (left as is); the new code specifically covers the *param-mediated*
danger. Function **children of non-hole** elements stay statically walked (sound: the runtime either
ignores the closure or collects a subset of the analyzed union). Implemented in
`jsx.ts` (`walkComponentElement` → `assertHoleClosuresSafe`) + `resolve.ts` (`isHoleClosureSafe`).

**Phase 2.1 (implemented): lifting via `extraProps`.** Rather than dropping (and bailing on)
non-entity values that a target may invoke during collection, phase 2.1 *lifts* them into the hole.
See the dedicated section below.

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
   documented reference-app dummy-`<Field>` blind spot). In validate mode, emit a dev-only warn naming the
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
  an element, member-expression/namespace component tags (v2 keeps it simple: identifier tags only),
  and an **unsafe function prop / render-prop child of a hole element** (`FUNCTION_PROP_ON_HOLE` — see
  above).
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

### Related runtime fix (in scope — the reference app workaround removal) — DONE

`DataGridHasOneColumn`'s `collectSelection` (bindx-dataview `createRelationColumn.tsx`) discarded
the renderer's returned JSX, so nested `<HasMany>`/`<Field>` inside relation-column renderers were
never collected (the reference app worked around it with a `.map()` trick). Fixed: `walkRendererJsx` now runs
`collectSelection` on the renderer's returned JSX in addition to the proxy capture, in both the
`buildLeaf` `relatedSelection` computation and the hasOne/hasMany cell configs. The JSX walk drives
the collector proxy (via `HasMany.getSelection`'s `map`), registering nested fields into the parent
scope — mirroring `collectImplicitSelections`. Errors are contained per column. Independent of the
compiler; benefits uncompiled apps too. Regression test: `tests/react/dataview/createRelationColumn.test.tsx`
("nested declarative selection (the reference app regression)").

### Explicit non-goal

Statically analyzing **plain React component bodies** (even same-file) to collect their
`useField`-style reads is deliberately out: compiled selection would then be *stronger* than the
runtime fallback, so an app could work compiled and under-fetch uncompiled — breaking the
progressive-enhancement equivalence guarantee. The path for that blind spot is diagnostics
(validate-mode warn now, eslint rule later), or a future runtime analyzer improvement — not a
compiler-only fix.

## Phase 2.1 — lifting non-entity hole props via `extraProps` — IMPLEMENTED

Phase 2 dropped a hole element's function props / render-prop children and identifier-valued props,
bailing (`FUNCTION_PROP_ON_HOLE`) when that drop could under-fetch. Phase 2.1 closes the gap by
**lifting** the value into the hole instead of dropping it: module-scope values and render-scope-free
closures are in scope at the emit site, so they can be passed INTO the hole and handed to the target
at resolution — making compiled ≡ oracle by construction, function or not.

### Contract addition

`CompiledHole` gains `extraProps?: Record<string, () => unknown>` — thunked (TDZ-safe, same reason as
`component`). Hole resolution resolves each thunk and merges the value into the assembled props
(before the entity proxies, which win on collision). A target's `staticRender` that *invokes* a
lifted closure (`props.children(entity)`) therefore collects the same fields the oracle would.

### The taint lattice (default deny)

A non-entity value passed to a hole element is classified by where it resolves:

- **module-scope binding** (import OR top-level const/function — both module scope) → **lift**
  `extraProps: { prop: () => Identifier }`. The real value reaches the target at resolution →
  oracle-equal regardless of whether it is a function.
- **destructured render param that is a non-entity prop** (a scalar / `.use()` value) → **drop**.
  Invariant: at oracle collection these are inert scalar mocks (`createScalarPropMock`) that cannot
  reach a selection scope, so dropping is exactly what the oracle contributes.
- **anything else** (render-local `const`/`let`, generic nested-fn params, call results,
  unresolvable free identifiers) → **bail** `RENDER_LOCAL_ON_HOLE`. The value may be a real
  field-collecting function at oracle time whose invocation with a proxy we cannot see.

The compiler tracks `scalarParams` (safe-drop) and `locals` (bail) per scope; `locals` is checked
first so a render-local shadowing a module name bails rather than lifting.

### Inline closure lifting (recovers `FUNCTION_PROP_ON_HOLE`)

An inline closure prop / render-prop child of a hole element is classified `drop` / `lift` / `bail`
(`classifyHoleClosure`):

- captures an entity root → **bail** (invoking it reaches the host scope).
- uses no own parameter → **drop** (no proxy gateway; `onClick={() => save()}`).
- uses own parameters and captures **nothing from render scope** (only its params, module bindings,
  globals) → **lift** verbatim into `extraProps` — the closure is emittable as-is at module scope, and
  the target replays it with a collector proxy (`{it => <Field field={it.name}/>}` → the field lands).
- uses own parameters but captures a render-scope value (`t` from `.use()`, an entity root) → **bail**
  (not reproducible at the module emit site).

### `cond.*` DSL in JSX prop positions

`<Case if={cond.eq(cell.kind, 'promo')}>` — the recognized `cond.*` call in a prop has its FieldRef
arguments recorded as touched leaves (via the body analyzer's existing `cond` handling), then the
prop is dropped. **Soundness (verified against `Case.getSelection`)**: a condition object's only
selection surface is `collectConditionFields` = the FieldRef args; the literal comparison value and
the condition wrapper carry nothing else. The runtime `Switch`/`Case`/`Default` `getSelection`
collects exactly those FieldRefs plus the (separately analyzed) children — so compiler and oracle are
**strictly equal**, not merely a superset.

### JSX-element / fragment prop values

`draftSlot={<X ... />}` — the JSX is analyzed statically exactly like children (recurse; entity
references form paths / nested holes as usual) and the prop itself is not emitted. Soundness: the
oracle walks such JSX via the target's slot-walk / `staticRender` collector proxies, so static
analysis yields an equal-or-superset union (under-fetch impossible; over-fetch acceptable). Where the
target renders the slot as children (`withCollector` returning `<>{props.slot}{props.children}</>`)
the two are exactly equal.

### Result (re-measured on the reference app, 257 chains)

**254/257 compiled = 99 %** (phase 2 was 242/257 = 94 %). 38 chains carry 112 holes. The 3 remaining
bails are all genuine: 1 `ENTITY_IN_EXPRESSION_PROP` (a root-capturing event handler on a non-hole
element — the runtime cannot see it either), 1 `FUNCTION_PROP_ON_HOLE` (a render-prop child that
captures the host entity root `footer.linkColumns` — not liftable), 1 `ENTITY_REASSIGNMENT`
(out of scope). The `FUNCTION_PROP_ON_HOLE` class that dominated phase 2's residue is essentially
gone (9 → 1); the navigation-editor `cond`-in-props and publish.tsx `draftSlot` bails disappeared.

## Phase 2.2 — collector contracts (declarative invocation contracts for withCollector) — IMPLEMENTED

Status: **implemented** on `experiment/selection-compiler`. Runtime side (`itemOf`/`entityOf`/
`CollectorContract`/`COLLECTOR_CONTRACT`, `deriveContractStaticRender`, the `withCollector`
contract overload) landed in `012b321`. Compiler side — contract discovery
(`packages/bindx-compiler/src/contracts.ts`) and contract-aware hole formation
(`jsx.ts` `walkContractComponent`) — plus fixtures + oracle-equivalence tests are green.

Motivation: the last real reference-app bail (footer-editor `LinksSection`) is a render-prop child that
both uses its own param AND captures a host-root path (`footer.linkColumns`) — not droppable
(target invokes it at collection), not liftable (render-scope capture). The root cause is that
the analyzer cannot know an unknown component's invocation contract; `HasMany` works only because
that knowledge is hardcoded. A declared contract solves the CLASS: the analyzer treats the
callback exactly like a `HasMany` children callback — param becomes a root, host captures become
ordinary paths, no hole and no lift needed.

### API (bindx-react) — pinned, both implementation steps code against this exactly

```ts
interface CallbackContract { readonly kind: 'itemOf' | 'entityOf'; readonly field: string }
/** Key = callback prop name ('children' included). */
type CollectorContract = Record<string, CallbackContract>

function itemOf(field: string): CallbackContract    // invoked with each item of the has-many relation prop `field`
function entityOf(field: string): CallbackContract  // invoked with the entity of the has-one relation prop `field`

// New overload — contract object instead of a staticRender function:
withCollector(runtime, contract: CollectorContract)
```

- From a contract, withCollector **derives the staticRender automatically**: a fragment of
  `<HasMany field={props[field]}>{v => props[cb](v)}</HasMany>` (resp. `<HasOne>`) per entry,
  guarding `typeof props[cb] === 'function'`. Uncompiled runtime collection therefore works
  unchanged through all existing machinery (analyzeJsx walk, hole resolution) with zero
  duplication — the contract IS the selection surface, declared once.
- The contract is also attached to the component under an exported symbol `COLLECTOR_CONTRACT`
  (introspection; not needed by the compiled path).

### Compiler side

- **Contract discovery**: hole-candidate tag binding → if local `withCollector(_, <object literal>)`,
  read it directly; if imported, resolve the module specifier (**relative specifiers only** in v1,
  plus an optional `alias` option on the plugin/analyzer) and PARSE the target module (cached per
  file) to find the exported `withCollector(_, contract)` and extract the literal. Contract
  literals are object literals whose values are `itemOf(...)`/`entityOf(...)` calls imported from
  `@contember/bindx*` (string-literal args only). Anything else → no contract → existing
  hole/bail rules apply. This is a deliberate, bounded exception to the purely-local principle:
  parse-only, no execution, no type checker, cache-keyed.
- **With a contract, the element forms NO hole.** Per entity prop: referenced as a contract
  `field` → record the relation at its path (`many` for itemOf); the matching callback prop's
  closure is analyzed with its FIRST param as a root at that relation (additional params ignored,
  mirroring HasMany index handling). Host-root captures inside the closure are ordinary paths.
  Entity props not referenced by the contract → recorded as touched leaves (matches the oracle:
  the derived staticRender ignores them; only the evaluation touch registers).
- **Non-contract function props on a contract element are droppable without safety checks**: the
  derived staticRender provably never invokes them at collection. (This removes the
  FUNCTION_PROP_ON_HOLE/RENDER_LOCAL_ON_HOLE class entirely for contract components.)
- Missing callback for a contract entry → relation recorded, no nested (mirrors the guard).

### Validation

- Runtime: contract-derived staticRender produces identical collection to an equivalent
  hand-written staticRender function (oracle comparison); runtime rendering unaffected.
- Compiler fixtures: same-file contract target; **cross-file** contract target (fixture imports
  the component from a sibling fixture module); footer-editor replica (item callback capturing a
  host-root field → STRICT oracle equality); entityOf; non-contract function prop dropped;
  contract entry with missing callback.
- the reference app: validated on a patched TEMP COPY (scratchpad) of `footer-editor.tsx` + `_shared.tsx` with
  `InitializingRepeater` declaring `{ children: itemOf('field') }` — the reference repo itself is NOT
  modified; the suggested reference-app patch ships in the report/docs instead.

### Implemented — discovery mechanics

`packages/bindx-compiler/src/contracts.ts` (`ContractResolver` + `ContractFileCache`), threaded
through `analyzeProgram(program, { filename, alias, cache })` → `BodyAnalyzer` → `JsxAnalyzer` as a
`ContractLookup = (tag) => CollectorContract | null`. In `jsx.ts`, `walkComponentElement` calls the
lookup first; a hit routes to `walkContractComponent` (no hole), a miss keeps the phase-2/2.1 rules.

Resolution for a component tag:
1. **Local** `const Tag = withCollector(_, contract)` at module scope (TS wrappers unwrapped, incl.
   `... as <T>(...) => ReactNode`) → extract directly.
2. **Imported** binding (`import { Tag } from '...'`, or `Tag as default`): resolve the specifier —
   **relative only** (`./x` → `x.tsx|ts|jsx|js` / `x/index.*`, and the ESM `./x.js` → `x.tsx|ts|jsx`
   convention this repo uses), plus an optional `alias` (prefix→path) map for non-relative specifiers
   (default empty). PARSE the target (no execution, no type checker), find its exported binding
   (`export const`, `export { local as Tag }`, and `from`-source re-export chains — `export { X }
   from`, `export { X as Y } from`, `export * from` barrel index files — followed depth-limited
   (5 hops) with a cycle guard; a star ambiguity or an exhausted budget stays unfollowable → null),
   and extract.

A **contract literal** is an object literal whose every value is `itemOf('…')` / `entityOf('…')` with
a single string-literal arg, the combinators imported from `@contember/bindx*` **in that module**; a
module-level `const` identifier resolving to such a literal is also accepted. Any deviation (spread,
computed/method key, non-literal or missing arg, unknown combinator, unfollowable re-export,
non-relative unaliased import) → **no contract** → existing hole/bail rules (sound: a fallback hole
still resolves at runtime through the derived staticRender). Parsed sibling modules are cached by
**path + mtime** in a `ContractFileCache` shared across `analyzeProgram`/plugin invocations; the
resolver additionally memoizes per tag within a run.

Contract-aware analysis (`walkContractComponent`): the element forms **no hole**. Per contract entry
`cb → {kind, field}`, the `field` prop is resolved to a relation (`itemOf` ⇒ `consumeMany`/`many`,
`entityOf` ⇒ `consumeRelation`) and the matching callback closure is analyzed with its **first param
as a root at that relation** (extra params inert, mirroring `<HasMany>` index handling); host-root
captures inside the closure are ordinary paths. Entity props **not** referenced by the contract →
touched leaves (matching the oracle's host-eval touch). **Non-contract function props are dropped with
no safety bail** — the derived staticRender provably never invokes them (this removes the
`FUNCTION_PROP_ON_HOLE`/`RENDER_LOCAL_ON_HOLE` class for contract components). A missing callback for
an entry records the relation only.

### Implemented — the reference app temp-copy validation

Copied `footer-editor.tsx` + `_shared.tsx` into the scratchpad (relative `./_shared` import
preserved) and patched only the COPY's `InitializingRepeater` to `{ children: itemOf('field') }`
(importing `itemOf`). `measure.ts` on that directory:

- **Before** (hand-written staticRender, contract not discoverable): `footer-editor.tsx` **L112**
  `LinksSection` → `BAIL FUNCTION_PROP_ON_HOLE` (7/8 compiled). The render-prop child both uses its
  item param and captures the host root `footer.linkColumns` — not droppable, not liftable.
- **After** (contract declared): **L112 → `OK [footer] (1 hole)`** — no more `FUNCTION_PROP_ON_HOLE`
  (8/8 compiled). The outer repeater is now a contract callback; the inner
  `<FooterLinkRow link={link} parentColumns={footer.linkColumns} />` remains a legitimate hole
  resolved through `FooterLinkRow`'s own staticRender.

Full reference-app re-measure is **unchanged** — 254/257 (99%), 3 bails
(1 `ENTITY_IN_EXPRESSION_PROP`, 1 `FUNCTION_PROP_ON_HOLE`, 1 `ENTITY_REASSIGNMENT`) — because the reference app has
not adopted contracts. Adopting the suggested patch would clear the remaining `FUNCTION_PROP_ON_HOLE`.

Suggested reference-app patch (`packages/admin/app/components/web-builder/forms/_shared.tsx`) — also drop the
now-unused `HasMany` JSX import:

```diff
-import { Field, HasMany, HasOne, useEntityList, useField, useHasMany, useHasOne, withCollector } from '@contember/bindx-react'
+import { Field, HasOne, itemOf, useEntityList, useField, useHasMany, useHasOne, withCollector } from '@contember/bindx-react'
@@
 export const InitializingRepeater = withCollector(
 	InitializingRepeaterRuntime,
-	(props: InitializingRepeaterProps<object>) => (
-		<HasMany field={props.field}>
-			{item => props.children(item, { remove: () => {} })}
-		</HasMany>
-	),
+	{ children: itemOf('field') },
 ) as <TEntity extends object>(props: InitializingRepeaterProps<TEntity>) => React.ReactNode
```

## Phase 3 — Entity root compilation — IMPLEMENTED

Status: **implemented** on `experiment/selection-compiler`. Runtime side
(`compiledSelection?` prop on `<Entity>`, `useRootSelection`, `resolveCompiledRootSelection`,
`COMPILED_ROOT_KEY`) landed in `32d2927`. Compiler side — top-level `<Entity>` scan
(`packages/bindx-compiler/src/entityRoots.ts`), `BodyAnalyzer.analyzeRootChildren`, attribute
emit (`emit.ts` `entitySelectionAttr` + `babelPlugin.ts`), `EntityRootResult` public API,
measure entity-root reporting — plus adapter-oracle equivalence tests
(`tests/entityRoots.test.tsx`) are green.

### Implemented — scan, analysis, emit

- **Scan** (`entityRoots.ts`): `findEntityElements` walks the whole program for `<Entity>` JSX
  elements whose tag is a bindx `Entity` import binding (tracked in `ImportBindings.entity`,
  kept **separate** from the recognized-component map so a nested `<Entity>` stays opaque to the
  host chain's per-chain walk). `analyzeEntityRootsInProgram` / `analyzeEntityRoots` mirror
  `analyzeProgram` / `analyzeSource`; each element is an independent `EntityRootResult`.
- **Analysis**: the children closure's FIRST param is the root itself, so it is analyzed via
  `BodyAnalyzer.analyzeRootChildren` — a thin wrapper over `walkCallbackWithItem` (the same entry
  `<HasOne>`/`<HasMany>` callbacks use) binding the param at a fresh root SelNode with
  `source = 'entity'`. ALL existing machinery (paths, holes + `extraProps` + taint lattice,
  collector contracts incl. cross-module discovery, `cond.*` in props, JSX-valued props,
  `FUNCTION_PROP_ON_HOLE` / `RENDER_LOCAL_ON_HOLE`) applies unchanged. `<Entity>`'s own props are
  never analyzed. Non-function / absent children → `ENTITY_NO_FUNCTION_CHILDREN` bail (no emit;
  runtime walk stays).
- **Nested-in-component soundness**: an `<Entity>` inside a `createComponent` body is analyzed
  twice, independently. The host chain's full-body walk sees `<Entity>` as an unknown component
  and walks its children as a nested function — the closure param shadows host roots, so only
  OUTER host-root captures are recorded there; the Entity's own emit contains only paths rooted at
  its closure param. Verified: host chain selection and Entity root selection are disjoint and
  correct.
- **Emit** (`babelPlugin.ts`): both surfaces are analyzed before any mutation; for each proven
  root the plugin pushes `compiledSelection={{ props: { entity: {...} }, holes: [...] }}` onto the
  element (idempotent — skips elements already carrying the attribute).

### Result (measured on the reference app)

Chains unchanged: **254/257 (99%)**, 3 bails (host analysis untouched). Entity roots:
**84/105 compiled** (114 holes — every compiled root carries ≥1 hole: the reference app's dominant pattern is
`<Entity>{e => <Body entity={e} />}</Entity>`, one delegated hole per root). 21 bails:
11 `RENDER_LOCAL_ON_HOLE`, 7 `ENTITY_ESCAPES_TO_CALL`, 2 `ENTITY_NO_FUNCTION_CHILDREN`,
1 `FUNCTION_PROP_ON_HOLE` — the same reason classes as chains.

### Validation — adapter oracle

`tests/entityRoots.test.tsx`: the root oracle is the `QuerySpec` the adapter receives. A
`RecordingMockAdapter extends MockAdapter` (test-local, bindx unmodified) captures incoming
queries; each fixture renders the transformed vs untransformed `<Entity>` and compares the
requested root selection strictly (superset for branch unions). Fixtures: scalars; nested has-one;
compiled `createComponent` inside the closure (fragment merges); a hole (entity-derived value);
collector-contract target; branch union (runtime ⊆ compiled); create-mode; `<Entity>` nested in a
`createComponent` body (host chain unaffected + Entity emit correct); bail (non-function children →
no attribute). Plus children-not-invoked-during-collection (SCOPE_REF counter) and emit/idempotence.

### Original plan

Motivation: after phase 2.2 the compiler covers `createComponent()` chains, but selection
ROOTS still collect at runtime: `<Entity>` invokes its children render-prop with a collector
proxy on every root mount (`useSelectionCollection` → `collect: collector => children(collector)`)
— the same crash-prone, one-branch execution the compiler eliminated for components. the reference app has 147
`<Entity>` usages vs 65 definer-based hooks (already static by construction — nothing to compile
there). DataGrid/DataView roots are explicitly OUT of scope for phase 3 (different walker/marker
system; phase 3.1 candidate).

### Contract — pinned, both implementation steps code against this exactly

- `<Entity>` (both by-mode and create-mode) gains an optional compiler-facing prop
  `compiledSelection?: CompiledSelection` (same type as `.render()`'s 2nd arg). The root's
  field map lives under the FIXED key `entity` in `compiledSelection.props`; every hole's
  `entityProps[*].source` must be `'entity'`.
- Runtime: when the prop is present, Entity does NOT invoke `children(collector)` — the
  selection is built from the compiled fields + resolved holes (reuse/extract the shared
  resolution used by `applyCompiledSelection`; no fragments needed, just the root
  `SelectionMeta`). Validate mode (existing `setStaticSelectionValidation` flag): also run the
  runtime walk and apply the same under-fetch-only diff.
- Emit: the babel plugin injects the JSX attribute
  `compiledSelection={{ props: { entity: {...} }, holes: [...] }}` on the `<Entity>` element.
  Idempotence: skip elements that already carry the attribute.

### Compiler side

- New top-level scan: `<Entity>` JSX elements (tag resolving to an import from
  `@contember/bindx*`) anywhere in the file — including inside plain function components
  (routes) and inside `createComponent` render bodies. Each element is its own emit-or-bail
  unit, reported separately by measure (`entity roots: N compiled / M bailed`).
- Children must be a single function expression → its first param becomes the root; the entire
  existing machinery applies unchanged (paths, holes + extraProps, collector contracts,
  cond-in-props, JSX props). Non-function or absent children → no emit (runtime walk stays).
- Captures inside the Entity closure that reference an OUTER host root (Entity nested in a
  createComponent body) belong to the HOST chain — the host's full-body union walk already
  records them; the Entity emit contains only paths rooted at the closure param. (This makes
  the compiler a sound superset of the runtime here — the runtime walk of the host cannot see
  into the Entity closure at all.)
- `entity`/`by`/`filter`/`create`/`onPersisted` and other Entity props carry no selection;
  they are left untouched and impose no bail (they are not entity-rooted values — `entity`
  receives an entityDef, a module value).

### Validation

- Oracle for roots = the QuerySpec the adapter receives: render the transformed vs untransformed
  module under MockAdapter and compare the requested selection strictly (plus render-works and
  validate-mode-silent assertions). Fixture set: scalar fields; nested relations; compiled
  createComponent used inside the Entity closure (fragment composition still merges); a hole
  (entity-derived value into a nested component); a collector-contract target; branch union
  (superset assertion); create-mode Entity.
- Full the reference app measure re-run with root counts.

## Phase 3.1 — hole-target classification + entity-like roots — IMPLEMENTED

Status: **implemented** on `experiment/selection-compiler`. Compiler-only — no runtime change
(the `entityLike` attribute rides the wrapper's `{...props}` spread into the real `<Entity>`, which
already consumes `compiledSelection` from phase 3). Binding resolution shared with contract
discovery was extracted to `src/moduleResolve.ts` (`BindingResolver` + `ModuleCache`, now resolving
plain `function`/`class` declarations too); target classification lives in `src/targetKind.ts`
(`TargetKindResolver`), feeds `src/holeProps.ts` (`holePolicyFor`), and threads through
`analyzeProgram`/`analyzeEntityRootsInProgram`/`BodyAnalyzer`/`JsxAnalyzer`. `entityLike` is an
option on `analyzeSource`/`analyzeProgram`/`analyzeEntityRoots`/the Babel plugin, plus a
`--entity-like=Name,...` measure flag.

### Result (re-measured on the reference app)

- **Chains unchanged: 254/257 (99%)**, 3 bails (host analysis untouched) — as required.
- **Entity roots (no flag): 93/105 compiled** (was 84/105 in phase 3). 12 bails:
  7 `ENTITY_ESCAPES_TO_CALL` (genuine, out of scope), 2 `RENDER_LOCAL_ON_HOLE`
  (both `~/`-aliased imports the measure run cannot resolve → default-deny `unknown`),
  2 `ENTITY_NO_FUNCTION_CHILDREN`, 1 `ENTITY_IN_EXPRESSION_PROP`. The classification cleared
  the phase-3 residue of 11 `RENDER_LOCAL_ON_HOLE` → 2 and 1 `FUNCTION_PROP_ON_HOLE` → 0.
- **Entity roots (`--entity-like=RefreshableEntity`): 124/140 compiled**. The flag surfaces
  **35 new roots** (105 → 140) hidden behind the `RefreshableEntity` forwarding wrapper; 31 of
  them compile. 16 bails (the extra 4 vs no-flag are new `RefreshableEntity` roots passing
  render-locals to `~/`-aliased unresolvable targets — same default-deny class).

Classification (`TargetKind`): the collector-CONTRACT case is handled separately by
`ContractResolver` (checked first in `jsx.ts`); target-kind covers `createComponent` /
`plain` / `collectorStatic` / `unknown`. `collectorStatic` referenced-prop extraction: an
object-pattern staticRender param yields its destructured keys (rest → `'all'`); an identifier
param `p` yields the `p.x` accesses, with any other use (`p[x]`, `{...p}`, `f(p)`, aliasing) →
`'all'`; a param-less staticRender references nothing. Shadowing is ignored (over-counts → sound).
`entityLike` matching prefers an import's ORIGINAL exported name over its local alias, else the
local declaration name; default/namespace imports carry no matchable name and are skipped.

Motivation (the reference app entity-root bail audit): 12 of 21 root bails are render-locals / function children
on hole elements whose targets provably ignore them — `createComponent` targets (getSelection never
reads scalar props and never invokes function children; the slot walk ignores non-JSX), plain
function components (no surface at all), and `withCollector` staticRenders that reference only
`props.entity`. The taint lattice bails only because the TARGET KIND is unknown. Separately,
the reference app's `RefreshableEntity` forwarding wrapper hides 82 Entity roots from the root scan entirely.

### A) Target-kind classification (compiler-only; reuses the contract-discovery parse cache)

For a hole-candidate tag (local or relative import, same resolution as contracts — including
`from`-source re-export chains through barrel index files, followed depth-limited (5 hops) with a
cycle guard), classify:

- **`createComponent` chain** → non-entity props (render-locals, identifiers, call results) and
  function props/children are droppable with NO safety bail; slot names are extracted from
  `.slots([...])` (default `['children']`) — slot-valued JSX props keep being analyzed statically.
  Entity props keep forming the hole.
- **plain function component** (not wrapped by withCollector/createComponent) → no selection
  surface; everything non-entity droppable; the hole is still emitted (harmless — matches runtime
  blindness and keeps the validate-mode blind-spot warn).
- **`withCollector(runtime, staticRenderFn)`** → parse the staticRender body and collect the set
  of referenced prop names (destructured params, `props.x` members; rest/spread or aliasing of the
  props object → conservative "references everything"). A dropped prop NOT in the referenced set
  is safe; referenced render-locals/function props keep the existing bails.
- **withCollector + contract** → already handled (phase 2.2). **Unresolvable/unknown** → existing
  conservative rules unchanged.

### B) `entityLike` option (roots hidden behind forwarding wrappers)

Analyzer/plugin/measure option `entityLike?: string[]`: component names treated as `<Entity>` for
root scanning AND emission. The `compiledSelection` attribute is injected on the wrapper element;
it reaches the real `<Entity>` via the wrapper's `{...props}` spread — that props forwarding is the
opt-in requirement, documented (no runtime change needed). Measure gains a CLI flag
(`--entity-like=Name,...`).

### Validation

Fixtures per kind (createComponent target with render-local + function children now compiles and is
adapter-oracle-equal; plain target; collector-static referenced vs unreferenced prop; rest-spread →
conservative; entityLike forwarding-wrapper root end-to-end). the reference app re-measure with
`--entity-like=RefreshableEntity` — expected: root bails 21 → ~9, plus ~82 newly visible roots.

## Prod hardening

### First-class Vite plugin + cross-module watch invalidation — IMPLEMENTED

`bindxCompiler(options?)` (`src/vitePlugin.ts`, exported from `src/index.ts`) replaces injecting the
babel plugin into `@vitejs/plugin-react`'s babel options. It is a real Vite plugin (`enforce: 'pre'`,
so it runs before react's JSX transform; it only injects, never transforms JSX) whose `transform`
runs `@babel/core` with ONLY `bindxCompilerPlugin` + `typescript`/`jsx` parser plugins
(`configFile:false`, `babelrc:false`, `sourceMaps:true`). Cheap gate: `.tsx`/`.jsx` only, skip
`node_modules`, `include`/`exclude` (string-substring or RegExp), and a source pre-filter (must
contain `createComponent` or `<Entity`). Zero new runtime deps; the plugin return type is structural
(assignable to `import('vite').Plugin`) so vite stays an optional peer.

Why it matters: cross-file analysis (collector contracts, hole target-kind, re-export/barrel chases
in `moduleResolve.ts`) reads OTHER files to decide file A's emit. The analyzer now reports every
consulted path via a threaded `onDependency(absPath)` callback (`AnalyzeOptions` →
`BindingResolverOptions`, reported in `BindingResolver` for both the entry import and every re-export
hop, including files that fail to parse). The Vite plugin feeds each reported path to
`this.addWatchFile`, so editing a contract/target module re-transforms A. Without it, Vite never
re-transforms A when B changes and A's injected literal keeps a stale contract/target decision — in
dev that can flip a correct emit into an under-fetch, violating the soundness invariant.

Example wiring: `packages/example/vite.config.ts` places `bindxCompiler()` before `react()` under
the existing `BINDX_COMPILER=1` gate.

### Version marker + runtime validation, fallback, and killswitch — IMPLEMENTED

The emitted `CompiledSelection` now carries `v: 2` as its first property (`emit.ts` `selectionToAst`,
covering both the chain second-arg and the `<Entity>` `compiledSelection=` attribute). The runtime
type in `compiledSelection.ts` requires `v: 2`, and an exported guard `isValidCompiledSelection`
defensively checks shape (object, `v === 2`, `props` a plain object of objects, `holes` an array if
present). Both consumers validate before use and, on an invalid literal OR a top-level throw from
resolution, warn once with attribution and fall back to the runtime proxy pass — never crash, never
proceed with a half-read literal. In `componentFactory.ts` `ensureImplicitCollected` this means
falling back to `collectImplicitSelections` (partial compiled entries are cleared first); in
`useRootSelection.ts` the compiled memo returns `null`, driving the children-collector walk (decided
inside the memo so hook order is stable). Per-hole containment inside `applyCompiledSelection` is
unchanged — a single bad hole (including a throwing `extraProps` thunk, now assembled inside the
per-hole try) degrades only that hole, not the whole selection.

Killswitch: `setCompiledSelectionsEnabled(false)` (module-level in `componentFactory.ts`, exported
from the `bindx-react` public index alongside `setStaticSelectionValidation`) makes both consumers
ignore compiled literals and use the runtime path — incident mitigation without a rebuild.

Why it matters: the soundness invariant tolerates over-fetch but never under-fetch. A stale/corrupt
literal (e.g. a schema change that predates a re-transform, or a version skew) must not be partially
read into the fetch plan — the version marker + guard + wholesale fallback guarantee that a rejected
literal reproduces exactly what runtime collection would have fetched.

### Crash containment, diagnostics, and Entity literal hoisting — IMPLEMENTED

**Crash containment.** An unexpected (non-`BailError`) throw inside analysis is contained per unit as
a new `INTERNAL_ERROR` bail (`resolve.ts` `internalErrorBail`, applied in `analyze.ts` `analyzeChain`
and `entityRoots.ts` `analyzeEntityRoot`) — the runtime proxy pass (always sound) takes over instead
of failing the build. The plugin (`babelPlugin.ts`) additionally wraps discovery and EACH emit: a
crash in `analyzeProgram`/`analyzeEntityRootsInProgram` degrades the whole file to the fallback, and a
crash while injecting one chain/root loses only that injection. `INTERNAL_ERROR` always surfaces one
`console.warn` (file + loc + message), regardless of the diagnostics setting. `BailError` semantics
are untouched — normal bails still flow as before.

**Diagnostics.** `diagnostics?: 'off' | 'summary' | 'verbose'` (default `'off'`) on both the babel
plugin options and `bindxCompiler` Vite options. A single reporter (`diagnostics.ts` `reportFile`)
decides all console output: `'verbose'` prints one `[bindx-compiler] <file>:<line> BAIL <CODE>` per
bail plus a per-file `N compiled, M bailed` line; `'summary'` prints one file line only when the file
has a bail; `INTERNAL_ERROR` always warns (deduped — no extra `BAIL` info line on top of its warn).
The Vite plugin accumulates per-file totals (per-instance, no module-level state, via the babel
plugin's `onReport` callback) and prints one `[bindx-compiler] total: N compiled, M bailed` in
`buildEnd` when diagnostics is not `'off'`.

**Emit AST-reuse fix.** `emit.ts` deep-clones (`t.cloneNode(expr, true)`) every expression copied out
of the original render tree into a hole's `extraProps` thunk — the same node no longer sits at two
tree positions (fragile against later passes: react-refresh, JSX transform, source maps). `valueToNode`
outputs (`entityProps`/`literalProps`/`params`) are freshly built from plain data, so they need no
clone.

**Entity literal hoisting.** A proven `<Entity>`'s CompiledSelection is hoisted to a module-scope
`const _bindxCompiledSelection…` (inserted after the last import) and referenced by the
`compiledSelection={…}` attribute, instead of an inline object literal. Inline literals get a new
identity every parent render, forcing `useRootSelection`'s memo to re-resolve all holes (and
validate-mode to re-warn) each render; a hoisted const is stable. Chains keep their inline
`.render(fn, literal)` second argument (evaluated once at module scope already). The idempotence guard
(`hasCompiledSelectionAttr`) matches on the attribute NAME, so an identifier-valued attribute from a
prior hoist still skips a re-transform.

### Cleanup pass (post-audit) — IMPLEMENTED

Type-hygiene and surface-area cleanup with no behavior change:

- **No casts anywhere.** The three hand-rolled read-only AST walkers (`resolve.ts` `anyIdentifier`,
  `targetKind.ts` `referencedMembersOf`, and the inline visitor in `chain.ts`/`entityRoots.ts`) now
  share the single `astWalk.ts` `walkAst`, extended with a `'skip' | 'stop'` `WalkControl` return
  (skip children / abort the whole walk). Child access uses `Reflect.get` (cast-free) and the node
  guard uses `'type' in value`, so the `as unknown as Record<…>` casts are gone. `imports.ts` resolves
  component kinds via a `ReadonlyMap<string, ComponentKind>` instead of a `Set` + `as ComponentKind`.
- **Contract type dedup.** `CallbackContract`/`CollectorContract` are imported (`import type`) from
  `@contember/bindx-react` — the runtime derives them, the compiler parses what they describe, so they
  are declared once. A project reference to `../bindx-react` makes `tsc --build` resolve them; both
  declarations cross-reference each other.
- **Public API trimmed.** `src/index.ts` now exports only `bindxCompilerPlugin`/`bindxCompiler`, the
  `analyze*` entries + `isBailed`/`isEntityRootBailed`, and the public result/option types. Internals
  (`ContractResolver`, `TargetKindResolver`, `ModuleCache`, `selectionToAst`, `selectionToPlain`,
  `ContractFileCache` alias, …) are reached from their source modules; tests that needed them import
  directly (`../src/emit.js`, `../src/selectionTree.js`).
- **Per-instance module cache.** `bindxCompiler` creates one `ModuleCache` per plugin instance and
  threads it through the babel plugin (`BindxCompilerOptions.cache`) into analysis, so dev-server
  memory is bounded per build and test runs are isolated. The process-lifetime singleton stays the
  default for bare babel-plugin usage.
- **Coverage.** Added `optionsPlumbing.test.ts` (alias + entityLike actually take effect through the
  babel plugins-with-options tuple) and plugin tests for a hand-written `.render(fn, literal)` second
  arg (preserved, not injected over) and the `EXPLICIT_RENDER_FN` bail on a non-inline render arg.

## Future (explicitly out of scope now)

Unplugin packaging, eslint plugin reusing the analyzer (bail reasons as lint diagnostics),
oxc/SWC port if Babel cost ever matters, closure lifting with entity-path capture substitution
(phase-2.2 alternative — superseded by contracts unless a non-contract case demands it),
DataGrid/DataView root compilation.
