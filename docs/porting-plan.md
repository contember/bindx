# Porting Plan: Contember-OSS React Components to Bindx

## Overview

**Approach**: Redesign packages for bindx's handle-based architecture, selection builder, and immutable store.

**Goal**: Full feature parity following dependency order.

---

## Packages NOT Requiring Porting

Use these directly as dependencies from `@contember/*`:

| Package | Reason |
|---------|--------|
| `react-utils` | 100% pure React utilities (24 hooks), zero binding dependencies |
| `react-multipass-rendering` | Not needed - bindx has selection analysis in `analyzer.ts` |
| `react-richtext-renderer` | Pure renderer, no binding deps |
| `react-slots` | Pure utility, only depends on react-utils |
| `react-devbar` | Dev tooling, no binding deps |

---

## Phase 1: react-form

**Status**: ✅ DONE

**Package**: `@contember/bindx-form`

**Purpose**: Form validation, error display, field state management

### Components Ported

| Component | Purpose |
|-----------|---------|
| `FormFieldScope` | Wraps field with state context (htmlId, errors, dirty, required) |
| `FormHasOneRelationScope` | Wraps has-one relation with state context |
| `FormHasManyRelationScope` | Wraps has-many relation with state context |
| `FormInput` | Binds scalar fields to `<input>` elements |
| `FormCheckbox` | Binds boolean fields to checkbox |
| `FormRadioInput` | Binds fields to radio buttons |
| `FormLabel` | Auto-links to field via htmlId |
| `FormError` | Renders formatted field errors |
| `FormFieldStateProvider` | Low-level provider for custom scenarios |
| `SlotInput` | Radix Slot wrapper for inputs |

### Final File Structure

```
packages/bindx-form/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── contexts.ts
    ├── types.ts
    ├── hooks/
    │   ├── index.ts
    │   └── useFormInputHandler.ts
    └── components/
        ├── index.ts
        ├── FormFieldScope.tsx
        ├── FormHasOneRelationScope.tsx
        ├── FormHasManyRelationScope.tsx
        ├── FormFieldStateProvider.tsx
        ├── FormInput.tsx
        ├── FormCheckbox.tsx
        ├── FormRadioInput.tsx
        ├── FormLabel.tsx
        ├── FormError.tsx
        └── SlotInput.tsx
```

---

## Phase 2: react-repeater

**Status**: Not started

**Purpose**: Has-many list management with add/remove/move operations

### What Bindx Already Has

- `HasMany` component - basic iteration
- `EntityList` - root list with loading/error states
- `HasManyListHandle` - `items`, `add()`, `remove()`, `move()`

### Components to Port

| Component | Purpose |
|-----------|---------|
| `Repeater` | Main wrapper providing context |
| `RepeaterEachItem` | Iterates entities with render function |
| `RepeaterEmpty` | Renders when list is empty |
| `RepeaterNotEmpty` | Renders when list has items |
| `RepeaterAddItemTrigger` | Unstyled trigger to add items at position |
| `RepeaterRemoveItemTrigger` | Unstyled trigger to remove current item |
| `RepeaterMoveItemTrigger` | Unstyled trigger to reorder items |

### Features to Add

- `sortableBy` prop with order field repair (`repairEntitiesOrder`)
- `preprocess` callback for new entity initialization
- Context-based method access (`useRepeaterMethods`)
- Position options: `'first' | 'last' | number | 'previous' | 'next'`

### API Mapping

| react-binding | bindx |
|---------------|-------|
| `useEntityList()` | `HasManyListHandle` from parent entity |
| `EntityListAccessor` iteration | `handle.items.map()` |
| `sortEntities()` | Implement for bindx |
| `repairEntitiesOrder()` | Implement for bindx |

### Files to Create

```
packages/react-bindx/src/repeater/
├── Repeater.tsx
├── RepeaterEachItem.tsx
├── RepeaterEmpty.tsx
├── RepeaterNotEmpty.tsx
├── triggers/
│   ├── RepeaterAddItemTrigger.tsx
│   ├── RepeaterRemoveItemTrigger.tsx
│   └── RepeaterMoveItemTrigger.tsx
├── hooks/
│   ├── useRepeaterMethods.ts
│   └── useRepeaterSortedEntities.ts
├── contexts.ts
├── types.ts
└── index.ts
```

---

## Phase 3: react-dataview

**Status**: Not started

**Purpose**: Data tables with filtering, sorting, pagination, export

