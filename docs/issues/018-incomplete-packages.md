# 018: Incomplete packages with TODOs

**Severity:** Code Quality
**Category:** Completeness
**Reported by:** beta

## Locations

- `packages/bindx-form/src/components/FormFieldScope.tsx:41, 47`
- `packages/bindx-uploader/`
- `packages/bindx-generator/`

## Description

Several satellite packages are incomplete:

### bindx-form
Has TODO comments indicating unfinished features:
```typescript
enumName: undefined, // TODO: get from schema if needed
// TODO: Could get nullable from SchemaRegistry if needed
```

### bindx-uploader
Minimal implementation. File upload with S3 integration exists but is not fully fleshed out.

### bindx-generator
Schema generation tools — incomplete.

## Impact

- Consumers may try to use these packages and hit unimplemented functionality
- Maintenance burden for code that doesn't deliver value yet
- Unclear boundary between "shipped" and "experimental"

## Decision Needed

For each package: ship (complete it), defer (mark as experimental), or drop (remove it).
