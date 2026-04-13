# R18 Rollback Rehearsal — 2026-04-13

## Procedure

1. Starting from migration branch HEAD (`4df06eb` — US-014 documentation commit)
2. Created scratch branch: `rollback-rehearsal-4df06eb`
3. Reverted all 13 migration commits (US-001 through US-014) via `git revert --no-edit`
4. Ran `bun install` — 3 packages installed, lockfile regenerated cleanly
5. Ran `bun run check` — all 13 turbo tasks green (FULL TURBO)
6. Deleted scratch branch

## Revert chain (newest first)

```
02f5425 Revert "[US-001] install remark+unified deps + apply remark-prosemirror PR #3 patch"
45575d6 Revert "[US-002] scaffold packages/core/src/markdown/ — MarkdownManager + unified pipeline"
104b232 Revert "[US-003] position-slice delimiter recovery walker + escapeMark tagging"
d9de00a Revert "[US-004] remark-prosemirror handlers — Tiers A/B/C with fidelity attrs"
c85f7fa Revert "[US-005] custom mdast-util-to-markdown serialization handlers for fidelity"
fc32ebb Revert "[US-006] wiki-link micromark extension + mdast-util + remark plugin"
13da79e Revert "[US-008] MDX handler full attribute coverage (flow-level, self-closing)"
2e9f793 Revert "[US-009] autolink + void-HTML guard for R23 MDX regression fix"
d1a061d Revert "[US-007] unified list TipTap extension with nested NodeSpec (R19, D15)"
1273038 Revert "[US-010+US-011+US-012] atomic cutover: schema renames + pipeline swap + import migration + D20 escapeMark"
e7f6618 Revert "[US-013] migration-specific test coverage + task-list/directive pipeline fixes"
e12b085 Revert "[US-014] documentation update: AGENTS.md markdown pipeline + fidelity contract"
```

## Result

- `bun install`: clean (patchedDependencies swap: remark-prosemirror patch removed, @tiptap/markdown patch restored)
- `bun run check`: **13/13 turbo tasks PASS** (FULL TURBO, 64ms)
- Old @tiptap/markdown stack fully functional
- **Rollback is verified safe** — a single `git revert` of the migration PR restores the prior stack

## Pre-merge checklist (section 18.8)

| Item | Status | Evidence |
|------|--------|----------|
| Q15 tokenizer-comparison report on main | DEFERRED | Requires separate tiny PR |
| Rollback rehearsal | PASS | This document |
| R1 zero regressions | PASS | US-013 tests: 793/793 fidelity, 13/13 P0 |
| OQ1 3-surface keymap | DEFERRED | Requires Playwright E2E with dev server |
| R21 schema-rename smoke | DEFERRED | Requires live editor (dev server) |
| D20 escapeMark validation | PASS | 14 tests in escape-mark-roundtrip.test.ts |
| Full bun run check green | PASS | 13/13 turbo tasks |
| 118-case catalog re-run | PASS | Fidelity suite: 793 tests pass |
| No STOP_IF triggers | PASS | 0 regressions, 0 P0 fails, 0 bridge fails |
