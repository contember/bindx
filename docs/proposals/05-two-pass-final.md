# Two-Pass Approach - Finální návrh (Typesafe)

## Problém s Contember Binding přístupem

Contember Binding používá string-based field references:
```tsx
<Field field="name" />  // ❌ Není typesafe - TS neví v jakém kontextu jsme
```

TypeScript v JSX neví, že jsme uvnitř `Author` entity, takže nemůže validovat field names.

## Řešení: Callback + Component hybrid

Kombinace:
1. **Callback pattern** - poskytuje typesafe kontext (entity reference)
2. **Komponenty** - poskytují strukturu pro statickou analýzu

```tsx
<Entity name="Author" id="author-1">
  {entity => (
    <>
      {/* ✅ Typesafe - TS ví že entity je Author */}
      <Field field={entity.fields.name} />

      <HasMany field={entity.fields.articles}>
        {article => (
          {/* ✅ Typesafe - TS ví že article je Article */}
          <Field field={article.fields.title} />
        )}
      </HasMany>
    </>
  )}
</Entity>
```

---

## Architektura

### Dual-mode Field Reference

Klíčový koncept: `entity.fields.xxx` vrací objekt, který funguje **v obou fázích**:

```ts
// Typ pro field referenci - funguje v collection i runtime
interface FieldRef<T> {
  // Interní metadata pro collection
  readonly __path: string[]
  readonly __fieldName: string

  // Runtime přístup k hodnotě
  readonly value: T | null
  setValue(value: T): void
  readonly isDirty: boolean
}

// Typ pro has-many referenci
interface HasManyRef<T> {
  readonly __path: string[]
  readonly __fieldName: string
  readonly __isArray: true

  // Runtime - iterace
  map<R>(fn: (item: EntityRef<T>, index: number) => R): R[]
  readonly length: number
}

// Typ pro has-one referenci
interface HasOneRef<T> {
  readonly __path: string[]
  readonly __fieldName: string
  readonly __isArray: false

  // Runtime - nested accessor
  readonly fields: EntityFields<T>
}
```

### Entity Proxy - dva módy

```ts
// Collection mód - sbírá field references
function createCollectorProxy<T>(
  selection: SelectionMeta,
  path: string[] = []
): EntityRef<T> {
  return {
    id: 'collector',
    fields: new Proxy({} as EntityFields<T>, {
      get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
        const fieldPath = [...path, fieldName]

        // Zaregistruj pole do selection
        selection.addField(fieldPath)

        // Vrať referenci která může být použita v komponentách
        return {
          __path: fieldPath,
          __fieldName: fieldName,
          // Dummy hodnoty pro collection phase
          value: null,
          setValue: () => {},
          isDirty: false,
        }
      }
    })
  }
}

// Runtime mód - reálná data
function createRuntimeAccessor<T>(
  data: T,
  identityMap: IdentityMap
): EntityRef<T> {
  return {
    id: data.id,
    fields: new Proxy({} as EntityFields<T>, {
      get(_, fieldName: string): FieldAccessor<unknown> {
        return new FieldAccessor(data, fieldName, identityMap)
      }
    })
  }
}
```

### Komponenty

```tsx
// Field komponenta - jednoduchá, jen renderuje
interface FieldProps<T> {
  field: FieldRef<T>
  children?: (accessor: FieldRef<T>) => ReactNode
  format?: (value: T | null) => ReactNode
}

export function Field<T>({ field, children, format }: FieldProps<T>) {
  // V collection phase: field.value je null, ale to je OK
  // V runtime phase: field.value má reálnou hodnotu

  if (children) {
    return <>{children(field)}</>
  }
  if (format) {
    return <>{format(field.value)}</>
  }

  // Default: renderuj hodnotu
  if (field.value === null || field.value === undefined) {
    return null
  }
  return <>{String(field.value)}</>
}

// Statická metoda pro extrakci selection
Field.getSelection = (props: FieldProps<unknown>): SelectionFieldMeta => ({
  fieldName: props.field.__fieldName,
  path: props.field.__path,
  isArray: false,
})
```

