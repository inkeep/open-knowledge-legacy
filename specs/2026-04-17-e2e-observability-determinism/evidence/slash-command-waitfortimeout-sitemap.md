---
name: slash-command.e2e.ts waitForTimeout sitemap
description: Site-by-site migration plan for the 44 `page.waitForTimeout(N)` + 1 `waitUntil: 'networkidle'` in `slash-command.e2e.ts`, classified per D-Q1 (LOCKED) signal categories, with the chosen replacement primitive. Pre-mapping gate for US-007.
baseline_commit: d74b049a
sources:
  - packages/app/tests/stress/slash-command.e2e.ts
collected_at: 2026-04-17
---

# `slash-command.e2e.ts` migration sitemap — US-007

44 `page.waitForTimeout(N)` sites + 1 `waitUntil: 'networkidle'` at line 38 + 1 residual CORS skip comment at line 262-263 (US-010 ratchet cleanup).

## D-Q1 (LOCKED) signal categories used below

- **B** — menu / UI render → `locator.waitFor({ state: 'visible' | 'hidden' })` or `expect.poll` against `getMenuState()`.
- **C** — selection / cursor / keystroke flush → `expect(locator).toContainText(...)` auto-retrying; or `page.waitForFunction` on a DOM condition.
- **D** — CRDT propagation → `expect(locator).toHaveCount(N)` on the inserted block (WebSocket → observer bridge → PM decoration round-trip); effectively a B+D composite because the visible signal IS the propagated state.

Category A (debounce-settled via `page.clock`) is **not used** — slash-menu state changes are synchronous; no real debounces to advance.

## Helpers introduced in `_helpers/slash-menu.ts`

- `slashMenu(page): Locator` — root locator for `[role="listbox"][aria-label="Slash commands"]`.
- `waitForSlashMenuOpen(page, options?)` — `visible` state.
- `waitForSlashMenuClosed(page, options?)` — `hidden` state.
- `waitForSlashMenuFilteredBy(page, query, options?)` — open + every visible option's text contains `query.toLowerCase()`.
- `getSelectedItemSnapshot(page)` — `{ index, adId, liveText }` for aria / live-region / selection-index assertions under `expect.poll`.

## Migration table

