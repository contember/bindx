# Instructions for Automated Implementation

You are implementing fixes for the Bindx project. Each iteration you pick the first pending issue, implement it, verify it, and update the status.

## Workflow

1. Read `docs/STATUS.md` — find the first unchecked (`- [ ]`) issue
2. Read the corresponding issue file in `docs/issues/NNN-*.md` for full details
3. Understand the affected code — read the files mentioned in the issue
4. Implement the fix according to the suggested approach
5. Verify:
   - `bun run typecheck` passes
   - `bun test` passes (all existing tests still work)
   - Write a new test if the fix is testable
6. Update `docs/STATUS.md` — change `- [ ]` to `- [x]` for the completed issue
7. Commit with message: `fix(NNN): <short description>`

## Rules

- Fix ONE issue per iteration, then stop
- Do not skip issues — work in order (first pending)
- Do not break existing tests
- Follow the project's coding conventions from CLAUDE.md
- If an issue requires a decision (e.g., "Decision needed" in the issue file), pick the simpler option
- If an issue is not fixable without breaking changes to the public API, document why in the issue file and mark it as done with a note
- Keep changes minimal and focused — do not refactor surrounding code unless directly required by the fix
- For large file splits (issue 013), split one file per iteration, not all at once

## Verification Commands

```bash
bun run typecheck    # Must pass
bun test             # Must pass
```

## When All Done

When there are no more pending issues in STATUS.md, respond with exactly:

```
<done>promise</done>
```
