# Bindx - Architektura a dokumentace

## Přehled projektu

**Bindx** je type-safe React data binding framework - TypeScript knihovna umožňující deklarativní data fetching a mutace s plnou typovou bezpečností, kompozibilitou a vynikajícím developer experience. Je navržen jako backend-agnostický a pracuje s jakýmkoliv zdrojem dat přes adapter pattern.

## Klíčové principy

- **Runtime-first**: Veškerá kompozice fragmentů a sestavování queries probíhá za běhu, ne při kompilaci
- **Plná typová bezpečnost**: Typy modelu proudí přes query builder → fragment → accessory s kompletní inferencí
- **Backend agnostický**: Funguje s GraphQL, REST, tRPC nebo jakýmkoliv zdrojem dat přes adapter
- **Deklarativní mutace**: Komponenty deklarují datové závislosti; framework řeší persistenci
- **Two-way binding**: Čtení i zápis přes stejné accessor API
- **Kompozibilní fragmenty**: Komponenty exportují fragmenty, které rodičovské komponenty skládají
- **Žádné magic strings**: Proxy-based query builder místo dot-separated cest k polím

## Struktura projektu

```
src/
├── proxy/                  # Type-safe query building pomocí Proxy pattern
│   ├── createModelProxy.ts # Vytváří proxy sledující přístup k polím
│   └── types.ts           # ModelProxy<T>, ModelProxyArray, UnwrapProxy typy
│
├── fragment/              # Deklarativní datové závislosti
│   ├── defineFragment.ts  # Definice a kompozice fragmentů
│   ├── types.ts           # Fragment, FragmentMeta, FragmentDefiner typy
│   └── buildQuery.ts      # Převod fragment metadata na query spec
│
├── accessors/             # Abstrakce pro čtení/zápis dat
│   ├── FieldAccessor.ts   # Accessor pro jedno skalární pole
│   ├── EntityAccessor.ts  # Accessor pro strukturovaný objekt
│   ├── EntityListAccessor.ts # Accessor pro has-many relace
│   └── types.ts           # Veřejné interface definice
│
├── adapter/               # Abstrakce backendu
│   ├── types.ts           # BackendAdapter interface
│   └── MockAdapter.ts     # In-memory test/development adapter
│
├── hooks/                 # React integrace
│   ├── BackendAdapterContext.tsx # Provider a context hooky
│   ├── useEntity.ts       # Hook pro fetch a správu entit
│   └── createBindx.ts     # Factory pro type-safe bindx hooky
│
├── store/                 # State management
│   └── IdentityMap.ts     # Sdílený stav entit napříč komponentami
│
└── index.ts               # Hlavní entry point knihovny

example/                   # Demonstrační komponenty
├── types.ts              # Příkladové doménové modely
├── bindx.ts              # Schema definice a type-safe hook factory
├── fragments.ts          # Znovupoužitelné definice fragmentů
├── components.tsx        # Třívrstvé komponenty
├── mockData.ts           # Testovací data
└── App.tsx               # Demo aplikace

tests/                     # Testovací suite
├── accessors.test.ts     # Testy chování accessorů
├── useEntity.test.tsx    # Integrační testy hooků
├── queryBuilding.test.ts # Testy převodu fragment-to-query
└── setup.ts              # Setup testovacího prostředí
```

## Klíčové abstrakce

### 1. ModelProxy - Type-safe query building

Proxy-based systém pro sledování přístupů k polím. Používá JavaScript Proxy k zachycení přístupů k vlastnostem a budování stromu závislostí.

**Typy:**
- `ModelProxyScalar<T>` - Terminální uzly pro skalární pole
- `ModelProxyArray<T>` - Pole s `.map()` metodou
- `ModelProxyArrayResult<R>` - Výsledek array.map()
- `UnwrapProxy<T>` - Rozbalí proxy typy na skutečné datové typy

**Použití:**
```typescript
const proxy = createModelProxy<Article>()
proxy.title                     // Sleduje přístup
proxy.author.name               // Vnořený přístup
proxy.tags.map(t => t.name)    // Mapování pole
```

### 2. Fragment systém - Znovupoužitelné datové závislosti

Definuje která pole načíst z entit pomocí ModelProxy, s podporou kompozice.

**Klíčové funkce:**
- `defineFragment()` - Vytváří znovupoužitelné definice fragmentů
- `extractFragmentMeta()` - Extrahuje runtime metadata o přistupovaných polích
- `mergeFragmentMeta()` - Kombinuje metadata fragmentů
- `buildQuery()` - Převádí metadata na backend query spec

**Použití:**
```typescript
const AuthorFragment = defineFragment((a: ModelProxy<Author>) => ({
  id: a.id,
  name: a.name,
  email: a.email,
}))

// Kompozice do rodiče:
const article = useEntity('Article', { id }, e => ({
  title: e.title,
  author: AuthorFragment.compose(e.author),
}))
```

