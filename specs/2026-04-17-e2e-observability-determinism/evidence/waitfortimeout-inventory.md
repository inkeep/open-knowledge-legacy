---
name: waitForTimeout inventory
description: Exhaustive count and classification of `page.waitForTimeout(N)` calls across the E2E suite, keyed to replacement strategy.
sources: packages/app/tests/stress/
collected_at: 2026-04-17
---

# `page.waitForTimeout` inventory

Baseline: `432a834b` (origin/main at spec creation).

## Raw counts

```
$ grep -c "waitForTimeout\b" packages/app/tests/stress/*.e2e.ts | grep -v ':0$'
```

| File | Count | Notes |
|---|---|---|
| `slash-command.e2e.ts` | **44** | Concentration: 80% of total. Primary G1 target. |
| `list-keymap.e2e.ts` | 5 | File is being migrated by playwright-stability spec (F2) — coordinate. |
| `reveal-on-activate.e2e.ts` | 2 | File is being migrated by playwright-stability spec (F5) — coordinate. |
| `docs-open.e2e.ts` | 2 | Reference pattern file from playwright-stability; if they use `waitForTimeout` at all, it's likely fine-grained after intentional work. |
| `source-polish.e2e.ts` | 1 | Single-use. |
| `mid-type-recovery.e2e.ts` | 1 | Single-use. |
| **Total** | **55** | — |

## Representative patterns (slash-command.e2e.ts)

Typical uses and their likely real signals:

| Pattern | Line(s) | Real signal |
|---|---|---|
| `await page.keyboard.type('/'); await page.waitForTimeout(300);` | 139, 176, 186, ... | Menu open — `page.waitForSelector('[role="listbox"]')` or `waitForFunction(() => document.querySelector('[role="listbox"]')?.getAttribute('data-ok-ready') === 'true')` |
| `await page.keyboard.type('/heading'); await page.waitForTimeout(300);` | 151, 162 | Menu filtered — need a signal that keystroke has been processed and options list reflects the filter. Candidate: `expect.poll(() => menu.optionCount)` stabilizes or a `data-filter-query` attribute. |
| `await page.keyboard.press('Enter'); await page.waitForTimeout(300);` | 226, ... | Insertion landed — `waitForFunction(() => document.querySelector('.ProseMirror').textContent.includes(expected))`. |
| `await page.waitForTimeout(150);` after mid-text `/` | 174 | Input processed. May be redundant if we wait on the subsequent menu signal. |

## Migration strategy by file

| File | Strategy | Blocked by |
|---|---|---|
| `slash-command.e2e.ts` | **Ours (this spec).** Primary target. Introduce `tests/stress/_helpers/slash-menu.ts` with `waitForSlashMenuOpen`, `waitForSlashMenuFiltered(query)`, `waitForSlashMenuClosed`. | Not blocked — can proceed in isolation. |
| `source-polish.e2e.ts` | Ours. Single-use, likely a sync-settle wait; replaceable with `waitForFunction` against the source text. | Not blocked. |
| `mid-type-recovery.e2e.ts` | Ours. Single-use. | Not blocked. |
| `docs-open.e2e.ts` | Ours. 2 uses, likely polish. | Not blocked. |
| `list-keymap.e2e.ts` | **Coordinate.** File undergoing playwright-stability rewrite (F2). Handoff options: (a) let their rewrite land first + we follow-up; (b) both specs commit against same branch and rebase. | Playwright-stability F2 landing. |
| `reveal-on-activate.e2e.ts` | **Coordinate.** Same as list-keymap. Their F5 removes the `beforeEach` reset and may restructure the file. | Playwright-stability F5 landing. |
