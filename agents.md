# Bindx - Architektura a dokumentace

## Přehled projektu

**Bindx** je type-safe React data binding framework - TypeScript knihovna umožňující deklarativní data fetching a mutace s plnou typovou bezpečností, kompozibilitou a vynikajícím developer experience. Je navržen jako backend-agnostický a pracuje s jakýmkoliv zdrojem dat přes adapter pattern.

## Klíčové principy

- **Two-pass rendering**: JSX je nejprve analyzován pro sběr závislostí, pak renderován s reálnými daty
- **Plná typová bezpečnost**: Typy modelu proudí přes schema → komponenty → handles s kompletní inferencí
- **Backend agnostický**: Funguje s GraphQL, REST, tRPC nebo jakýmkoliv zdrojem dat přes adapter
- **Deklarativní mutace**: Komponenty deklarují datové závislosti; framework řeší persistenci
- **Two-way binding**: Čtení i zápis přes stejné handle API
- **Immutable snapshots**: Všechna data jsou ukládána jako immutable objekty pro efektivní React rendering
- **Žádné magic strings**: Proxy-based field access místo dot-separated cest k polím

## Struktura projektu

```
src/
├── jsx/                   # JSX komponenty a two-pass rendering systém
│   ├── components/        # Entity, Field, HasMany, HasOne, If, Show
│   ├── analyzer.ts        # Analyzuje JSX strom pro sběr field selections
│   ├── proxy.ts           # Collector proxy (collection phase) a runtime accessor
│   ├── SelectionMeta.ts   # Buduje a merguje selection metadata
│   └── types.ts           # FieldRef, HasManyRef, HasOneRef, EntityRef typy
│
├── handles/               # Stabilní handle objekty pro přístup k datům
│   ├── EntityHandle.ts    # Přístup k entitě s field/relation handles
│   ├── FieldHandle.ts     # Scalar field accessor s dirty tracking
│   ├── BaseHandle.ts      # Základní třída s dispose a subscription
│   └── types.ts           # EntityFields, InputProps typy
│
├── store/                 # Immutable snapshot storage
│   ├── SnapshotStore.ts   # Entity/relation snapshots s fine-grained subscriptions
│   ├── snapshots.ts       # Snapshot datové struktury
│   └── IdentityMap.ts     # Legacy identity map (zpětná kompatibilita)
│
├── core/                  # Centrální state management
│   ├── ActionDispatcher.ts # Centralizuje mutace přes actions
│   ├── actions.ts         # Kompletní set Redux-like action types
│   ├── PersistenceManager.ts # Persistence s concurrency control
│   ├── EntityLoader.ts    # Non-React služba pro načítání entit
│   └── SelectionResolver.ts # Převádí selection metadata na query specs
│
├── schema/                # Entity schema definice
│   ├── SchemaRegistry.ts  # Runtime schema storage a validace
│   └── types.ts           # defineSchema, scalar(), hasOne(), hasMany()
│
├── selection/             # Query selection building
│   ├── createFragment.ts  # Fragment definice s kompozicí
│   ├── createSelectionBuilder.ts # Fluent API pro building selections
│   ├── buildQuery.ts      # Převod selection metadata na backend query
│   └── types.ts           # SelectionMeta, QuerySpec, FluentFragment
│
├── accessors/             # Legacy accessor systém
│   ├── FieldAccessor.ts   # Accessor pro skalární pole
│   ├── EntityAccessor.ts  # Accessor pro entity
│   ├── EntityListAccessor.ts # Accessor pro has-many relace
│   └── types.ts           # AccessorFromShape, FieldAccessor interfaces
│
├── adapter/               # Abstrakce backendu
│   ├── types.ts           # BackendAdapter interface
│   └── MockAdapter.ts     # In-memory test/development adapter
│
├── hooks/                 # React integrace
│   ├── BackendAdapterContext.tsx # BindxProvider a context hooky
│   └── createBindx.ts     # Factory pro type-safe bindx hooky
│
└── index.ts               # Hlavní entry point knihovny

example/                   # Demonstrační komponenty
├── types.ts               # Příkladové doménové modely
├── bindx.ts               # Schema definice a exports
├── schema.ts              # Schema konfigurace
├── components/            # Ukázkové komponenty
│   └── examples/          # AuthorSimpleExample, ArticleDetailExample
└── mockData.ts            # Testovací data

tests/                     # Testovací suite
├── jsx/                   # Testy JSX komponent
├── handles/               # Testy handle systému
├── store/                 # Testy SnapshotStore
└── setup.ts               # Setup testovacího prostředí
```