### Components to Port

**Core:**
- `DataView` / `ControlledDataView` - Root components with state management
- `DataViewEachRow` - Row iteration

**Filtering:**
- `DataViewTextFilter` - Text/string filtering
- `DataViewNumberFilter` - Numeric filtering
- `DataViewBooleanFilter` - Boolean filtering
- `DataViewDateFilter` - Date/datetime filtering
- `DataViewEnumFilter` - Enum filtering
- `DataViewHasOneFilter` - Has-one relation filtering
- `DataViewHasManyFilter` - Has-many relation filtering
- `DataViewNullFilterTrigger` - Null/not-null toggle

**Sorting:**
- `DataViewSortingTrigger` - Toggle sort direction
- `DataViewSortingSwitch` - Display current sort state

**Pagination:**
- `DataViewChangePageTrigger` - Navigate pages
- `DataViewSetItemsPerPageTrigger` - Change page size
- `DataViewPagingStateView` - Display paging info

**Visibility:**
- `DataViewLayout` - Define column layouts
- `DataViewVisibilityTrigger` - Toggle column visibility

**Infinite Scroll:**
- `DataViewInfiniteLoadProvider` - Container
- `DataViewInfiniteLoadEachRow` - Lazy-loaded rows
- `DataViewInfiniteLoadTrigger` - Load more trigger

### Core Hooks

- `useDataView` - Initialize state (filtering, sorting, paging)
- `useDataViewFiltering` - Filter state management
- `useDataViewSorting` - Sort state management
- `useDataViewPaging` - Pagination state
- `useDataViewTotalCount` - Count query

### API Mapping

| react-binding | bindx |
|---------------|-------|
| `EntityListSubTree` | `useEntityList()` with query options |
| `EntityListAccessor` | List handle |
| `QualifiedEntityList` | Bindx query spec with filter/orderBy/limit/offset |
| `createQueryBuilder()` | Bindx adapter count query |
| `Component` HOC (multipass) | NOT NEEDED - bindx has own selection |
| Markers for introspection | Schema registry |

### Architecture Notes

- State management (filter/sort/page) is generic - can largely reuse
- Query building needs adaptation to bindx query spec
- Drop multipass rendering - use bindx selection system
- Filter artifacts → GraphQL filter conversion is reusable

### Files to Create

```
packages/react-bindx/src/dataview/
├── components/
│   ├── DataView.tsx
│   ├── ControlledDataView.tsx
│   ├── DataViewEachRow.tsx
│   └── ...
├── filters/
│   ├── DataViewTextFilter.tsx
│   ├── DataViewNumberFilter.tsx
│   └── ...
├── sorting/
│   ├── DataViewSortingTrigger.tsx
│   └── DataViewSortingSwitch.tsx
├── paging/
│   └── ...
├── hooks/
│   ├── useDataView.ts
│   ├── useDataViewFiltering.ts
│   ├── useDataViewSorting.ts
│   └── useDataViewPaging.ts
├── contexts.ts
├── types.ts
└── index.ts
```

---

## Phase 4: react-select

**Status**: Not started

**Depends on**: Phase 2 (react-repeater), Phase 3 (react-dataview)

**Purpose**: Entity selection/picker for relations

### Components to Port

| Component | Purpose |
|-----------|---------|
| `Select` | Single entity selection (has-one) |
| `MultiSelect` | Multiple entity selection (has-many) |
| `SortableMultiSelect` | Ordered multi-select with DnD |
| `SelectDataView` | Integrates with dataview for options |
| `SelectOption` | Option with `data-selected` attribute |
| `SelectItemTrigger` | Click handler for selection |
| `SelectPlaceholder` | Empty state rendering |
| `SelectEachValue` | Iterate selected values |
| `SelectNewItem` | Create new entity inline |

### API Mapping

| react-binding | bindx |
|---------------|-------|
| `useEntity()` | Entity handle from context |
| `connectEntityAtField()` | `HasOneHandle.connect()` |
| `disconnectEntityAtField()` | `HasOneHandle.disconnect()` |
| `HasOne` / `HasMany` | Bindx `HasOne` / `HasMany` |
| `entity.id` comparison | Handle ID comparison |

### Files to Create

```
packages/react-bindx/src/select/
├── Select.tsx
├── MultiSelect.tsx
├── SortableMultiSelect.tsx
├── SelectDataView.tsx
├── SelectOption.tsx
├── SelectItemTrigger.tsx
├── SelectPlaceholder.tsx
├── SelectEachValue.tsx
├── SelectNewItem.tsx
├── contexts.ts
├── types.ts
└── index.ts
```

