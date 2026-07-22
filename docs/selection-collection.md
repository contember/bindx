# Bindx React Guide

## Data Loading

### `useEntity` — single entity

```tsx
const article = useEntity(schema.Article, { by: { id } }, e => e.title().content().author(a => a.name()))
```

Returns a discriminated union on `$status`:

```tsx
if (article.$isLoading) return <Spinner />
if (article.$isError) return <Error error={article.$error} />
if (article.$isNotFound) return <NotFound />

// Ready — full EntityAccessor with .value access
return <input value={article.title.value ?? ''} onChange={e => article.title.setValue(e.target.value)} />
```

The ready state is an `EntityAccessor` merged with status metadata. You get direct `.value` access on fields because the selection definer (third argument) declares which fields to fetch.

Options:
```tsx
useEntity(schema.Article, {
  by: { id: '...' },      // Required — unique identifier
  cache: true,             // Use cached data if available
}, definer)
```

### `useEntityList` — entity list with filtering

```tsx
const articles = useEntityList(schema.Article, {
  filter: { published: { eq: true } },
  orderBy: [{ publishedAt: 'desc' }],
  limit: 10,
  offset: 0,
}, e => e.title().publishedAt())
```

Returns a discriminated union on `$status`:

```tsx
if (articles.$isLoading) return <Spinner />
if (articles.$isError) return <Error error={articles.$error} />

// Ready — items array of EntityAccessors
return (
  <ul>
    {articles.items.map(article => (
      <li key={article.id}>{article.title.value}</li>
    ))}
  </ul>
)
```

Mutation methods on the ready result:
```tsx
const tempId = articles.$add({ title: 'New Article' })  // Add item, returns temp ID
articles.$remove(tempId)                                  // Remove by ID
articles.$move(0, 2)                                      // Reorder
```

### Selection definer

The third argument to `useEntity`/`useEntityList` declares which fields to fetch:

```tsx
e => e
  .title()                                    // Scalar field
  .content()                                  // Scalar field
  .author(a => a.name().email())              // Has-one relation with nested fields
  .tags({ limit: 5 }, t => t.name().color())  // Has-many with params + nested fields
  .author(AuthorInfo.$author)                 // Merge fragment from createComponent
```

## Persistence

### `usePersist` — global persistence

```tsx
const { persistAll, persist, isPersisting, isDirty, dirtyEntities } = usePersist()

// Save all dirty entities in a transaction
await persistAll()

// Save single entity via ref
await persist(article.title)  // Persists the Article containing this field

// Save specific fields only
await persistFields(article.title)
```

### `usePersistEntity` — entity-scoped persistence

```tsx
const { persist, persistFields, isPersisting, isDirty, dirtyFields } = usePersistEntity('Article', id)

await persist()                    // Save this entity
await persistFields(['title'])     // Save only the title field
```

`isDirty`, `isPersisting`, `dirtyFields` are reactive — component re-renders when they change.

## Undo/Redo

Requires `enableUndo` on the provider:

```tsx
<BindxProvider adapter={adapter} schema={schema} enableUndo>
```

```tsx
const { canUndo, canRedo, undo, redo, beginGroup, endGroup } = useUndo()

// Manual grouping — multiple actions as single undo step
const groupId = beginGroup('batch edit')
article.title.setValue('New Title')
article.content.setValue('New Content')
endGroup(groupId)
```

## Events and Interceptors

### Event listeners — react to changes

```tsx
// Global — any field change
useOnEvent('field:changed', event => {
  console.log('Field changed:', event)
})

// Entity-scoped
useOnEntityEvent('entity:persisted', 'Article', id, event => {
  toast.success('Article saved!')
})

// Field-scoped
useOnFieldEvent('field:changed', 'Article', id, 'title', event => {
  console.log('Title:', event.oldValue, '→', event.newValue)
})
```

### Interceptors — cancel or allow mutations