### 3. Accessory - API pro čtení/zápis dat

Tříúrovňová hierarchie pro přístup a modifikaci dat entit:

#### FieldAccessor<T>
Jedno skalární pole.
- Vlastnosti: `value`, `serverValue`, `isDirty`, `inputProps`
- Metody: `setValue()`
- Sleduje lokální změny vs. server state

#### EntityAccessor<TData>
Strukturovaný objekt.
- Vlastnosti: `id`, `fields`, `data`, `isDirty`, `isLoading`, `isPersisting`
- Metody: `persist()`, `reset()`
- Koordinuje child accessory

#### EntityListAccessor<TData>
Has-many relace.
- Vlastnosti: `items[]`, `length`, `isDirty`
- Metody: `add()`, `remove()`, `move()`
- Každý item má `key`, `entity`, `fields`, `remove()`

**Mapování typů:**
```typescript
AccessorFromShape<T>:
- T[K] je Array<obj>  → EntityListAccessor<obj>
- T[K] je object      → EntityAccessor<obj>
- T[K] je skalár      → FieldAccessor<T[K]>
```

### 4. IdentityMap - Sdílený stav entit

Zajišťuje, že entity se stejným ID sdílejí stejný stav napříč komponentami.

**Klíčové metody:**
- `getOrCreate()` - Získá nebo vytvoří záznam entity
- `updateField()`, `updateFields()` - Aktualizuje stav entity
- `setServerData()` - Aktualizuje po fetch/persist
- `subscribe()` - Poslouchá změny
- `reset()` - Resetuje na server state

### 5. BackendAdapter - Abstrakce backendu

Interface pro implementaci backendových připojení:

```typescript
interface BackendAdapter {
  fetchOne(entityType, id, query): Promise<Record>
  fetchMany?(entityType, query, filter): Promise<Record[]>
  persist(entityType, id, changes): Promise<void>
  create?(entityType, data): Promise<Record>
  delete?(entityType, id): Promise<void>
}
```

**MockAdapter implementace:**
- In-memory data store
- Simulace network delay
- Field projection
- Deep merge pro persistenci

### 6. React integrace - Hooky a Context

**BindxProvider** - Context provider poskytující `BackendAdapter` a `IdentityMap`

**useEntity()** - Hlavní hook
- Načítá entitu podle ID s definicí fragmentu
- Vrací `EntityAccessor<T>` nebo `LoadingEntityAccessor<T>`
- Podporuje inline i pre-defined fragmenty

**createBindx<Schema>()** - Factory funkce
- Vytváří type-safe hooky se schema-based autocomplete
- Vrací `{ useEntity, isLoading }`
- Názvy entit se automaticky doplňují
- Typy modelů automaticky inferovány

## Tok dat

```
Schema Definition
  ↓
createBindx<Schema>() vytváří type-safe hooky
  ↓
useEntity<'Article'>() načítá data
  ├─ Definice fragmentu: (e: ModelProxy<Article>) => ({ ... })
  ├─ ModelProxy sleduje přístupy k vlastnostem
  ├─ extractFragmentMeta() buduje strom metadat
  ├─ buildQuery() vytváří query spec
  └─ adapter.fetchOne() načítá z backendu
      ↓
      Data vrácena → EntityAccessor<T> vytvořen
      ↓
Komponenta přijímá EntityAccessor
  ├─ Přístup přes: accessor.fields.title (FieldAccessor)
  ├─ Nebo: accessor.fields.author (EntityAccessor pro nested)
  ├─ Nebo: accessor.fields.tags (EntityListAccessor pro pole)
  └─ Modifikace přes: field.setValue(), tags.add(), atd.
      ↓
Změny sledovány přes accessory
  ├─ FieldAccessor.isDirty porovnání
  ├─ EntityAccessor.collectChanges()
  └─ EntityListAccessor sleduje add/remove/reorder
      ↓
persist() zavolán
  ├─ adapter.persist() posílá změny
  └─ commitChanges() aktualizuje server state
```

## Vrstvy komponent

Framework podporuje tři odlišné typy komponent:

### 1. Leaf Components (Model-Unaware)
- Přijímají `FieldAccessor<T>` nebo `EntityAccessor<T>` jako props
- Žádná znalost datového modelu nebo backendu
- Čistě prezentační (TextInput, NumberInput, CoordinatePicker)

### 2. Fragment Components (Model-Aware)
- Znají strukturu modelu, ale ne jak ho načíst
- Exportují definice fragmentů (AuthorEditor, LocationEditor)
- Přijímají odpovídající accessory v props
- Skládají fragmenty z child komponent

### 3. Entity Components (Query Definers)
- Definují co načíst přes `useEntity()`
- Skládají fragmenty z child komponent
- Řídí lifecycle persistence (ArticleEditor)
- Detekují a zpracovávají loading states

