# Status — Round 2

Open issues from the current architecture review. See [issues.md](issues.md) for the index.

## P0 — Correctness / data integrity

- [ ] 025 — Non-atomic persist: partial failure leaves committed entities dirty
- [ ] 026 — Dirty detection silently drops fields from mutations
- [ ] 027 — Persist-lifecycle events never fire; async interceptors silently dropped
- [ ] 028 — MockAdapter diverges from ContemberAdapter

## P1 — Reactivity / architecture

- [ ] 029 — Global version counter defeats fine-grained reactivity
- [ ] 030 — "Stable handle" contract broken — handles rebuilt on every change
- [ ] 031 — EntityHandle subscription omits relation changes → stale `$isDirty`
- [ ] 032 — Memory leaks — parent-child graph, batcher listeners, timers, item handles

## P2 — Hygiene / maintainability

- [ ] 033 — Dead / duplicate code
- [ ] 034 — God objects, large files, too-weak dependency sort
- [ ] 035 — Type-safety erosion — `as`/`any` reintroduced
- [ ] 036 — JSX conditional under-selection + HasMany duplicate over-fetch

## Concurrency / undo

- [ ] 037 — Render-phase store mutations risk tearing under concurrent React
- [ ] 038 — Undo restores partial state and can desync across persist rekey

---

**Round 1 (1–24):** all resolved during the `createBindx → entityDef` refactor; issue files removed (referenced a deleted file layout). Lineage preserved via **Supersedes** notes in round-2 issues.
