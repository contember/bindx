# 026: Dirty detection silently drops fields from mutations

**Severity:** High
**Category:** Bug / Data integrity
**Status:** Open
**Supersedes:** round-1 #005 (`JSON.stringify` vs `deepEqual`), #007 (dual has-many state) — same family, different concrete defects

## Location

`packages/bindx/src/store/DirtyTracker.ts:67-80`, `isRelationValue` at `:105-114`

## Description

`getDirtyFields` has two independent holes:

```ts
for (const fieldName of Object.keys(data)) {          // (1) only iterates `data`
    if (fieldName === 'id') continue
    const currentValue = data[fieldName]
    const serverValue = serverData[fieldName]
    if (isRelationValue(currentValue) || isRelationValue(serverValue)) {
        continue                                       // (2) shape-based relation skip
    }
    if (!deepEqual(currentValue, serverValue)) dirtyFields.push(fieldName)
}
```

1. **Asymmetric key iteration** — only `Object.keys(data)` is walked. A field present in `serverData` but removed from `data` (set to `undefined`, or omitted by a partial update) is never compared → reported clean → omitted from the generated mutation.
2. **Value-shape relation detection** — `isRelationValue` treats any object with an `id` key, or any non-empty array whose first element is an object, as a relation and skips it. A legitimate scalar JSON column shaped like `{ id, … }` or an array-of-objects is therefore never reported dirty.

## Impact

Silent data loss on persist — the worst failure mode for a binding/persistence layer. JSON columns and cleared fields can be edited locally and never written to the server, with no error.

## Fix

1. Iterate the **union** of `Object.keys(data)` and `Object.keys(serverData)`.
2. Decide relation-vs-scalar from the **schema** (`SchemaRegistry.getScalarFields`), not the runtime value shape — the schema is already available to the dirty/collection layer.