## Příklad použití

```typescript
// 1. Definice schématu
interface Schema {
  Article: Article
  Author: Author
  Tag: Tag
}

export const { useEntity, isLoading } = createBindx<Schema>()

// 2. Definice fragmentu
export const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
  id: author.id,
  name: author.name,
  email: author.email,
}))

// 3. Použití v komponentě
function ArticleEditor({ id }: { id: string }) {
  const article = useEntity('Article', { id }, e => ({
    title: e.title,
    content: e.content,
    author: AuthorFragment.compose(e.author),
    tags: e.tags.map(tag => TagFragment.compose(tag)),
  }))

  if (isLoading(article)) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <input
        value={article.fields.title.value ?? ''}
        onChange={e => article.fields.title.setValue(e.target.value)}
      />
      <AuthorEditor author={article.fields.author} />
      <TagListEditor tags={article.fields.tags} />
      <button onClick={() => article.persist()}>Save</button>
    </div>
  )
}
```

## Klíčové typové vlastnosti

1. **Entity name autocomplete** - `useEntity('A...')` napovídá `'Article' | 'Author' | ...`
2. **Automatická inference modelu** - callback `e` je automaticky typován podle entity name
3. **Fragment result typing** - `article.fields.title` je `FieldAccessor<string>`
4. **Nested accessor typing** - `article.fields.author.fields.name` je správně typovaný
5. **List accessor typing** - `article.fields.tags.items[0].entity` je `EntityAccessor<TagFragment>`

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

**Inference over annotation** - nech TypeScript inferovat typy kde je to možné. Explicitní anotace pouze když:
- Je to součást public API
- Inference by byla příliš široká
- Zlepšuje to čitelnost

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

1. **Typové transformace** - ověř že `UnwrapProxy`, `AccessorFromShape` atd. fungují správně
2. **Accessor chování** - `setValue`, `isDirty`, `persist`, `reset`
3. **Fragment kompozice** - že se metadata správně mergují
4. **Edge cases** - prázdné pole, null hodnoty, deeply nested struktury
5. **React hooks** - loading states, re-rendering, cleanup

```typescript
describe('EntityListAccessor', () => {
  test('add should preserve existing items', () => {
    const { accessor } = createTestListAccessor([{ name: 'A' }])
    accessor.add({ name: 'B' })

    expect(accessor.items).toHaveLength(2)
    expect(accessor.items[0]?.fields.name.value).toBe('A')
    expect(accessor.items[1]?.fields.name.value).toBe('B')
  })

  test('remove should handle last item', () => {
    const { accessor } = createTestListAccessor([{ name: 'Only' }])
    accessor.items[0]!.remove()

    expect(accessor.items).toHaveLength(0)
    expect(accessor.isDirty).toBe(true)
  })

  test('move should handle edge indices', () => {
    const { accessor } = createTestListAccessor([
      { name: 'A' }, { name: 'B' }, { name: 'C' }
    ])

    // Move first to last
    accessor.move(0, 2)
    expect(accessor.items.map(i => i.fields.name.value)).toEqual(['B', 'C', 'A'])
  })
})
```

#### Spouštění testů

```bash
# Všechny testy
bun test

# Konkrétní soubor
bun test tests/accessors.test.ts

# Watch mode
bun test --watch

# S verbose výstupem
bun test --verbose
```

### Konvence kódu

#### Pojmenování

- **Typy a interfaces**: PascalCase (`ModelProxy`, `FieldAccessor`)
- **Funkce a proměnné**: camelCase (`createModelProxy`, `extractFragmentMeta`)
- **Konstanty**: SCREAMING_SNAKE_CASE pouze pro skutečné konstanty
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

### Debugging

Pro debugging v testech:

```typescript
test('debug example', () => {
  const result = someFunction(input)
  console.log('Result:', JSON.stringify(result, null, 2))
  expect(result).toBeDefined()
})
```

Pro MockAdapter s debug logováním:

```typescript
const adapter = new MockAdapter(data, { delay: 0, debug: true })
```

## MVP Status

### Hotové
- ModelProxy s plnou typovou inferencí
- Fragment systém s kompozicí
- Tříúrovňová hierarchie accessorů
- IdentityMap pro sdílený stav
- React hooks integrace
- MockAdapter pro testování
- Type-safe hook factory (createBindx)
- Dirty tracking a persistence
- List operace (add, remove, reorder)

### TODO pro produkci
- Error handling a error boundaries
- Validace (integrace se Zod)
- Optimistické updaty s rollbackem
- useEntityList hook pro batch fetching
- Reálné backend adaptery (GraphQL, REST)
- Subscriptions/real-time updates
- Caching strategie
- Auto-persistence s debouncing
- DevTools a debugging
- Kompletní testovací pokrytí