```tsx
// Reject empty values
useInterceptField('field:changing', 'Article', id, 'title', event => {
  if (event.newValue === '') return { action: 'cancel' }
  return { action: 'continue' }
})

// Validate before persist
useInterceptEntity('entity:persisting', 'Article', id, () => {
  if (!isValid) return { action: 'cancel' }
  return { action: 'continue' }
})
```

### `useEntityBeforePersist` — pre-persist validation

```tsx
useEntityBeforePersist('Article', id, () => {
  if (!article.title.value) {
    article.title.addError({ message: 'Title is required', source: 'client', category: 'validation' })
  }
})
```

## Error Handling

### `useEntityErrors` — entity error state

```tsx
const { hasErrors, entityErrors, fieldErrors, relationErrors } = useEntityErrors('Article', id)

// fieldErrors is Map<string, FieldError[]>
const titleErrors = fieldErrors.get('title') ?? []
```

### Inline errors on refs

```tsx
article.title.addError({ message: 'Too short', source: 'client', category: 'validation' })
article.title.clearErrors()
article.title.errors      // readonly FieldError[]
article.title.hasError     // boolean
```

## EntityRef vs EntityAccessor

- **`EntityRef`** — stable pointer with `id`, `$isDirty`, `$isNew`, field access returning `FieldRef` (no `.value`). Used in public API surfaces (component props, children callbacks).
- **`EntityAccessor`** — extends `EntityRef` with `$data`, `$fields`, field access returning `FieldAccessor` (with `.value`, `.isDirty`). Created by hooks or by `createComponent` with explicit selection.

**Rule**: components receive `EntityRef` as props. To access `.value`:
- Use `<Field>` / `<Attribute>` JSX components
- Use `createComponent()` with explicit selection (render gets `EntityAccessor`)
- Call `useAccessor(ref)` in a React component

## JSX Components

### `<Entity>` — root data boundary

```tsx
<Entity entity={schema.Article} by={{ id }} loading={<Spinner />} notFound={<NotFound />}>
  {article => (
    <div>
      <Field field={article.title} />
      <HasOne field={article.author}>
        {author => <Field field={author.name} />}
      </HasOne>
    </div>
  )}
</Entity>
```

Children receives `EntityRef`. Use `<Field>`, `<HasOne>`, `<HasMany>`, `<Attribute>` inside.

Create mode:
```tsx
<Entity entity={schema.Article} create onPersisted={id => navigate(`/articles/${id}`)}>
  {article => <InputField field={article.title} />}
</Entity>
```

### `<Field>` — render a scalar value

```tsx
<Field field={article.title} />

<Field field={article.email}>
  {email => <a href={`mailto:${email.value}`}>{email.value}</a>}
</Field>

<Field field={article.publishedAt} format={d => d?.toLocaleDateString()} />
```

### `<Attribute>` — apply field value to element attributes

```tsx
<Attribute field={tag.color} format={color => ({ style: { backgroundColor: color.value ?? '#666' } })}>
  <span className="tag-badge">
    <Field field={tag.name} />
  </span>
</Attribute>
```

**Important**: `<Attribute>` must wrap `<Field>`, not the other way around. During collection, only the outer component's props and children JSX are analyzed.

### `<HasMany>` / `<HasOne>` — relations

```tsx
<HasMany field={author.articles} limit={5} orderBy={{ publishedAt: 'desc' }}>
  {(article, index) => (
    <div key={article.id}>
      {index + 1}. <Field field={article.title} />
    </div>
  )}
</HasMany>

<HasOne field={article.author}>
  {author => <Field field={author.name} />}
</HasOne>
```

### `<If>` / `<Show>` — conditional rendering

```tsx
<If condition={article.$isDirty} then={<span>Unsaved changes</span>} />

<Show field={author.bio} fallback={<p>No bio</p>}>
  {bio => <p>{bio}</p>}
</Show>
```

