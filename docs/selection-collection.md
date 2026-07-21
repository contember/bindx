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

### `getSelection` — for framework primitives

Low-level API for precise control over reported fields. Used by Field, HasOne, HasMany, Attribute.

## Compiled selections (experimental)

By default, an implicit `createComponent()` discovers its selection at runtime by
executing the render body against collector proxies. The `@contember/bindx-compiler`
Babel plugin can instead prove that selection at build time and emit it as the 2nd
argument of `.render(fn, staticSelection)`. When present, the runtime uses it directly
and **skips the proxy pass entirely** — no user code runs during collection, so the
crash-and-degrade machinery becomes irrelevant.

This is progressive enhancement: a compiled app behaves identically to an uncompiled
one. It is never mandatory.

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
machine-readable reason (e.g. `ENTITY_ESCAPES_TO_CALL`, `ENTITY_SPREAD`,
`COMPUTED_MEMBER`, `NON_LITERAL_HASMANY_PARAM`, `INTERFACES_MODE`, `UNCLASSIFIED`).
Bailed chains are left untouched and fall back to the runtime proxy pass.

Measure the compiled-vs-bailed rate over a source tree with
`bun run packages/bindx-compiler/scripts/measure.ts <dir>` (default
`packages/example`).

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