## Klíčové abstrakce

### 1. Two-Pass Rendering System

Bindx používá dvoufázový rendering pro automatický sběr datových závislostí:

**Fáze 1 - Collection**: JSX je renderován s collector proxy, který zachycuje přístupy k polím.

**Fáze 2 - Runtime**: Po načtení dat je JSX renderován s reálnými daty.

```tsx
<Entity name="Author" id={authorId}>
  {author => (
    <div>
      {/* Collection: proxy zachytí přístup k author.fields.name */}
      {/* Runtime: zobrazí reálnou hodnotu */}
      <Field field={author.fields.name} />

      <HasMany field={author.fields.articles}>
        {article => <Field field={article.fields.title} />}
      </HasMany>
    </div>
  )}
</Entity>
```

### 2. JSX Komponenty

Framework poskytuje sadu komponent pro deklarativní data binding:

#### Entity
Kořenová komponenta - orchestruje two-pass rendering.
- Props: `name`, `id`, `children`, `loading?`, `error?`, `notFound?`
- Fáze: Collection → Loading → Ready

#### Field
Zobrazuje hodnotu skalárního pole.
- Props: `field`, `children?` (custom render)
- Automaticky přistupuje k `field.value`

#### HasMany
Iteruje přes has-many relaci.
- Props: `field`, `children`, `limit?`
- Child callback dostává `(item, index)`

#### HasOne
Přistupuje k has-one relaci.
- Props: `field`, `children`
- Child callback dostává related entity accessor

#### If / Show
Podmíněné renderování.
- `If`: `condition`, `then`, `else?`
- `Show`: `field`, `children`, `fallback?`

### 3. Handle System

Handles poskytují stabilní přístup k datům s caching pro zachování identity:

#### EntityHandle<T>
Přístup k entitě s jejími poli a relacemi.
```typescript
class EntityHandle<T> {
  id: string
  type: string
  data: T | null
  serverData: T | undefined
  isLoaded: boolean
  isLoading: boolean
  isError: boolean
  isDirty: boolean
  isPersisting: boolean

  field<K>(name: K): FieldHandle<T[K]>
  hasOne<R>(name: string): HasOneHandle<R>
  hasMany<R>(name: string): HasManyListHandle<R>
  fields: EntityFields<T>  // Proxy pro typovaný přístup

  reset(): void
  commit(): void
}
```

#### FieldHandle<T>
Přístup k skalárnímu poli.
```typescript
class FieldHandle<T> {
  value: T | null
  serverValue: T | null
  isDirty: boolean
  inputProps: InputProps<T>  // Pro input binding

  setValue(value: T): void
}
```

#### HasOneHandle<T>
Přístup k has-one relaci.
```typescript
class HasOneHandle<T> {
  id: string | null
  state: 'connected' | 'disconnected' | 'deleted' | 'creating'
  entity: EntityHandle<T> | null
  fields: EntityFields<T>
  isDirty: boolean

  connect(targetId: string): void
  disconnect(): void
  delete(): void
  reset(): void
}
```

#### HasManyListHandle<T>
Přístup k has-many relaci.
```typescript
class HasManyListHandle<T> {
  items: EntityHandle<T>[]
  length: number
  isDirty: boolean

  map<R>(fn: (handle, index) => R): R[]
  add(data?: Partial<T>): void
  remove(key: string): void
}
```

### 4. SnapshotStore - Immutable State Management

Centrální úložiště s immutable snapshots pro React integraci:

```typescript
class SnapshotStore {
  // Entity snapshots
  getEntitySnapshot<T>(type, id): EntitySnapshot<T> | undefined
  setEntityData<T>(type, id, data, isServerData): EntitySnapshot<T>
  updateEntityFields<T>(type, id, updates): EntitySnapshot<T> | undefined
  setFieldValue(type, id, fieldPath, value): void
  commitEntity(type, id): void
  resetEntity(type, id): void

  // Load states
  getLoadState(type, id): EntityLoadState | undefined
  setLoadState(type, id, status, error?): void
  isPersisting(type, id): boolean
  setPersisting(type, id, isPersisting): void

  // Relation states
  getRelation(parentType, parentId, fieldName): StoredRelationState | undefined
  setRelation(parentType, parentId, fieldName, updates): void
  commitRelation(parentType, parentId, fieldName): void
  resetRelation(parentType, parentId, fieldName): void

  // Subscriptions (fine-grained reactivity)
  subscribeToEntity(type, id, callback): () => void
  subscribeToRelation(parentType, parentId, fieldName, callback): () => void
  subscribe(callback): () => void  // Global
}
```

