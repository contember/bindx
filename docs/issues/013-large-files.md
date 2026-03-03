# 013: Large files exceeding 300-line guideline

**Severity:** Code Quality
**Category:** Maintainability
**Reported by:** all four agents

## Locations

| File | Lines | Guideline |
|------|-------|-----------|
| `packages/bindx/src/store/SnapshotStore.ts` | ~2200 | 300 |
| `packages/bindx/src/handles/EntityHandle.ts` | ~1700 | 300 |
| `packages/bindx-react/src/jsx/proxy.ts` | ~1200 | 300 |
| `packages/bindx-react/src/jsx/componentBuilder.ts` | ~550 | 300 |

## Description

These files have grown organically and violate the project's own CLAUDE.md guideline of ~300 lines per file. Each file handles multiple distinct responsibilities.

## Suggested Splits

### SnapshotStore.ts (~2200 lines)
- `SnapshotStore.ts` — core entity CRUD and snapshot management
- `SubscriptionManager.ts` — entity-level subscription tracking and notification
- `ErrorStore.ts` — field/entity/relation error tracking
- `RelationStore.ts` — has-one / has-many relation state management

### EntityHandle.ts (~1700 lines)
- `EntityHandle.ts` — entity core and proxy access
- `FieldHandleCache.ts` — field handle caching and creation
- `RelationHandleCache.ts` — relation handle caching and creation

### proxy.ts (~1200 lines)
- `collectorProxy.ts` — collection-phase proxy (analyzes JSX tree)
- `runtimeProxy.ts` — runtime-phase proxy (provides values)
- `inlineProxy.ts` — inline proxy variant

### componentBuilder.ts (~550 lines)
- `componentBuilder.ts` — builder logic and fluent API
- `componentFactory.ts` — component creation and wrapping