```tsx
// HasMany komponenta
interface HasManyProps<T> {
  field: HasManyRef<T>
  children: (item: EntityRef<T>, index: number) => ReactNode
  filter?: Filter
  orderBy?: OrderBy
  limit?: number
}

export function HasMany<T>({ field, children, ...params }: HasManyProps<T>) {
  // Runtime: iteruj přes reálná data
  return <>{field.map((item, index) => children(item, index))}</>
}

// Statická metoda - zavolá children s collector proxy pro sběr nested fields
HasMany.getSelection = (
  props: HasManyProps<unknown>,
  collectNested: (children: ReactNode) => SelectionMeta
): SelectionFieldMeta => {
  // Vytvoř collector pro nested entity
  const nestedSelection = new SelectionMeta()
  const nestedCollector = createCollectorProxy(nestedSelection, props.field.__path)

  // Zavolej children jednou pro sběr
  const syntheticChildren = props.children(nestedCollector, 0)

  // Analyzuj výsledný JSX
  const nested = collectNested(syntheticChildren)

  return {
    fieldName: props.field.__fieldName,
    path: props.field.__path,
    isArray: true,
    nested,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
  }
}
```

```tsx
// HasOne komponenta
interface HasOneProps<T> {
  field: HasOneRef<T>
  children: (entity: EntityRef<T>) => ReactNode
}

export function HasOne<T>({ field, children }: HasOneProps<T>) {
  // Vytvoř nested accessor
  const nestedAccessor: EntityRef<T> = {
    id: field.id,
    fields: field.fields,
  }
  return <>{children(nestedAccessor)}</>
}

HasOne.getSelection = (
  props: HasOneProps<unknown>,
  collectNested: (children: ReactNode) => SelectionMeta
): SelectionFieldMeta => {
  const nestedSelection = new SelectionMeta()
  const nestedCollector = createCollectorProxy(nestedSelection, props.field.__path)

  const syntheticChildren = props.children(nestedCollector)
  const nested = collectNested(syntheticChildren)

  return {
    fieldName: props.field.__fieldName,
    path: props.field.__path,
    isArray: false,
    nested,
  }
}
```

### Entity komponenta - orchestrace

```tsx
interface EntityProps<K extends keyof Schema> {
  name: K
  id: string
  children: (entity: EntityRef<Schema[K]>) => ReactNode
}

export function Entity<K extends keyof Schema>({
  name,
  id,
  children
}: EntityProps<K>) {
  const adapter = useBackendAdapter()
  const [state, setState] = useState<
    | { phase: 'collecting' }
    | { phase: 'fetching'; selection: SelectionMeta }
    | { phase: 'ready'; selection: SelectionMeta; data: Schema[K] }
  >({ phase: 'collecting' })

  // Phase 1: Collection
  useEffect(() => {
    if (state.phase === 'collecting') {
      const selection = new SelectionMeta()
      const collector = createCollectorProxy<Schema[K]>(selection)

      // Zavolej children s collector proxy
      const jsx = children(collector)

      // Analyzuj JSX pro komponenty s getSelection
      analyzeJsx(jsx, selection)

      setState({ phase: 'fetching', selection })
    }
  }, [state.phase])

  // Phase 2: Fetch
  useEffect(() => {
    if (state.phase === 'fetching') {
      const query = buildQueryFromSelection(state.selection)

      adapter.fetchOne(name, id, query).then(data => {
        setState({
          phase: 'ready',
          selection: state.selection,
          data: data as Schema[K]
        })
      })
    }
  }, [state.phase, name, id])

  // Loading
  if (state.phase !== 'ready') {
    return <Loading />
  }

  // Phase 3: Runtime render
  const accessor = createRuntimeAccessor(state.data, adapter.identityMap)
  return <>{children(accessor)}</>
}
```

### JSX Analyzer

```tsx
function analyzeJsx(node: ReactNode, selection: SelectionMeta): void {
  if (!node || typeof node !== 'object') return

  if (Array.isArray(node)) {
    node.forEach(child => analyzeJsx(child, selection))
    return
  }

  if (!('type' in node)) return

  const element = node as ReactElement

  // Fragment
  if (typeof element.type === 'symbol') {
    analyzeJsx(element.props.children, selection)
    return
  }

  // Host element (div, span)
  if (typeof element.type === 'string') {
    analyzeJsx(element.props.children, selection)
    return
  }

  const component = element.type as any

  // Komponenta s getSelection
  if ('getSelection' in component) {
    const fieldSelection = component.getSelection(
      element.props,
      (children: ReactNode) => {
        const nested = new SelectionMeta()
        analyzeJsx(children, nested)
        return nested
      }
    )
    selection.addFieldSelection(fieldSelection)
    return
  }

  // Jiná komponenta - analyzuj children
  analyzeJsx(element.props.children, selection)
}
```

---

## Type System

### Schema types

