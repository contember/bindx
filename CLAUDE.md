# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Type check
bun run typecheck

# Run all tests
bun test

# Run a specific test file
bun test tests/useEntity.test.tsx

# Run tests matching a pattern
bun test --grep "pattern"

# Watch mode for development
bun run dev

# Run the example playground
bun run playground
```

## Architecture Overview

Bindx is a type-safe data binding framework for React, designed to work with Contember CMS. The monorepo contains two main packages:

### Package Structure

- **`@contember/bindx`** (`packages/bindx`) - Framework-agnostic core
- **`@contember/react-bindx`** (`packages/react-bindx`) - React bindings and hooks

### Core Concepts

**Schema Definition** (`packages/bindx/src/schema/`)
- Define entity schemas with `defineSchema()`, `scalar()`, `hasOne()`, `hasMany()`
- `SchemaRegistry` manages schema metadata and relation lookups

**Snapshot Store** (`packages/bindx/src/store/SnapshotStore.ts`)
- Central immutable data store using frozen snapshots
- Entity-level subscriptions for fine-grained React reactivity
- Tracks both current data and server data for dirty detection
- Keyed by `"entityType:id"` for entities, `"entityType:id:fieldName"` for relations

**Handles** (`packages/bindx/src/handles/`)
- `EntityHandle` - Stable reference to an entity with cached field/relation handles
- `FieldHandle` - Access to a single scalar field with `value`, `setValue()`, `inputProps`
- `HasOneHandle` - Access to has-one relations with `connect()`, `disconnect()`, `entity`
- `HasManyListHandle` - Access to has-many relations with `items`, `map()`, `add()`, `remove()`
- Handles implement `EntityRef`, `FieldRef`, `HasOneRef`, `HasManyRef` interfaces

**Selection Builder** (`packages/bindx/src/selection/`)
- Fluent API for selecting entity fields: `e => e.id().title().author(a => a.name())`
- Builds `SelectionMeta` which is converted to `QuerySpec` for fetching

**Backend Adapters** (`packages/bindx/src/adapter/`)
- `BackendAdapter` interface for data fetching/persistence
- `MockAdapter` - In-memory store for testing
- `ContemberAdapter` - Connects to Contember GraphQL API

### React Integration (`packages/react-bindx/`)

**createBindx()** (`src/hooks/createBindx.ts`)
- Factory that creates typed hooks for a schema: `useEntity`, `useEntityList`, `Entity`, `createComponent`

**Hooks Pattern**
- `useEntity(entityType, { id }, selectionDefiner)` returns `EntityAccessorResult` (loading/error/ready states)
- Uses `useSyncExternalStore` internally for store subscriptions
- `BindxProvider` / `ContemberBindxProvider` provide context with store, dispatcher, adapter

**JSX Components** (`src/jsx/`)
- `Entity`, `Field`, `HasOne`, `HasMany`, `If`, `Show` components
- `createComponent()` for defining reusable components with selection props
- Selection is analyzed from JSX to auto-generate GraphQL queries

### Data Flow

1. Define schema with `defineSchema()`
2. Create hooks with `createBindx(schema)`
3. Use `useEntity()` with selection definer - builds query, fetches via adapter
4. Data stored in `SnapshotStore` as immutable snapshots
5. Handles provide stable access to data with change tracking
6. Mutations dispatch actions through `ActionDispatcher`
7. `PersistenceManager` / `MutationCollector` generate Contember mutations

## Testing

Tests use Bun's test runner with `@testing-library/react` and `happy-dom` for DOM simulation. Test preload is configured in `bunfig.toml`.

## TypeScript Configuration

- Strict mode enabled with `noUncheckedIndexedAccess`
- Module resolution: `bundler`
- Project references for packages in `tsconfig.json`


## Architectural Principles

- **Single Responsibility**: One module/class = one clear purpose
- **Separation of Concerns**: Split presentation, business logic, and data layers
- **Dependency Inversion**: Depend on interfaces, not implementations
- **Composition over Inheritance**: Prefer composition and small, focused types

## Code Organization

- **By Feature/Domain**: Group by feature, not by type (`users/`, `orders/` not `controllers/`, `services/`)
- **Layer Separation**: Clear boundaries between UI, domain logic, and data access
- **File Size**: Keep files under ~300 lines
- **Module Boundaries**: Related code together, unrelated code apart

## TypeScript Best Practices

- **No `any`**: Use `unknown` or proper types instead
- **No Type Casting**: Avoid `as` - use type guards and narrowing
- **Explicit Return Types**: Always define return types for functions
- **Interface over Type**: Prefer `interface` for object shapes (extensible)
- **Discriminated Unions**: For variants/state machines
- **Generic Constraints**: Make generics meaningful (`T extends User` not just `T`)
- **Strict Mode**: Enable all strict TypeScript flags

## Functions

- **Keep Small**: Under 20-30 lines
- **Single Task**: One function = one thing
- **Max 3 Parameters**: Use config object for more
- **Pure When Possible**: Avoid side effects
- **Return Early**: Use guard clauses

## Naming

- **Descriptive**: `getUserById` not `get`
- **Consistent Terminology**: One word per concept
- **Booleans**: Use `is`, `has`, `can`, `should`
- **Functions**: Verbs (`calculate`, `fetch`)
- **Types/Interfaces**: Nouns (`User`, `Config`)
- **No Abbreviations**: Write fully (except HTTP, URL, etc.)

## Best Practices

- **DRY**: Extract common logic
- **KISS**: Simple over clever
- **YAGNI**: Don't add unused features
- **Fail Fast**: Validate early
- **Self-Documenting**: Clear names over comments

## Components (React/Frontend)

- **Small Components**: Under ~200 lines
- **Props Interface**: Always explicit types
- **Composition**: Break down complex UIs
- **Custom Hooks**: Extract complex logic
- **No Prop Drilling**: Use composition or context

## Error Handling

- **Specific Errors**: Custom error types
- **Never Empty Catch**: Always handle or log
- **Type Errors**: Make error types explicit

## Testability

- **Inject Dependencies**: Constructor/function parameters
- **Pure Functions**: Easier to test
- **Clear Interfaces**: Mock through interfaces
- **Small Units**: Easier to test in isolation

## Anti-Patterns to Avoid

- ❌ God Classes (do everything classes)
- ❌ Tight Coupling (modules knowing too much)
- ❌ Type Assertions (`as`)
- ❌ `any` type
- ❌ Deep Nesting (> 3 levels)
- ❌ Copy-Paste Code

## This is WIP
- project is work in progress, do not be afraid to refactor anything, or make BC breaks
- do not create back compatible code, do not keep deprecated stuff
- yet, design everything in the manner of best practices with best possible architecture for given task