## `createComponent()` — reusable fragments

### Implicit mode — auto-detected selection from JSX

```tsx
const AuthorInfo = createComponent()
  .entity('author', schema.Author)
  .render(({ author }) => (
    <div>
      <Field field={author.name} />
      <Field field={author.email} />
    </div>
  ))
```

Render receives `EntityRef`. Use `<Field>` and `<Attribute>` for value access. Do not call `useAccessor` (crashes during collection phase).

### Explicit mode — declared selection, full accessor

```tsx
const TagBadge = createComponent()
  .entity('tag', schema.Tag, t => t.name().color())
  .render(({ tag }) => (
    <span style={{ backgroundColor: tag.color.value ?? '#666' }}>
      {tag.name.value}
    </span>
  ))
```

Render receives `EntityAccessor` — direct `.value` access. Use when you need field values in attributes, conditional logic, or non-bindx libs.

### Fragment properties

Both modes generate `$propName` for composing with `useEntity`:

```tsx
const article = useEntity(schema.Article, { by: { id } }, e =>
  e.title().author(AuthorInfo.$author)
)
```

### `useAccessor` / `useField` hooks

Convert Ref → Accessor with store subscription. Use in your own React components:

```tsx
function AuthorBadge({ author }: { author: EntityRef<Author> }) {
  const acc = useAccessor(author)
  return <span>{acc.name.value}</span>
}
```

**Note**: these are React hooks — call only in components, not in render callbacks.

## Selection Collection

### How it works

When `<Entity>` or `useEntity()` renders, bindx analyzes the component tree to discover which fields to fetch:

1. **`getSelection`** — component returns field metadata directly (Field, HasOne, HasMany, Attribute)
2. **`staticRender`** (via `withCollector`) — component returns JSX analyzed recursively

### `withCollector` — for library components with render props

```tsx
const SelectField = withCollector(
  function SelectField({ field, children }) {
    const accessor = useHasOne(field)
    return <Popover>{children(accessor.$entity)}</Popover>
  },
  (props) => (
    <HasOne field={props.field}>
      {entity => props.children(entity)}
    </HasOne>
  )
)
```

### Collector contracts — declare invocation, skip the hand-written staticRender

When a `withCollector` component invokes a callback prop over a relation prop, you can declare that
contract instead of hand-writing a `staticRender`. Declare it once — it drives **both** runtime
collection (the staticRender is derived automatically) **and** the compiler (which then treats the
callback exactly like a `<HasMany>`/`<HasOne>` child, so no build-time hole or lift is needed):

```tsx
import { itemOf, entityOf, withCollector } from '@contember/bindx-react'

// `children` is invoked with each item of the has-many `field`.
export const Repeater = withCollector(
  function RepeaterRuntime({ field, children }) { /* … render … */ },
  { children: itemOf('field') },   // vs. entityOf('field') for a has-one callback
)
```

The contract is `Record<callbackPropName, itemOf(field) | entityOf(field)>` (`children` allowed as a
key), also exposed on the component under the `COLLECTOR_CONTRACT` symbol for introspection. This
solves the case a hole cannot: a callback that both uses its item param **and** captures a host-root
field (e.g. `{item => <Row item={item} parentColumns={footer.linkColumns} />}`) — under a contract the
host capture is an ordinary root path, and non-contract function props on the element are dropped
safely (the derived staticRender never invokes them). The compiler discovers contracts declared
locally or imported via a **relative** specifier (see docs/compiler-plan.md, Phase 2.2).

### `getSelection` — for framework primitives

Low-level API for precise control over reported fields. Used by Field, HasOne, HasMany, Attribute.

## Compiled selections (experimental)

By default, an implicit `createComponent()` discovers its selection at runtime by
executing the render body against collector proxies. The `@contember/bindx-compiler`
Babel plugin can instead prove that selection at build time and emit it as the 2nd
argument of `.render(fn, compiledSelection)`. When present, the runtime uses it directly
and **skips the proxy pass entirely** — no user code runs during collection, so the
crash-and-degrade machinery becomes irrelevant.