```ts
interface Schema {
  Author: {
    id: string
    name: string
    email: string
    bio?: string
    articles: Article[]
  }
  Article: {
    id: string
    title: string
    content: string
    publishedAt: Date | null
    author: Author
    tags: Tag[]
  }
  Tag: {
    id: string
    name: string
    color: string
  }
}
```

### Entity field types

```ts
// Rozlišení scalar vs relation polí
type ScalarKeys<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? never
    : T[K] extends object
      ? never
      : K
}[keyof T]

type HasManyKeys<T> = {
  [K in keyof T]: T[K] extends (infer U)[] ? K : never
}[keyof T]

type HasOneKeys<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? never
    : T[K] extends object
      ? K
      : never
}[keyof T]

// EntityFields type - vrací správný typ reference pro každé pole
type EntityFields<T> = {
  [K in ScalarKeys<T>]: FieldRef<T[K]>
} & {
  [K in HasManyKeys<T>]: HasManyRef<T[K] extends (infer U)[] ? U : never>
} & {
  [K in HasOneKeys<T>]: HasOneRef<T[K]>
}

// EntityRef - accessor s typed fields
interface EntityRef<T> {
  readonly id: string
  readonly fields: EntityFields<T>
}
```

### Použití s TypeScript

```tsx
// Plně typesafe!
<Entity name="Author" id="1">
  {author => (
    <>
      {/* author.fields.name je FieldRef<string> */}
      <Field field={author.fields.name} />

      {/* author.fields.email je FieldRef<string> */}
      <Field field={author.fields.email}>
        {field => <a href={`mailto:${field.value}`}>{field.value}</a>}
      </Field>

      {/* author.fields.articles je HasManyRef<Article> */}
      <HasMany field={author.fields.articles}>
        {article => (
          <>
            {/* article.fields.title je FieldRef<string> */}
            <Field field={article.fields.title} />

            {/* article.fields.publishedAt je FieldRef<Date | null> */}
            <Field field={article.fields.publishedAt}>
              {field => field.value && <time>{field.value.toISOString()}</time>}
            </Field>

            {/* article.fields.author je HasOneRef<Author> */}
            <HasOne field={article.fields.author}>
              {articleAuthor => (
                <Field field={articleAuthor.fields.name} />
              )}
            </HasOne>

            {/* article.fields.tags je HasManyRef<Tag> */}
            <HasMany field={article.fields.tags}>
              {tag => (
                <span style={{ color: tag.fields.color.value }}>
                  <Field field={tag.fields.name} />
                </span>
              )}
            </HasMany>
          </>
        )}
      </HasMany>

      {/* ❌ TypeScript error - 'nonexistent' neexistuje */}
      <Field field={author.fields.nonexistent} />

      {/* ❌ TypeScript error - 'articles' není scalar */}
      <Field field={author.fields.articles} />

      {/* ❌ TypeScript error - 'name' není has-many */}
      <HasMany field={author.fields.name}>
        {item => null}
      </HasMany>
    </>
  )}
</Entity>
```

---

## Conditional Rendering

### Problém

```tsx
{showBio && <Field field={author.fields.bio} />}
```

V collection phase je `showBio` třeba `false`, takže `author.fields.bio` se nikdy nezavolá a pole se nepřidá do selection.

### Řešení 1: Pole se vždy zaregistruje při přístupu

```tsx
// I když se Field nerenderuje, přístup k author.fields.bio
// zaregistruje pole do selection
const bio = author.fields.bio  // <- registrace proběhne zde
{showBio && <Field field={bio} />}
```

Ale to není elegantní...

### Řešení 2: If komponenta

```tsx
interface IfProps<T> {
  condition: boolean | FieldRef<boolean>
  then: ReactNode
  else?: ReactNode
}

export function If<T>({ condition, then: thenBranch, else: elseBranch }: IfProps<T>) {
  const conditionValue = typeof condition === 'boolean'
    ? condition
    : condition.value

  return conditionValue ? <>{thenBranch}</> : <>{elseBranch}</>
}

// V collection phase VŽDY analyzuj obě větve
If.getSelection = (props: IfProps<unknown>, collectNested) => {
  const thenSelection = collectNested(props.then)
  const elseSelection = props.else ? collectNested(props.else) : new SelectionMeta()

  // Merge obou větví
  return mergeSelections(thenSelection, elseSelection)
}
```

**Použití:**
```tsx
<Entity name="Author" id="1">
  {author => (
    <>
      <Field field={author.fields.name} />

      <If condition={showBio} then={
        <Field field={author.fields.bio} />
      } />

      {/* Nebo s condition z entity */}
      <If
        condition={author.fields.isPublished}
        then={<Field field={author.fields.publishedAt} />}
        else={<span>Draft</span>}
      />
    </>
  )}
</Entity>
```

