# 020: Selection doesn't react to conditional field access

**Severity:** Minor
**Category:** Limitation
**Reported by:** delta

## Location

`packages/bindx-react/src/hooks/useEntityCore.ts`

## Description

`useSelectionCollection` memoizes the selection on `[entityType, entityId]` only. If a component accesses different fields conditionally, the selection from the first render won't include fields accessed in later renders:

```tsx
// Only `title` is in the selection after first render
// `internalNotes` never gets fetched even when isAdmin becomes true
const article = useEntity('Article', { id }, e => e.title())

return (
    <div>
        <h1>{article.title.value}</h1>
        {isAdmin && <p>{article.internalNotes.value}</p>}  {/* undefined! */}
    </div>
)
```

## Impact

- Fields accessed conditionally may not be fetched
- Silent data absence — no error, just `undefined`

## Fix

Options:
1. Document the limitation — always declare all possible fields in the selection definer
2. Add a way to declare "possible" fields upfront
3. Re-collect selection when accessed fields change (complex, may cause waterfalls)
