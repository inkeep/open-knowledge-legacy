# Changelog

## 2026-04-11 — Initial spec

- Created SPEC.md with SCR, success criteria, 5 design sections, 14 test scenarios, 5 decisions
- Key finding: built-in `char: '[[''` does NOT work for paired delimiters — need custom `findSuggestionMatch`
- Evidence written: `evidence/suggestion-api-compatibility.md` (source-verified API compatibility analysis)
- All decisions at HIGH confidence, LOCKED or DIRECTED status
- No ASSUMED or INVESTIGATING items

## 2026-04-11 (later) — Audit findings applied

- Resolved 6 audit findings (3 H, 2 M, 1 L) against the original spec
- H1: lifecycle order corrected to `onBeforeStart` → `await items()` → `onStart`/`onUpdate`
- H2: kept `query` prop on menu (needed for empty-state message)
- H3: added `onBeforeStart` to render lifecycle
- M1: documented closure variable declarations
- M2: clarified `char` parameter comment
- L1: rephrased R08 for regex-exclusion clarity

## 2026-04-12 — Spec rebased onto origin/main (PR #53 + PR #71)

**Trigger:** `mike-inkeep`'s PR #53 merged at 2026-04-12 20:27 UTC, adding anchor-mode suggestions (`[[page#heading]]`) to the very file this spec migrates. PR #71 also landed (backlink panel, separate subsystem).

**Rebase actions:**
- Baseline moved from `0e5c31d` → `39fcd87` (git rebase origin/main — 22 new commits, no conflicts; our spec files untouched by origin)
- Re-read `wiki-link-suggestion.ts` @ `39fcd87` (492 lines, was 338) and `WikiLinkSuggestionMenu.tsx` (+82 lines)
- Re-read new test file `wiki-link-suggestion.test.ts` (verified it tests only pure `buildSuggestionItems`, so extraction preserves it)

**Scope additions:**
- **Anchor mode preservation** — `parseQuery`, `filterHeadings`, `buildAnchorItems`, `fetchHeadings`, `cachedHeadings` map, `anchorFetchingFor` guard
- **Per-mode loading state** — "Loading pages…" vs "Loading headings for <pageTarget>…"
- **Per-mode empty state** — "No pages" vs "No headings" with `pageTarget` / `anchorQuery` context
- **Atom deletion plugin (D6)** — Backspace/Delete on wikiLink atoms when suggestion inactive must move to a separate ProseMirror plugin (Suggestion's `onKeyDown` only fires when active)
- **Fallback insertion (D7)** — Enter with no item selected reads raw query from plugin state and branches on `parseQuery(query).mode`
- **Menu prop preservation (D5 updated)** — kept all 9 props; `mode`, `pageTarget`, `anchorQuery` are load-bearing

**New test scenarios:** R15-R23 (9 new) covering anchor mode, fallback insertion, atom deletion.

**New decisions:** D6 (separate atom-deletion plugin) + D7 (fallback reads plugin state) + D8 (per-mode loading label via render-lifecycle props).

**New risks identified:** R3-R7 — Backspace pass-through when suggestion active (R3), stale anchor fetches (R4), loading-state prop timing (R5), concurrent anchor fetches (R6), subtle behaviors not caught by scenarios (R7).

**Net line reduction revised:** 492 → ~280 (was 338 → ~180). Savings smaller because anchor mode's two-phase fetch and per-mode state add real complexity that Suggestion doesn't abstract away.

**All decisions remain HIGH confidence, LOCKED or DIRECTED.** No ASSUMED items.