---

## Phase 5: react-uploader

**Status**: Not started

**Depends on**: Phase 2 (react-repeater)

**Purpose**: File upload to Contember S3

### Components to Port

| Component | Purpose |
|-----------|---------|
| `Uploader` | Single file upload |
| `MultiUploader` | Multiple files with repeater |
| `DiscriminatedUploader` | Type-based file handling |
| `UploaderBase` | Wrapper with HasOne |
| `UploaderEachFile` | Iterate upload states |
| `UploaderFileStateSwitch` | State-aware rendering |
| `UploaderHasFile` | Conditional rendering |

### Extractors (Reusable)

These extract metadata from uploaded files - mostly framework-agnostic:

- `getFileUrlDataExtractor` - URL extraction
- `getImageFileDataExtractor` - Image dimensions
- `getGenericFileMetadataExtractor` - File size, type
- `getAudioFileDataExtractor` - Audio duration
- `getVideoFileDataExtractor` - Video dimensions, duration

### API Mapping

| react-binding | bindx |
|---------------|-------|
| `useEntity()` | Entity handle |
| `entity.getField().updateValue()` | `FieldHandle.setValue()` |
| `entity.getEntity({ field })` | `HasOneHandle.entity` |
| `entity.disconnectEntityAtField()` | `HasOneHandle.disconnect()` |
| `entity.batchUpdates()` | Dispatcher batching |
| `useRepeaterMethods().addItem()` | Repeater handle `add()` |

### Reusable Parts (No Changes Needed)

- S3 upload client (`useS3Client`)
- Upload state management
- File preview generation
- Progress tracking

### Files to Create

```
packages/react-bindx/src/uploader/
├── components/
│   ├── Uploader.tsx
│   ├── MultiUploader.tsx
│   ├── DiscriminatedUploader.tsx
│   ├── UploaderBase.tsx
│   ├── UploaderEachFile.tsx
│   ├── UploaderFileStateSwitch.tsx
│   └── UploaderHasFile.tsx
├── extractors/
│   └── ... (copy from contember-oss)
├── hooks/
│   ├── useS3Client.ts
│   ├── useUploadState.ts
│   └── useFillEntity.ts
├── contexts.ts
├── types.ts
└── index.ts
```

---

## Phase 6: react-slate-editor

**Status**: Not started

**Purpose**: Rich text editing with Slate.js

### Packages

1. `react-slate-editor-base` - Slate.js foundation, utilities
2. `react-slate-editor` - Modern editor with plugins

### Components

- Editor container
- Toolbar with formatting buttons
- Block type plugins (heading, paragraph, list, quote, etc.)
- Inline plugins (bold, italic, link, etc.)
- Custom elements

### Binding Dependency

- Entity/field access for JSON content storage
- Map Slate value to/from field handle

### Files to Create

```
packages/react-bindx/src/slate-editor/
├── editor/
│   ├── SlateEditor.tsx
│   └── SlateEditorProvider.tsx
├── toolbar/
│   └── ...
├── plugins/
│   └── ...
├── hooks/
│   └── useSlateField.ts
└── index.ts
```

---

## Phase 7: DnD Integration

**Status**: Not started

**Depends on**: Phase 2 (react-repeater)

### react-repeater-dnd-kit

DnD sorting for repeater lists using `@dnd-kit`:

- `SortableRepeater` - Wrapper with DnD context
- `SortableRepeaterItem` - Draggable item wrapper
- `SortableRepeaterDragOverlay` - Drag preview

### react-board + react-board-dnd-kit

Kanban board with drag-and-drop:

- `Board` - Board container
- `BoardColumn` - Column container
- `BoardItem` - Draggable card
- DnD between columns

### Files to Create

```
packages/react-bindx/src/repeater-dnd/
├── SortableRepeater.tsx
├── SortableRepeaterItem.tsx
├── SortableRepeaterDragOverlay.tsx
└── index.ts

packages/react-bindx/src/board/
├── Board.tsx
├── BoardColumn.tsx
├── BoardItem.tsx
├── board-dnd/
│   └── ...
└── index.ts
```

---

## Phase 8: Block Repeater

**Status**: Not started

**Depends on**: Phase 2 (react-repeater), Phase 7 (DnD)

**Purpose**: Block-based content for CMS (discriminated union of block types)

