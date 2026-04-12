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

## 2026-04-12 (later) — Audit + assess-findings pass on rebased spec

**Trigger:** Re-ran `/audit` + `/assess-findings` after the rebase to verify the anchor-mode scope, new decisions (D6-D8), and new risks (R3-R7) hold against the current codebase @ `39fcd87`.

**Audit results:** 8 findings (2 H, 3 M, 3 L), written to `meta/audit-findings-rebase.md`.

**Assess-findings:** All 8 classified **Act** — none declined. Rationale: greenfield spec, all findings HIGH-confidence valid per source verification and algorithmic reasoning.

**Resolutions applied:**
- **H1 + M3 — `onBeforeUpdate` hook added.** Source line 192-193 shows `onBeforeUpdate` fires before `await items()` on query change (mode switches). Without it, typing `#` to enter anchor mode would drop the "Loading headings for <pageTarget>…" label — regressing R15. Added as the sixth lifecycle hook in §3.3, §3.7, §4 implementation order, A2, A3, D8, R5.
- **H2 + D9 — Promise-dedupe for page fetch.** Current impl fires `fetchPages()` exactly once in `view().update`'s first-mount branch. Migration moves it inside `items()` which re-runs per keystroke. `!pagesLoaded` guard can't prevent concurrent fetches (flag only flips after await resolves). Added `pagesInFlight: Promise<PageItem[]> | null` to §3.3. New D9 decision. New R8 risk.
- **M1 — `query: string | null`.** Suggestion's state has `query: null` when inactive (source lines 311-315). Updated A4 with full state shape. Sharpened §3.5 citation and removed wrong "source line 60" reference (L1).
- **M2 — Line estimate revised 492 → ~375-400** (was ~280). Honest arithmetic in §2 Secondary.
- **L2 — PR attribution tightened** in §6 In Scope: PR #42 original features separated from PR #53 additions.
- **L3 — Evidence version-pinned** to `@tiptap/suggestion@3.22.3` (caret→exact), making future drift easier to catch.

**Evidence updates:** Extended `evidence/suggestion-api-compatibility.md` with full six-hook lifecycle breakdown and a concrete timeline showing the concurrent-fetch race.

**Spec is ready to ship.** All decisions HIGH confidence, LOCKED or DIRECTED. No ASSUMED items. No open audit findings.