The emitted object has the shape `{ props, holes? }`: `props` is the per-entity-prop
static field map; `holes` describe nested components that received entity-derived values
(see below).

This is progressive enhancement: a compiled app behaves identically to an uncompiled
one. It is never mandatory.

### Nested components (holes)

A host render body often passes an entity-derived value to another component:
`<AuthorCard author={article.author} />`. The compiler cannot inline that component's
selection (it lives in another module, may be defined later, etc.), so it emits a
**hole**: a thunk to the target plus a map of which prop comes from which host entity
prop and member path. At collection time the runtime resolves each hole through the
target's own selection surface — `getSelection` (createComponent) or `staticRender`
(`withCollector`) — replaying the member path on collector proxies. This is the
Relay-fragment-spread equivalent: the target's fields are folded into the host's fetch
**without executing the host render body**.

Because both the runtime proxy pass and the compiled path drive the *same* collector
proxies for the escaping value, a hole and a runtime-collected escape produce identical
selections.

**Shared blind spot — plain components.** If the target is a plain React component (no
`getSelection`/`staticRender`), neither the compiler nor the runtime proxy pass can see
the fields it reads (e.g. via `useField`). This is a blind spot on *both* paths, so
compiled and uncompiled behavior stay equivalent. In validate mode the runtime emits a
dev-only warning naming the component so the blind spot is discoverable rather than
silent. The fix is to give the component a selection surface (wrap it with
`withCollector`) or mount sibling `<Field>`s — not a compiler-only change (that would
make the compiled app fetch more than the uncompiled one, breaking equivalence).

### Enabling in Vite

Wire the plugin into `@vitejs/plugin-react`'s `babel.plugins`, behind an env flag:

```ts
import react from '@vitejs/plugin-react'
import { bindxCompilerPlugin } from '@contember/bindx-compiler'

const compilerEnabled = process.env.BINDX_COMPILER === '1'

export default defineConfig({
  plugins: [
    react(compilerEnabled ? { babel: { plugins: [bindxCompilerPlugin] } } : undefined),
  ],
})
```

Run with `BINDX_COMPILER=1`. The plugin only injects arguments; it never imports
from bindx-react.

### Validate mode

`setStaticSelectionValidation(true)` (call in your dev entry) makes the runtime ALSO
run the proxy pass alongside the compiled selection and warn on any **under-fetch** —
a field the runtime would fetch that the compiled selection omits. It intentionally
does not warn on the two legitimate divergences where the compiler is more precise:
branch unions (the compiler unions all conditional branches) and has-many
params/many-ness (the runtime never records these in implicit collection).

### Emit-or-bail

The compiler emits a selection only when it can prove it. Over-approximation (extra
fields) is acceptable; under-approximation is impossible by construction (default
deny). Anything it cannot classify makes the whole component **bail** with a
machine-readable reason (e.g. `ENTITY_ESCAPES_TO_CALL`, `ENTITY_IN_EXPRESSION_PROP`,
`FUNCTION_PROP_ON_HOLE`, `RENDER_LOCAL_ON_HOLE`, `ENTITY_REASSIGNMENT`, `ENTITY_SPREAD`,
`COMPUTED_MEMBER`, `MEMBER_COMPONENT_TAG`, `NON_LITERAL_HASMANY_PARAM`, `INTERFACES_MODE`,
`UNCLASSIFIED`). Bailed chains are left untouched and fall back to the runtime proxy pass.