### 5. ActionDispatcher - Centralized Mutations

Všechny mutace procházejí přes actions:

```typescript
// Field actions
setField(entityType, entityId, fieldPath, value)

// Entity actions
resetEntity(entityType, entityId)
commitEntity(entityType, entityId)
setEntityData(entityType, entityId, data, isServerData)

// Relation actions
connectRelation(entityType, entityId, fieldName, targetId)
disconnectRelation(entityType, entityId, fieldName)
deleteRelation(entityType, entityId, fieldName)

// Load state actions
setLoadState(entityType, entityId, status, error?)
setPersisting(entityType, entityId, isPersisting)

// List actions
addToList(entityType, entityId, fieldName, itemData, itemKey?)
removeFromList(entityType, entityId, fieldName, itemKey)
moveInList(entityType, entityId, fieldName, fromIndex, toIndex)
```

### 6. Schema System

Type-safe schema definice s helper funkcemi:

```typescript
// Schema definice
const schema = defineSchema<{
  Author: Author
  Article: Article
  Tag: Tag
}>({
  entities: {
    Author: {
      fields: {
        id: scalar(),
        name: scalar(),
        email: scalar(),
        bio: scalar(),
        articles: hasMany('Article', { inverse: 'author' }),
      }
    },
    Article: {
      fields: {
        id: scalar(),
        title: scalar(),
        content: scalar(),
        publishedAt: scalar(),
        author: hasOne('Author', { inverse: 'articles' }),
        tags: hasMany('Tag'),
        location: hasOne('Location'),
      }
    },
    // ...
  }
})

// SchemaRegistry pro runtime lookup
const registry = new SchemaRegistry(schema)
registry.getFieldDef('Author', 'name')      // { type: 'scalar' }
registry.getRelationTarget('Author', 'articles') // 'Article'
```

### 7. BackendAdapter - Backend Abstraction

```typescript
interface BackendAdapter {
  fetchOne(entityType, id, query, options?): Promise<Record | null>
  fetchMany?(entityType, query, filter?): Promise<Record[]>
  persist(entityType, id, changes): Promise<void>
  create?(entityType, data): Promise<Record>
  delete?(entityType, id): Promise<void>
}

// MockAdapter pro testování
const adapter = new MockAdapter(initialData, { delay: 100 })
```

### 8. React Integration

**BindxProvider** - Context provider:
```tsx
<BindxProvider adapter={adapter} schema={schema}>
  <App />
</BindxProvider>
```

**Hooks**:
```typescript
useBackendAdapter()   // BackendAdapter instance
useSnapshotStore()    // SnapshotStore instance
useDispatcher()       // ActionDispatcher instance
usePersistence()      // PersistenceManager instance
useBindxContext()     // Celý context (store, dispatcher, adapter)
```

**createBindx<Schema>()** - Type-safe hook factory:
```typescript
const { useEntity, useEntityList } = createBindx<Schema>()

const article = useEntity('Article', { id }, e => ({
  title: e.title,
  author: AuthorFragment.compose(e.author),
}))
```

## Tok dat

```
Schema Definition + JSX Component
  ↓
Entity component mounts
  ├─ Collection phase: Render JSX with collector proxy
  ├─ analyzeJsx() extracts field selections
  ├─ buildQueryFromSelection() creates query spec
  └─ adapter.fetchOne() loads data
      ↓
  SnapshotStore receives data
      ├─ setEntityData() creates immutable snapshot
      ├─ setLoadState('success')
      └─ notifyEntitySubscribers()
          ↓
  useSyncExternalStore triggers re-render
      ↓
  Runtime phase: Render JSX with real data
      ├─ createRuntimeAccessor() provides data access
      ├─ Field components display values
      └─ HasMany/HasOne navigate relations
          ↓
  User modifies data via handles
      ├─ field.setValue() dispatches SET_FIELD action
      ├─ ActionDispatcher processes action
      ├─ SnapshotStore creates new snapshot
      └─ Subscribers notified → re-render
          ↓
  persist() called
      ├─ PersistenceManager collects changes (data vs serverData diff)
      ├─ adapter.persist() sends to backend
      └─ commitEntity() updates serverData
```

## Příklad použití