### Components

- `BlockRepeater` - Main container
- `Block` - Individual block with type discrimination
- Block type definitions

### Notes

- Original uses multipass for block type analysis
- Replace with bindx selection system
- Integrate with DnD for block reordering

---

## Phase 9: Higher-Level Features (Lower Priority)

### react-identity

Auth components - depends on tenant client decisions.

### react-routing

URL routing with entity binding - may need custom approach.

### react-client-tenant / react-client-content

API clients - bindx has own adapter system, evaluate if needed.

---

## Bindx Patterns Reference

### Field Access

```typescript
const entity = useEntity('Article', { id }, e => e.title());
entity.fields.title.value;
entity.fields.title.setValue('new');
entity.fields.title.isDirty;
entity.fields.title.errors;
```

### Has-One Relations

```typescript
entity.fields.author.entity?.fields.name.value;
entity.fields.author.connect(authorId);
entity.fields.author.disconnect();
```

### Has-Many Relations

```typescript
entity.fields.tags.items.map(tag => tag.fields.name.value);
entity.fields.tags.add({ name: 'new tag' });
entity.fields.tags.remove(tagId);
entity.fields.tags.move(fromIndex, toIndex);
```

### Event Interceptors

```typescript
useIntercept('fieldChanging', (event) => {
  if (!isValid) {
    event.preventDefault();
  }
});

useIntercept('entityPersisting', (event) => {
  // Validate before save
});
```

---

## General Approach for Each Phase

1. Identify binding integration points in original code
2. Map to bindx handle equivalents
3. Remove multipass-rendering dependencies (use bindx selection)
4. Keep UI/state logic that's framework-agnostic
5. Write tests using bindx's MockAdapter
6. Document API differences from original

---

## Lessons Learned from Phase 1 (react-form)

### Package Naming

- Use `@contember/bindx-*` naming convention for all new packages
- This allows parallel shipping with old `@contember/react-*` packages
- Example: `@contember/bindx-form`, `@contember/bindx-react`
- Folder names should match: `packages/bindx-form/`, `packages/bindx-react/`

### TypeScript Types

#### Use Proper Ref Types from bindx

**Wrong:**
```typescript
interface FormInputProps {
  field: { value: unknown; setValue: (v: unknown) => void }
}
```

**Correct:**
```typescript
import type { FieldRef, HasOneRef, HasManyRef } from '@contember/bindx'

interface FormInputProps<T = string> {
  readonly field: FieldRef<T>
}
```

#### Generic Components with Type Defaults

For components that work with different field types:

```typescript
// Props with generic type parameter and sensible default
export interface FormInputProps<T = string> {
  readonly field: FieldRef<T>
  readonly formatValue?: (value: T | null) => string
  readonly parseValue?: (value: string) => T | null
}

// Component implementation
export function FormInput<T = string>({
  field,
  formatValue,
  parseValue,
}: FormInputProps<T>): ReactElement {
  // Internal casting may be needed for hook compatibility
  const handler = useFormInputHandler({
    formatValue: formatValue as ((value: unknown) => string) | undefined,
    parseValue: parseValue as ((value: string) => unknown) | undefined,
  })
  // ...
}
```

#### Variance Issues with `FieldRef<unknown>`

`FieldRef<unknown>` causes TypeScript errors due to contravariance in `setValue`:

```typescript
// This FAILS:
interface Props {
  field: FieldRef<unknown>  // FieldHandle<string> not assignable!
}

// Solution 1: Use FieldRef<any> for props accepting any field type
interface FormFieldScopeProps {
  readonly field: FieldRef<any>
}

// Solution 2: Use generics with default
interface FormInputProps<T = string> {
  readonly field: FieldRef<T>
}
```

### Testing

#### Use MockAdapter, NOT Mock Objects

**Wrong** - manually creating mock field objects:
```typescript
const mockField = {
  value: 'test',
  setValue: vi.fn(),
  errors: [],
  isDirty: false,
}
```

**Correct** - use real `useEntity` with `MockAdapter`:
```typescript
const adapter = new MockAdapter({
  Article: [{ id: 'article-1', title: 'Test Article' }],
}, { delay: 0 })

function TestComponent() {
  const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())
  if (article.isLoading) return <div>Loading...</div>
  return <FormInput field={article.title}><input /></FormInput>
}

render(
  <BindxProvider adapter={adapter} schema={schema}>
    <TestComponent />
  </BindxProvider>
)
```