`FUNCTION_PROP_ON_HOLE` / `RENDER_LOCAL_ON_HOLE` guard an under-fetch class: a hole element's
function props / render-prop children / identifier-valued props are non-entity, but a hole target's
`staticRender` may *invoke* them with a collector proxy during collection (npi's `SelectField` does
`<HasOne field={props.field}>{e => props.children(e)}</HasOne>`), collecting fields the compiled path
would otherwise miss. **Phase 2.1** resolves most of these by *lifting* the value into the hole's
`extraProps` instead of dropping it: module-scope bindings and render-scope-free closures are in scope
at the emit site, so the real value reaches the target at resolution (`it => <Field field={it.name}/>`
lifts; `onClick={() => save()}` drops as inert; a closure capturing `t` from `.use()` or an entity
root bails, as does a render-local const passed onward). See docs/compiler-plan.md, phase 2.1.

Measure the compiled-vs-bailed rate (and hole counts) over a source tree with
`bun run packages/bindx-compiler/scripts/measure.ts <dir>` (default
`packages/example`). On the largest real bindx app (`npi`, `packages/admin`, 257 chains)
phase 2.1 compiles **254/257 (99%)** — 38 chains carry 112 holes total — leaving 3 genuine bails
(1 `ENTITY_IN_EXPRESSION_PROP`, 1 `FUNCTION_PROP_ON_HOLE`, 1 `ENTITY_REASSIGNMENT`); phase 2 with
holes compiled 94%, phase 1 without holes 84%.

### Entity roots (phase 3)

Selection ROOTS compile too. A `<Entity>` invokes its children render-prop with a
collector proxy on every root mount — the same crash-prone, one-branch execution the
compiler eliminated for components. The plugin scans for `<Entity>` elements (tag resolving
to a `@contember/bindx*` import) **anywhere** in a file — plain route components, inside
`createComponent` render bodies, at any nesting — and injects a JSX attribute
`compiledSelection={{ props: { entity: {...} }, holes: [...] }}`. The root's field map lives
under the fixed key `entity`; every hole is rooted at `entity`. When present the runtime
builds the root `SelectionMeta` statically and never calls `children` with a collector
(`useRootSelection`); validate mode still runs the contained walk for the under-fetch diff.

The children closure's **first param is the root entity accessor itself** (unlike a
`.render()` body, whose param is the props object) — so it is analyzed exactly like a
`<HasOne>`/`<HasMany>` children callback. All existing machinery applies unchanged: member
paths, holes + `extraProps`, collector contracts, `cond.*` in props, JSX-valued props,
branch union. `<Entity>`'s own props (`entity`, `by`, `filter`, `create`, `onPersisted`,
`queryKey`, `loading`, `error`, `notFound`, …) carry no selection and are never analyzed
(`entity` receives an `entityDef` — a module value, not an entity-rooted value). Non-function
or absent children bail `ENTITY_NO_FUNCTION_CHILDREN`; the runtime walk stays. Each `<Entity>`
element is its own emit-or-bail unit, reported separately by `measure`
(`entity roots: N compiled / M bailed`).

An `<Entity>` nested inside a `createComponent` body is analyzed twice, independently and
soundly: the HOST chain's full-body walk records any host-root captures inside the closure
(the closure param **shadows** host roots), while the Entity's own emit contains ONLY paths
rooted at its closure param. The runtime host walk cannot see into the Entity closure at all,
so the compiler is a sound superset here.

The root oracle is the `QuerySpec` the adapter receives: rendering a transformed vs
untransformed `<Entity>` under a query-recording `MockAdapter` requests the identical root
selection (superset for branch unions). On `npi`, `packages/admin`, the plugin compiles
**84/105** `<Entity>` roots (114 holes; npi's dominant pattern is
`<Entity>{e => <Body entity={e} />}</Entity>`, one delegated hole per root). The 21 bails are
11 `RENDER_LOCAL_ON_HOLE`, 7 `ENTITY_ESCAPES_TO_CALL`, 2 `ENTITY_NO_FUNCTION_CHILDREN`,
1 `FUNCTION_PROP_ON_HOLE` — the same reason classes as chains, since the same machinery runs.
DataGrid/DataView roots are out of scope (different walker; phase 3.1).