```tsx
import { Entity, Field, HasMany, HasOne, Show } from 'bindx'

function AuthorDetail({ authorId }: { authorId: string }) {
  return (
    <Entity name="Author" id={authorId}>
      {author => (
        <div className="author-card">
          {/* Scalar field */}
          <h2><Field field={author.fields.name} /></h2>

          {/* Field with custom render */}
          <Field field={author.fields.email}>
            {field => <a href={`mailto:${field.value}`}>{field.value}</a>}
          </Field>

          {/* Optional field with fallback */}
          <Show field={author.fields.bio} fallback={<p>No bio</p>}>
            {bio => <p>{bio}</p>}
          </Show>

          {/* Has-many relation */}
          <HasMany field={author.fields.articles} limit={5}>
            {(article, index) => (
              <article key={article.id}>
                <h4>{index + 1}. <Field field={article.fields.title} /></h4>

                {/* Nested has-one */}
                <HasOne field={article.fields.location}>
                  {location => <span><Field field={location.fields.label} /></span>}
                </HasOne>

                {/* Nested has-many */}
                <HasMany field={article.fields.tags}>
                  {tag => (
                    <span
                      className="tag"
                      style={{ backgroundColor: tag.fields.color.value ?? undefined }}
                    >
                      <Field field={tag.fields.name} />
                    </span>
                  )}
                </HasMany>
              </article>
            )}
          </HasMany>
        </div>
      )}
    </Entity>
  )
}

// Editace s two-way binding
function AuthorEdit({ authorId }: { authorId: string }) {
  return (
    <Entity
      name="Author"
      id={authorId}
      loading={<div>Loading...</div>}
      error={err => <div>Error: {err.message}</div>}
    >
      {author => (
        <form>
          <input
            type="text"
            value={author.fields.name.value ?? ''}
            onChange={e => author.fields.name.setValue(e.target.value)}
          />
          {author.fields.name.isDirty && <span>*</span>}

          <textarea
            value={author.fields.bio.value ?? ''}
            onChange={e => author.fields.bio.setValue(e.target.value)}
          />

          {author.isDirty && <button type="button">Save</button>}
        </form>
      )}
    </Entity>
  )
}
```

## Klíčové typové vlastnosti

1. **Entity name autocomplete** - `<Entity name="A...">` napovídá `'Article' | 'Author' | ...`
2. **Field access typing** - `author.fields.name` je `FieldHandle<string>`
3. **Relation typing** - `author.fields.articles` je `HasManyRef<Article>`
4. **Nested field typing** - `article.fields.author.fields.name` je správně typovaný
5. **Custom render typing** - `{field => field.value}` má správný typ value

## Vývojový návod

### Tooling

Projekt používá **Bun** jako runtime a package manager.

```bash
# Instalace závislostí
bun install

# Build projektu
bun run build

# Typecheck (bez emitování)
bun run typecheck

# Spuštění testů
bun test

# Watch mode pro vývoj
bun run dev
```

### TypeScript konfigurace

Projekt používá striktní TypeScript nastavení:
- `strict: true` - všechny striktní kontroly
- `noUncheckedIndexedAccess: true` - indexování vždy vrací `T | undefined`
- `noImplicitOverride: true` - explicitní `override` keyword
- `noPropertyAccessFromIndexSignature: true` - nutnost `['key']` pro index signatures

### Principy vývoje

#### 1. Dokonalá typová bezpečnost

**Žádné `any`** - nikdy nepoužívej `any`. Pokud potřebuješ neznámý typ, použij `unknown` a type guards.

**Žádné type assertions** (`as`) pokud to není absolutně nutné. Místo toho:
- Použij type guards (`is` functions)
- Použij generické typy
- Zlepši inferenci typů

**Inference over annotation** - nech TypeScript inferovat typy kde je to možné.

```typescript
// Špatně
const items: Array<Item> = data.map((x: unknown) => x as Item)

// Správně
function isItem(x: unknown): x is Item {
  return typeof x === 'object' && x !== null && 'id' in x
}
const items = data.filter(isItem)
```

#### 2. Robustní návrh

**Immutabilita** - preferuj immutable operace. Nikdy nemutuj vstupní data.

```typescript
// Špatně
function addItem(items: Item[], item: Item) {
  items.push(item)
  return items
}

// Správně
function addItem(items: readonly Item[], item: Item): Item[] {
  return [...items, item]
}
```

**Explicitní stavy** - používej discriminated unions pro stavy místo boolean flags.

```typescript
// Špatně
interface State {
  isLoading: boolean
  isError: boolean
  data: Data | null
  error: Error | null
}

// Správně
type State =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: Data }
```

**Fail fast** - validuj vstupy na hranicích (public API, adaptery). Uvnitř knihovny předpokládej validní data.

**Composition over inheritance** - preferuj kompozici funkcí a objektů před třídními hierarchiemi.

