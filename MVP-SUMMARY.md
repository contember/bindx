# Bindx MVP - Souhrn

## Co je hotové

### 1. ModelProxy - Type-safe query building
- Proxy-based systém pro sledování přístupů k polím
- Plná podpora pro skalární pole, nested objekty a pole (has-many)
- `UnwrapProxy<T>` utility type pro transformaci proxy typů na skutečné hodnoty

### 2. Fragment systém
- `defineFragment()` pro definici znovupoužitelných fragmentů
- Fragment kompozice pomocí `.compose()` metody
- `extractFragmentMeta()` pro extrakci metadat z fragmentů
- `buildQuery()` pro sestavení query specifikace z metadat

### 3. Accessory
- **FieldAccessor** - čtení/zápis skalárních hodnot
  - `value`, `serverValue`, `isDirty`
  - `setValue()` pro změnu hodnoty
  - `inputProps` vrací `{ value, setValue }`
- **EntityAccessor** - práce s entitami
  - `fields` - vnořené accessory (nested struktura)
  - `data` - aktuální data
  - `isDirty`, `isLoading`, `isPersisting`
  - `persist()`, `reset()`
- **EntityListAccessor** - has-many relace
  - `items` - pole `EntityListItem`
  - `length`, `isDirty`
  - `add()`, `remove()`, `move()`

### 4. Identity Map
- Sdílený stav entit napříč komponentami
- Prevence rozjetí stavu při výskytu stejné entity na více místech
- Subscribe/notify pattern pro reaktivní aktualizace

### 5. React integrace
- `BindxProvider` pro poskytnutí adaptéru a identity mapy
- `useEntity()` hook pro načtení a správu entity
- `createBindx<Schema>()` factory pro type-safe hooky s autocomplete názvů entit
- `isLoading()` type guard

### 6. Mock Adapter
- `MockAdapter` pro testování bez backendu
- Simulace `fetchOne()` a `persist()`

### 7. Projekt setup
- Monorepo s TypeScript project references
- `src/` - knihovna
- `example/` - ukázkové komponenty

---

## Co chybí (budoucí rozšíření)

### Kritické pro produkci
- [ ] **Error handling** - chybové stavy, error boundaries
- [ ] **Validace** - integrace s Zod nebo podobnou knihovnou
- [ ] **Optimistické updaty** - okamžitá UI reakce s rollbackem při chybě
- [ ] **useEntityList hook** - načítání seznamů entit (ne jen single entity)

### Backend integrace
- [ ] **GraphQL adapter** - reálný backend přes GraphQL
- [ ] **REST adapter** - alternativní REST API podpora
- [ ] **Subscription/real-time** - live updates z backendu

### Performance
- [ ] **Caching** - cachování responses
- [ ] **Debouncing** - debounced auto-persistence
- [ ] **Partial updates** - posílat jen změněná pole

### Developer experience
- [ ] **DevTools** - inspekce stavu, změn, identity mapy
- [ ] **Logging** - debug mode s logováním operací
- [ ] **Testy** - unit testy pro všechny komponenty

### Pokročilé funkce
- [ ] **Conditional fragments** - dynamické pole podle podmínek
- [ ] **Computed fields** - odvozené hodnoty
- [ ] **Undo/redo** - historie změn
- [ ] **Conflict resolution** - řešení konfliktů při concurrent edits

---

## Příklad použití

```typescript
// 1. Definice schématu (example/bindx.ts)
interface Schema {
  Article: Article
  Author: Author
  Tag: Tag
  Location: Location
}

export const { useEntity, isLoading } = createBindx<Schema>()

// 2. Definice fragmentu (example/fragments.ts)
export const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
  id: author.id,
  name: author.name,
  email: author.email,
}))

// 3. Použití v komponentě (example/components.tsx)
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
