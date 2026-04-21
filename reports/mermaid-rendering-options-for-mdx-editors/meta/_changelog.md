# Changelog

## 2026-04-21 — Initial report + audit resolution

### Initial research pass (run `2026-04-21-initial`)

- 5 P0 dimensions (D1-D5) + D7 folded in
- 4 parallel subagents (A: D1+D7, B: D2, C: D3+D6 folded, D: D4+D5)
- 5 evidence files written from primary sources (local `mermaid@11.14.0`, local OSS clones of fumadocs/outline/blocknote/mdx-editor/docmost/affine/vscode/lexical/tiptap, remote GitHub/npm/bundlephobia)
- REPORT.md synthesis: 535 lines; 21 subject + 8 topic frontmatter entries

### Audit + resolution (2026-04-21)

- `/audit` spawned as nested subprocess; 12 findings in `meta/audit-findings.md` (1 HIGH, 6 MEDIUM, 5 LOW)
- All 12 classified **Valid — Fix** via `/assess-findings`. None declined. None incorrect.
- **HIGH #1** (internal contradiction about beautiful-mermaid monthly-download provenance): Reconciled `d2-alternative-renderers.md` — the 748,069 figure came from Agent D's D5 pass via `api.npmjs.org/downloads/...` (a separate endpoint from the 403-blocked `npmjs.com/package/...` HTML page). Evidence files D2.1.b, D2.1.i, and the negative-searches footer now state this explicitly.
- **MEDIUM #2** ("surveyed" qualifier dropped): Restored in exec summary key-findings bullet.
- **MEDIUM #3** ("ten editors, 5+5 split" mischaracterization): Rewritten exec summary paragraph to match actual survey composition (6 local + 2 negatives + several remote).
- **MEDIUM #4** (selkie 20 vs 22 count): Evidence updated to note the primary-source self-contradiction.
- **MEDIUM #5** (#6146 "CSS Animations edge case" qualifier dropped): Restored to exec summary.
- **MEDIUM #6** ("100-150 KB" framing overstates local measurement): Replaced with "~153 KB gzipped per bundlephobia's entry-graph figure (local spot-measurements: 11 KB entry + at least 57 KB across two of the five statically-imported eager chunks)".
- **MEDIUM #7** (beautiful-mermaid v1.1.2 vs v1.1.3): Explicit version reconciliation in exec summary.
- **LOW #8** (11 themes vs 12 enum): Clarified to "11 named themes + `'null'` sentinel (12 enum values total)".
- **LOW #9** (react-mermaid2 10K vs 9,923): Aligned to ~9,923 in D4 evidence.
- **LOW #10** ("browser environment" quote misattribution): Split quote attributions — Issue #3650 for "widths/heights", Discussion #4789 for "layout engine".
- **LOW #11** ("102 repos" noise caveat dropped): Restored parenthetical in exec summary.
- **LOW #12** (shared-cache claim missing inline cross-ref): Added "(See D3 cross-cutting observations + D4.2 negative search.)"

No new information surfaced during resolution — all fixes were surgical precision improvements or recontextualizations of existing evidence.