| # | Line | Existing call | Context | Cat | Replacement |
|---|------|---------------|---------|-----|-------------|
| 0 | 38 | `waitUntil: 'networkidle'` | `resetEditor` reload | — | `waitUntil: 'domcontentloaded'` + `waitForActiveProviderSynced(page)` after the subsequent `page.goto` |
| 1 | 147 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 2 | 159 | `waitForTimeout(300)` | after `type('/heading')` | B | `waitForSlashMenuFilteredBy(page, 'heading')` |
| 3 | 170 | `waitForTimeout(300)` | after `type('/HEADING')` | B | `waitForSlashMenuFilteredBy(page, 'heading')` (case-insensitive) |
| 4 | 182 | `waitForTimeout(150)` | after `type('hello world ')` | C | `expect(page.locator('.ProseMirror')).toContainText('hello world')` |
| 5 | 184 | `waitForTimeout(300)` | after `type('/bullet')` mid-line | B | `waitForSlashMenuFilteredBy(page, 'bullet')` |
| 6 | 194 | `waitForTimeout(300)` | after `type('/xyz')` (no match) | B | `waitForSlashMenuClosed(page)` |
| 7 | 221 | `waitForTimeout(200)` | after `type('/h2')` | B | `waitForSlashMenuFilteredBy(page, 'h2')` |
| 8 | 223 | `waitForTimeout(300)` | after `press('Enter')` | B+D | `expect(page.locator('.ProseMirror h2')).toHaveCount(1)` |
| 9 | 233 | `waitForTimeout(200)` | after `type('/h2')` | B | `waitForSlashMenuFilteredBy(page, 'h2')` |
| 10 | 235 | `waitForTimeout(300)` | after `press('Tab')` | B+D | `expect(page.locator('.ProseMirror h2')).toHaveCount(1)` |
| 11 | 245 | `waitForTimeout(300)` | after `type('/quote')` | B | `waitForSlashMenuFilteredBy(page, 'quote')` |
| 12 | 254 | `waitForTimeout(300)` | after mousedown dispatch | B+D | `expect(page.locator('.ProseMirror blockquote')).toHaveCount(1)` |
| 13 | 266 | `waitForTimeout(200)` | after `type('/table')` | B | `waitForSlashMenuFilteredBy(page, 'table')` |
| 14 | 268 | `waitForTimeout(300)` | after `press('Enter')` | B+D | `expect(page.locator('.ProseMirror table')).toHaveCount(1)` |
| 15 | 287 | `waitForTimeout(150)` | after `type('hello world ')` | C | `expect(page.locator('.ProseMirror')).toContainText('hello world')` |
| 16 | 289 | `waitForTimeout(300)` | after `type('/bullet')` | B | `waitForSlashMenuFilteredBy(page, 'bullet')` |
| 17 | 291 | `waitForTimeout(300)` | after `press('Enter')` | B+D | `expect(page.locator('.ProseMirror ul')).toHaveCount(1)` |
| 18 | 303 | `waitForTimeout(300)` | after rapid `Slash`+`Enter` | B+D | `expect.poll` against block count > 0 (composite) |
| 19 | 314 | `waitForTimeout(200)` | after `type('/bulletList')` | B | `waitForSlashMenuFilteredBy(page, 'bullet')` |
| 20 | 316 | `waitForTimeout(300)` | after `press('Enter')` | B+D | `expect(page.locator('.ProseMirror ul')).toHaveCount(1)` |
| 21 | 344 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 22 | 349 | `waitForTimeout(80)` (loop ×3) | inside ArrowDown nav loop | B | remove; final `expect.poll` on `getSelectedItemSnapshot` settles |
| 23 | 365 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 24 | 369 | `waitForTimeout(100)` | after `press('ArrowUp')` | B | `expect.poll(() => snap.index).toBe(itemCount-1)` |
| 25 | 382 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 26 | 387 | `waitForTimeout(80)` (loop ×5) | inside ArrowDown nav loop | B | remove; final `expect.poll` settles |
| 27 | 393 | `waitForTimeout(200)` | after `press('Backspace')` | C | `expect(page.locator('.ProseMirror')).not.toContainText('/')` |
| 28 | 395 | `waitForTimeout(400)` | after `type('/heading')` | B | `waitForSlashMenuFilteredBy(page, 'heading')` |
| 29 | 410 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 30 | 414 | `waitForTimeout(300)` | after `press('Escape')` | B | `waitForSlashMenuClosed(page)` |
| 31 | 424 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 32 | 431 | `waitForTimeout(40)` (loop) | inside ArrowDown loop | B | remove; `lastVisible` assertion settles |
| 33 | 469 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 34 | 496 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 35 | 518 | `waitForTimeout(100)` | after `press('ArrowDown')` | B | `expect.poll(() => snap.adId !== initialAdId).toBe(true)` |
| 36 | 544 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 37 | 555 | `waitForTimeout(100)` | after `press('ArrowDown')` | B | `expect.poll(() => snap.liveText !== initialLiveText).toBe(true)` |
| 38 | 569 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 39 | 587 | `waitForTimeout(300)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 40 | 622 | `waitForTimeout(400)` | after `type('/')` (positioning) | B | `waitForSlashMenuOpen(page)` |
| 41 | 644 | `waitForTimeout(400)` | after `type('/')` (below viewport) | B | `waitForSlashMenuOpen(page)` |
| 42 | 658 | `waitForTimeout(400)` | after `type('/')` | B | `waitForSlashMenuOpen(page)` |
| 43 | 686 | `waitForTimeout(400)` | after `type('/')` post-scroll | B | `waitForSlashMenuOpen(page)` |
| 44 | 712 | `waitForTimeout(300)` | after mid-menu scroll | B | `expect.poll(() => popupTop).not.toBeCloseTo(beforeTop, 0)` — poll until `Math.abs(after.top - before.top) > 5` |

## Extra cleanup — line 262-263

```
// Same pre-existing webkit CORS issue on `/api/documents` during
// page.reload (see note on "selecting an item via Enter" test above).
```

Residual comment references the deleted webkit CORS skip. Commit `940d5a0a` (2026-04-16) deleted all 4 `test.skip(browserName === 'webkit', ...)` calls when the 3-browser matrix collapsed to chromium-only, but this comment was missed. US-010's AC-5 ratchet bans re-introduction — this spec (US-007) removes the stale trail. Remove both lines.

## Verification

After US-007 lands:

```bash
grep -c 'page.waitForTimeout(' packages/app/tests/stress/slash-command.e2e.ts      # → 0
grep -c "waitUntil: 'networkidle'" packages/app/tests/stress/slash-command.e2e.ts  # → 0
```

Then 3 consecutive full runs via:

```bash
cd packages/app
for i in 1 2 3; do VITE_PORT=$((17000+RANDOM%2000)) bunx playwright test tests/stress/slash-command.e2e.ts --reporter=list || exit 1; done
```

Zero retries per AC.
