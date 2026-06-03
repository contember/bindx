# Bindx Issues — Round 2

Architecture review of the core (`@contember/bindx`) + React (`@contember/bindx-react`) binding layers, reflecting the **current** codebase (post `createBindx → entityDef` refactor and the package split).

> **Round 1 (issues 1–24)** was a prior review consolidated from four reports. All 24 were resolved during the big refactor and their issue files referenced a file layout that no longer exists (`useEntityImpl.ts`, `createBindx.tsx`, `PersistenceManager.ts`, `useEntityCore.ts`, `roles/`, the 1200-line `proxy.ts`), so they were removed. Where a round-1 issue still has a live residual, the relevant round-2 issue carries a **Supersedes** note.

## P0 — Correctness / data integrity

| # | Issue | Area | Supersedes |
|---|-------|------|-----------|
| [025](issues/025-non-atomic-persist-partial-failure.md) | Non-atomic persist — partial failure leaves committed entities dirty | persistence | — |
| [026](issues/026-dirty-detection-gaps.md) | Dirty detection silently drops fields from mutations | store | #005, #007 |
| [027](issues/027-persist-events-dead-async-interceptors-dropped.md) | Persist-lifecycle events never fire; async interceptors silently dropped | events/dispatch | #008 |
| [028](issues/028-mock-adapter-divergence.md) | MockAdapter diverges from ContemberAdapter — tests pass against wrong semantics | adapter | — |

## P1 — Reactivity / architecture

| # | Issue | Area | Supersedes |
|---|-------|------|-----------|
| [029](issues/029-global-version-defeats-reactivity.md) | Global version counter defeats fine-grained reactivity | store/react | — |
| [030](issues/030-stable-handle-contract-broken.md) | "Stable handle" contract broken — handles rebuilt on every change | handles/react | — |
| [031](issues/031-entity-subscription-omits-relations.md) | EntityHandle subscription omits relation changes → stale `$isDirty` | handles | — |
| [032](issues/032-memory-leaks.md) | Memory leaks — parent-child graph, batcher listeners, timers, item handles | store/react | #019 |

## P2 — Hygiene / maintainability

| # | Issue | Area | Supersedes |
|---|-------|------|-----------|
| [033](issues/033-dead-and-duplicate-code.md) | Dead / duplicate code (violates "no deprecated stuff" rule) | multiple | #006, #011 |
| [034](issues/034-god-objects-and-large-files.md) | God objects, large files, and a too-weak dependency sort | persistence/react | #013 |
| [035](issues/035-type-safety-erosion.md) | Type-safety erosion — `as`/`any` reintroduced | multiple | #014, #015, #016 |
| [036](issues/036-jsx-conditional-underselection-and-overfetch.md) | JSX conditional under-selection (silent) + HasMany duplicate over-fetch | jsx | #020 |

## Concurrency / undo

| # | Issue | Area | Supersedes |
|---|-------|------|-----------|
| [037](issues/037-render-phase-store-mutations.md) | Render-phase store mutations risk tearing under concurrent React | handles/react | — |
| [038](issues/038-undo-partial-restore-and-rekey-desync.md) | Undo restores partial state and can desync across persist rekey | store/undo | — |