#### Avoid State Changes During Render

**Memory leak** - calling `setValue`/`addError` during render:
```typescript
function TestComponent() {
  const article = useEntity(...)
  article.title.setValue('new')  // WRONG! Infinite re-render loop
  return <div />
}
```

**Correct** - use event handlers or effects:
```typescript
function TestComponent() {
  const article = useEntity(...)
  return (
    <button onClick={() => article.title.setValue('new')}>
      Change
    </button>
  )
}
```

#### Wait for Loading State

Always handle loading state in tests:
```typescript
await waitFor(() => {
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
})
```

### Package Structure

#### Dependencies

Form package depends only on core bindx:
```json
{
  "dependencies": {
    "@contember/bindx": "workspace:*",
    "@radix-ui/react-slot": "^1.2.4"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  }
}
```

#### tsconfig.json References

Each package references its dependencies:
```json
{
  "references": [
    { "path": "../bindx" }
  ]
}
```

Root tsconfig.json must list packages in dependency order:
```json
{
  "references": [
    { "path": "./packages/bindx" },
    { "path": "./packages/bindx-form" },
    { "path": "./packages/bindx-react" }
  ]
}
```

#### tests/tsconfig.json Paths

Add path mappings for all packages:
```json
{
  "paths": {
    "@contember/bindx": ["../packages/bindx/src/index.ts"],
    "@contember/bindx-form": ["../packages/bindx-form/src/index.ts"],
    "@contember/bindx-react": ["../packages/bindx-react/src/index.ts"]
  },
  "references": [
    { "path": "../packages/bindx" },
    { "path": "../packages/bindx-form" },
    { "path": "../packages/bindx-react" }
  ]
}
```

### Component Patterns

#### Radix Slot Pattern

Use `@radix-ui/react-slot` for composable components:

```typescript
import { Slot } from '@radix-ui/react-slot'

export function FormInput({ field, children }: FormInputProps) {
  return (
    <Slot
      value={field.value ?? ''}
      onChange={e => field.setValue(e.target.value)}
      data-invalid={field.errors.length > 0 ? '' : undefined}
    >
      {children}
    </Slot>
  )
}

// Usage - props merge with child
<FormInput field={entity.title}>
  <input className="my-input" placeholder="Enter title" />
</FormInput>
```

#### Data Attributes

Use empty string for boolean data attributes (HTML spec):

```typescript
function dataAttribute(value: boolean): '' | undefined {
  return value ? '' : undefined
}

// Usage
<input data-invalid={dataAttribute(hasErrors)} />
```

#### Context with Optional Access

```typescript
// Context that may not be present
export const FormFieldStateContext = createContext<FormFieldState | undefined>(undefined)

// Optional hook
export function useFormFieldState(): FormFieldState | undefined {
  return useContext(FormFieldStateContext)
}

// Required hook with clear error
export function useRequiredFormFieldState(): FormFieldState {
  const state = useFormFieldState()
  if (!state) {
    throw new Error('useRequiredFormFieldState must be used within FormFieldScope')
  }
  return state
}
```

### API Mapping Summary

| react-binding | bindx | Notes |
|---------------|-------|-------|
| `useField({ field })` | Pass `FieldRef` as prop | No need for accessor pattern |
| `accessor.value` | `field.value` | Direct property access |
| `accessor.updateValue(v)` | `field.setValue(v)` | Method name change |
| `accessor.hasUnpersistedChanges` | `field.isDirty` | Property name change |
| `accessor.errors?.errors` | `field.errors` | Already array |
| `accessor.addError()` | `field.addError()` | Same |
| `accessor.clearErrors()` | `field.clearErrors()` | Same |
| `accessor.getParent().name` | `field[FIELD_REF_META].entityType` | Via symbol |
| `accessor.fieldName` | `field[FIELD_REF_META].fieldName` | Via symbol |
| `accessor.schema.nullable` | Not needed - handle metadata | Schema in registry |
| `useEntityBeforePersist()` | `useIntercept('entityPersisting')` | Event system |
| `Component<Props>()` HOC | Regular React component | No multipass |

### Common Gotchas

1. **Don't re-export from bindx-react** - keep packages independent
2. **Field values can be null** - always handle `value ?? ''` for inputs
3. **Use `{ delay: 0 }` in MockAdapter** for synchronous tests
4. **Run `bun install` after adding workspace dependencies**
5. **Check tsconfig references order** - dependencies must come first