#### 3. Refaktoring v rámci MVP

**Žádná zpětná kompatibilita** - v rámci MVP fáze neřešíme zpětnou kompatibilitu. Můžeš libovolně:
- Měnit API a signatury funkcí
- Přejmenovávat typy a funkce
- Odstraňovat nepotřebný kód
- Reorganizovat strukturu souborů

**Čistý kód** - odstraň mrtvý kód, nepoužívané exporty, zakomentovaný kód.

**Jednoduchý design** - neimplementuj funkce "pro budoucnost". Implementuj pouze to, co je aktuálně potřeba.

### Testování

#### Struktura testů

Testy jsou v `tests/` adresáři a používají Bun test runner.

```typescript
import { describe, test, expect } from 'bun:test'

describe('FeatureName', () => {
  test('should do something specific', () => {
    // Arrange
    const input = createTestInput()

    // Act
    const result = featureFunction(input)

    // Assert
    expect(result).toEqual(expectedOutput)
  })
})
```

#### Setup pro React testy

Pro testy React komponent používáme `@testing-library/react` s Happy DOM:

```typescript
// tests/setup.ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()
```

#### Co testovat důkladně

1. **Handle chování** - `setValue`, `isDirty`, subscription
2. **JSX komponenty** - Collection phase, runtime rendering
3. **SnapshotStore** - Immutability, subscriptions, state transitions
4. **Action processing** - ActionDispatcher behavior
5. **Edge cases** - Prázdné relace, null hodnoty, nested struktury

```typescript
describe('FieldHandle', () => {
  test('setValue should mark field as dirty', () => {
    const { store, dispatcher, handle } = createTestFieldHandle('name', 'John')
    handle.setValue('Jane')

    expect(handle.value).toBe('Jane')
    expect(handle.serverValue).toBe('John')
    expect(handle.isDirty).toBe(true)
  })
})

describe('Entity component', () => {
  test('should collect field selections from JSX', async () => {
    const { container } = render(
      <Entity name="Author" id="1">
        {author => <Field field={author.fields.name} />}
      </Entity>
    )

    // Verify collection phase extracted 'name' field
    // Verify runtime phase displays correct value
  })
})
```

### Konvence kódu

#### Pojmenování

- **Typy a interfaces**: PascalCase (`EntityHandle`, `FieldHandle`)
- **Funkce a proměnné**: camelCase (`createCollectorProxy`, `collectSelection`)
- **Konstanty**: SCREAMING_SNAKE_CASE pro symboly a konstanty (`FIELD_REF_META`)
- **Soubory**: camelCase pro implementace, PascalCase pro React komponenty

#### Organizace souborů

```
feature/
├── index.ts          # Public exports
├── types.ts          # Typy a interfaces
├── implementation.ts # Hlavní implementace
└── utils.ts          # Pomocné funkce (pokud jsou potřeba)
```

#### Exporty

- Exportuj pouze to, co je součástí public API
- Interní implementace neexportuj nebo označ jako `@internal`
- `index.ts` slouží jako barrel file pro public API

```typescript
// src/feature/index.ts
export type { PublicType } from './types.js'
export { publicFunction } from './implementation.js'
// internalHelper is NOT exported
```

### Workflow pro nové funkce

1. **Definuj typy** - začni s TypeScript typy a interfaces
2. **Napiš testy** - definuj očekávané chování
3. **Implementuj** - napiš implementaci tak, aby testy prošly
4. **Typecheck** - ověř `bun run typecheck`
5. **Refaktoruj** - zlepši kód, zjednodušuj, odstraň duplicity

## MVP Status

### Hotové
- Two-pass rendering system (Collection + Runtime)
- JSX komponenty (Entity, Field, HasMany, HasOne, If, Show)
- Handle systém (EntityHandle, FieldHandle, HasOneHandle, HasManyListHandle)
- SnapshotStore s immutable snapshots
- ActionDispatcher pro centralizované mutace
- Schema systém s type-safe definicemi
- React hooks integrace (BindxProvider, useBindxContext)
- MockAdapter pro testování
- Type-safe hook factory (createBindx)
- Dirty tracking a basic persistence

### TODO pro produkci
- PersistenceManager - plná implementace s optimistic updates
- Error handling a error boundaries
- Validace (integrace se Zod)
- useEntityList hook pro batch fetching
- Reálné backend adaptery (GraphQL, REST)
- Subscriptions/real-time updates
- Caching strategie
- Auto-persistence s debouncing
- DevTools a debugging
- Kompletní testovací pokrytí