### Hole-target classification + `entityLike` roots (phase 3.1)

**createComponent / plain targets no longer bail on render-locals.** A hole element's non-entity
props (identifier render-locals, call results, function props / render-prop children) only risk
under-fetch when the *target* actually invokes/reads them. The compiler now classifies the target
tag — reusing the contract parse cache — into `createComponent`, `plain`, `collectorStatic`, or
`unknown`:

- **`createComponent`** target — `getSelection` never reads scalar props and never invokes
  function slots (the slot walk ignores functions), so render-locals and function props/children
  drop with **no bail**; the entity props still form the hole. Slot names come from `.slots([...])`
  (default `['children']`); JSX-valued props are analyzed statically as before.
- **`plain`** function/class component — no selection surface, so **every** non-entity prop drops;
  the hole is still emitted (matching runtime blindness; keeps the validate-mode blind-spot warn).
- **`collectorStatic`** (`withCollector(runtime, staticRenderFn)`) — the compiler reads the *set of
  prop names the staticRender references*. A dropped prop **not** in that set is safe; a referenced
  render-local still bails. A staticRender that spreads/aliases its props object (`{...props}`,
  rest param, `f(props)`) is treated as "references everything" (conservative).
- **`unknown`** (unresolvable, or resolvable via a non-relative unaliased import) — the existing
  conservative taint lattice stands (default deny). Collector **contracts** are still handled by
  their own resolver, before target-kind classification.

**`entityLike` — roots behind forwarding wrappers.** Some apps wrap `<Entity>` in a thin component
that forwards props (npi's `RefreshableEntity` = `withCollector(props => <Entity queryKey={…}
{...props} />, props => <Entity {...props} />)`). Pass `entityLike: ['RefreshableEntity', …]` to
the analyzer/plugin (or `--entity-like=Name,…` to `measure`) and those tags are scanned + emitted
**exactly like `<Entity>`**: the `compiledSelection` attribute is injected on the *wrapper* element
and reaches the inner `<Entity>` through the wrapper's `{...props}` spread — **that props
forwarding is the opt-in requirement** (there is no runtime change; `<Entity>` already consumes
`compiledSelection`). Matching prefers an import's original exported name over its local alias; a
locally-declared wrapper matches by its declared name; default/namespace imports are skipped.

On `npi`, `packages/admin`: chains stay **254/257**; entity roots go **84 → 93/105** from
classification alone, and **`--entity-like=RefreshableEntity`** surfaces **35 previously-hidden
roots** (105 → 140, 124 compiled).

See [docs/compiler-plan.md](./compiler-plan.md) for the full design.

## Provider Setup

### `BindxProvider` — generic

```tsx
<BindxProvider
  adapter={new MockAdapter(data)}
  schema={testSchema}
  enableUndo
  debug
>
  {children}
</BindxProvider>
```

### `ContemberBindxProvider` — Contember CMS

```tsx
<ContemberBindxProvider
  schema={generatedSchema}
  client={graphQlClient}
  undoManager
  defaultUpdateMode="optimistic"
>
  {children}
</ContemberBindxProvider>
```

## Testing with MockAdapter

```tsx
import { MockAdapter, BindxProvider } from '@contember/bindx-react'

const data = {
  Article: {
    'article-1': { id: 'article-1', title: 'Hello', content: 'World' },
  },
  Author: {
    'author-1': { id: 'author-1', name: 'John' },
  },
}

const adapter = new MockAdapter(data, { delay: 0 })

render(
  <BindxProvider adapter={adapter} schema={testSchema}>
    <TestComponent />
  </BindxProvider>
)
```

`MockAdapter` supports:
- Configurable delay (`delay: 0` for instant responses in tests)
- Full CRUD operations
- Relation operations (connect, disconnect, create, delete)
- Filter, orderBy, limit/offset
- `resetStore(newData)` for test state manipulation