---

## Příklady

### Základní použití

```tsx
<Entity name="Author" id="author-1">
  {author => (
    <div className="author-card">
      <h2><Field field={author.fields.name} /></h2>
      <p><Field field={author.fields.email} /></p>
    </div>
  )}
</Entity>
```

### Relace

```tsx
<Entity name="Article" id="article-1">
  {article => (
    <article>
      <h1><Field field={article.fields.title} /></h1>

      <HasOne field={article.fields.author}>
        {author => (
          <div className="author">
            By: <Field field={author.fields.name} />
          </div>
        )}
      </HasOne>

      <HasMany field={article.fields.tags}>
        {tag => (
          <span className="tag">
            <Field field={tag.fields.name} />
          </span>
        )}
      </HasMany>
    </article>
  )}
</Entity>
```

### Custom rendering

```tsx
<Entity name="Article" id="article-1">
  {article => (
    <>
      <Field field={article.fields.title}>
        {field => <h1 className="title">{field.value}</h1>}
      </Field>

      <Field field={article.fields.publishedAt}>
        {field => field.value && (
          <time dateTime={field.value.toISOString()}>
            Published: {formatDate(field.value)}
          </time>
        )}
      </Field>

      <Field
        field={article.fields.content}
        format={content => <div dangerouslySetInnerHTML={{ __html: content }} />}
      />
    </>
  )}
</Entity>
```

### Hluboké zanoření

```tsx
<Entity name="Author" id="author-1">
  {author => (
    <>
      <Field field={author.fields.name} />

      <HasMany field={author.fields.articles}>
        {article => (
          <div className="article">
            <Field field={article.fields.title} />

            <HasMany field={article.fields.comments}>
              {comment => (
                <div className="comment">
                  <Field field={comment.fields.content} />

                  <HasOne field={comment.fields.author}>
                    {commentAuthor => (
                      <span className="comment-author">
                        <Field field={commentAuthor.fields.name} />
                      </span>
                    )}
                  </HasOne>
                </div>
              )}
            </HasMany>
          </div>
        )}
      </HasMany>
    </>
  )}
</Entity>
```

---

## Srovnání

| Aspekt | Contember (string) | Tento návrh (typed ref) |
|--------|-------------------|-------------------------|
| Field prop | `field="name"` | `field={entity.fields.name}` |
| Type safety | ❌ Žádná | ✅ Plná |
| Autocomplete | ❌ Ne | ✅ Ano |
| Refactoring | ❌ Ruční | ✅ Automatické |
| Runtime cost | Minimální | Proxy overhead |
| Collection | Static analysis | Callback + analysis |

---

## Výhody

1. **Plná type safety** - TypeScript validuje všechny field references
2. **Autocomplete** - IDE nabízí dostupná pole
3. **Refactoring** - přejmenování polí funguje automaticky
4. **Collection funguje** - callback se zavolá s collector proxy
5. **Komponenty pro strukturu** - `<Field>`, `<HasMany>`, `<HasOne>`
6. **Conditional handling** - `<If>` komponenta analyzuje všechny větve

## Nevýhody

1. **Verbose** - `field={entity.fields.name}` je delší než `field="name"`
2. **Proxy overhead** - runtime cost na vytvoření proxy
3. **Callback required** - Entity musí mít children jako funkci
4. **Dva módy** - collector vs runtime může být matoucí

---

## Implementační plán

### Fáze 1: Type system
- [ ] `FieldRef<T>`, `HasManyRef<T>`, `HasOneRef<T>` types
- [ ] `EntityFields<T>` mapped type
- [ ] `EntityRef<T>` interface

### Fáze 2: Proxy implementace
- [ ] `createCollectorProxy()` - collection phase
- [ ] `createRuntimeAccessor()` - runtime phase
- [ ] `SelectionMeta` class

### Fáze 3: Komponenty
- [ ] `Field` s `getSelection`
- [ ] `HasMany` s `getSelection`
- [ ] `HasOne` s `getSelection`
- [ ] `Entity` orchestrace

### Fáze 4: JSX Analyzer
- [ ] `analyzeJsx()` funkce
- [ ] Rekurzivní traversal
- [ ] Selection merging

### Fáze 5: Helper komponenty
- [ ] `If` komponenta
- [ ] `Switch` / `Case`
- [ ] `Show` (pro nullable)
