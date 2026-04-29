# Markdown Source-Text Fidelity — End-to-End Spec

**Status:** Approved (audit + challenger assessed, corrections applied)
**Owner(s):** engineering (TBD)
**Last updated:** 2026-04-11
**Baseline commit:** 2d35736
**Links:**
- Prior research: [reports/markdown-construct-fidelity-catalog/](../../reports/markdown-construct-fidelity-catalog/)
- Prior research: [reports/markdown-roundtrip-fidelity-tiptap/](../../reports/markdown-roundtrip-fidelity-tiptap/)
- Evidence: [evidence/](./evidence/)

---

## 1) Problem statement

**Situation.** Open Knowledge treats the markdown file on disk as the canonical source of truth. Ten paths write to and read from this canonical form: WYSIWYG typing, source-mode typing, browser rich-text paste, external editor writes (file watcher), agent HTTP writes, agent patches, CRDT multi-client sync, git branch switches, shadow repo checkpoints, docs-site rendering. The prior 118-case probe confirmed **only 2 of 118 constructs round-trip byte-identically** through `@tiptap/markdown@3.22.3`, with bug classes localized to specific call sites (`@tiptap/core`'s `encodeHtmlEntities` and `parseInlineTokens` missing an `escape` handler).

**Complication.** The gap is not one bug but seven overlapping fidelity invariants — each violated by a distinct construct × path combination. The current test suite (`conversion-fidelity.test.ts`) uses a `/\w{3,}/g` regex blind to every character in the P0 hit list, so tests pass silently on known corruption. Adding cases without structural reform leaves 8 VARIANT cells in the 99-combination path × construct matrix uncovered. Six parallel research investigations (I1-I6) confirmed: no external library solves this out-of-box; @tiptap/markdown won't fix upstream for ≥6 months; the path matrix collapses to 82 TRIVIAL + 9 N/A + 8 VARIANT (only 2 test shapes needed); marked's tokenizer exposes source form via `.raw` on every token (enabling Tier 2 attribute preservation without custom tokenizers); and all three library-reuse alternatives have worse tradeoffs than targeted patches.

**Resolution.** Ship maximalist source-text fidelity as an enforced invariant set across 5 phases in a single PR: (a) `bun patch @tiptap/markdown@3.22.3` entity-encoding bypass + backslash-escape dual-layer fix + frontmatter regex bugs, (b) Tier 2 attribute preservation on 8 node/mark types using `token.raw` extraction, (c) Tier 3 custom node types for HTML blocks and reference-link definitions, (d) cross-path test hardening documenting current paste behavior and V2 external-write convergence, (e) test infrastructure — fast-check + bun:test PBT + CommonMark (652) + GFM (~200) corpora + I1-I7 invariant assertion suite — plus architectural codification (sanitization boundary, irreducible gaps, pinned version discipline).

## 2) Goals

- **G1.** Every literal character in any valid markdown input appears literally in the output of any round-trip. **Acceptance:** I2 invariant suite passes on 10k generative runs per invariant (nightly at `STRESS_FIDELITY=1`) + ~970 external corpus cases + our 118-case catalog.
- **G2.** The full CommonMark 0.31.2 + GFM + our custom extension construct surface has coverage through all 7 fidelity invariants. **Acceptance:** 7 invariant test files + PBT generator + 3 corpus suites all green.
- **G3.** The 99 IN × OUT path combinations have classified coverage. **Acceptance:** 2 new test files (V1 Playwright + V2 integration) cover the 8 VARIANT cells; 82 TRIVIAL cells covered implicitly by Layer A ≡ Layer B test equivalence.
- **G4.** The 5 phases ship in a single PR with 5 atomic commits, each independently passing `bun run check`.
- **G5.** Irreducible architectural gaps are documented in SPEC §3 non-goals and `CLAUDE.md` so future contributors don't re-derive them.
- **G6.** Storage-layer sanitization boundary is codified in `CLAUDE.md` (storage never sanitizes, render-time layers do). Documentation-only change.
- **G7.** The PBT harness is reusable for continuous verification after any `@tiptap/markdown` upgrade. **Acceptance:** `bun run test:fidelity` runs standalone; turbo-cached independently.

## 3) Non-goals

- **[NEVER] NG1:** Preserve exact blank-line count between blocks. ProseMirror schema limitation. Normalize to single blank line.
- **[NEVER] NG2:** Preserve exact column widths in GFM tables. Content survives; whitespace normalizes.
- **[NEVER] NG3:** Support constructs outside our extension set (math blocks `$$`, footnotes `[^1]`, definition lists, alerts `> [!NOTE]`, emoji shortcodes). Such authoring gets round-trip as literal escape-preserved text, not semantic preservation.<br>_[Corrected 2026-04-29 post-ship: math `$$…$$` + ` ```math ` fences are now first-class via the `<Math>` canonical + `DollarMath` / `MathFence` compats per [`specs/2026-04-29-math-canonical-and-syntax/SPEC.md`](../2026-04-29-math-canonical-and-syntax/SPEC.md). Alerts `> [!NOTE]` were already lifted by `specs/2026-04-23-cb-v2-md-foundation/` (GFM-alerts → `<Callout>`). Footnotes, definition lists, and emoji shortcodes remain irreducible gaps.]_
- **[NOT UNLESS] NG4:** Storage-layer sanitization of raw HTML. Security against XSS is a render-layer concern (DOMPurify in docs site). Storage is lossless. **Only if:** untrusted authorship is introduced (guest editing, public access, external content import without review).
- **[NOT UNLESS] NG5:** Migrate from `@tiptap/markdown` to `prosemirror-markdown`, `remark-prosemirror`, or any alternative. **Only if:** `@tiptap/markdown` v4 ships with configurable encoding OR F4's ecosystem comparison is superseded by better evidence.
- **[NOT NOW] NG6:** Full paste-UX behavior changes (HTML paste sanitization, detection heuristics, toast confirmation, DOMPurify). Forked to its own spec per D8. This spec ships always-parse for text/plain (Archetype D, R18) and documents paste behavior via V1 Playwright tests as the regression baseline.
- **[NOT NOW] NG7:** Preserve exact file encoding (UTF-8 BOM, UTF-16, CRLF). File-watcher / OS concern. Frontmatter CRLF bug is in scope; broader line-ending handling is not.
- **[NOT NOW] NG8:** 3+ client concurrent construct mutations. F3 verified 2-client is a pass-through; 3+ is extrapolation. Defer unless real-world breakage observed.
- **[NOT NOW] NG9:** Orphan linkRefDef cleanup when all references are removed. Accept orphans (matches most markdown editors). Background sweep is Future Work.

## 4) Personas / consumers

**P1 — Markdown author.** Writes/edits markdown via WYSIWYG, source mode, or external editor. Expects round-trip byte-fidelity on characters they typed.

**P2 — Agent (LLM + MCP/HTTP).** Reads markdown to understand content; writes via `/api/agent-write-md`; patches via `/api/agent-patch` find/replace. Expects canonical disk form to be stable and grep-able.

**P3 — Reviewer / git user.** Runs `git diff` on markdown files. Expects clean diffs reflecting actual content changes, not round-trip noise.

**P4 — Next contributor to the observer / markdown pipeline.** Inherits the test suite. Expects invariant tests to catch regressions before merge.

**P5 — Docs site reader.** Consumes rendered markdown via Fumadocs/MDX. Expects HTML output to match author intent (including raw HTML authors wrote intentionally — `<sub>`, `<kbd>`, `<details>`).

## 5) User journeys

**J1 (P1 author):** Types `# H&M Store` in WYSIWYG → saves → `git diff` shows `# H&M Store` literally on disk (not `# H&amp;M Store`). Next session reopens → sees `# H&M Store` in WYSIWYG view and source mode. No drift, no silent mutation.

**J2 (P2 agent):** Receives task "append a section heading to the doc." Writes `\n## New section\n` via `/api/agent-write-md` → reads via `/api/document` → sees own content preserved verbatim. Runs `/api/agent-patch` with `find: "# H&M Store", replace: "# H&M Supply Co"` → patch succeeds (Y.Text contains literal `&`, not `&amp;`).

**J3 (P3 reviewer):** Reviews a PR that modifies a markdown file. `git diff` shows ONLY the author's actual content change (e.g., added a paragraph). No noise from entity escape, marker normalization, or whitespace drift.

**J4 (P4 contributor):** Opens `packages/app/tests/fidelity/invariant-i2.test.ts` to understand how character fidelity is verified. Sees a ~30-line test with clear invariant assertion + shared arbitrary generator. Can add a new construct case by extending `arbitraries.ts`.

**J5 (P5 docs reader):** Author wrote `H<sub>2</sub>O` in a doc. Docs site renders as "H₂O" with subscript. Not as literal visible text `H<sub>2</sub>O`.

## 6) Requirements

### Functional

| # | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| **R1** | Must | Entity encoding bypass for non-code text | `bun patch @tiptap/markdown@3.22.3` creates a `.patch` file in `patches/` modifying `encodeTextForMarkdown` in `src/MarkdownManager.ts` (line 910) to return input unchanged for non-code text. Patch auto-applies on `bun install`. Failed patch surfaces at install time (fail-loud). Every text node containing `&`/`<`/`>` serializes to literal chars. Verified by invariant I2 test at 1000 generative runs. |
| **R2** | Must | Backslash escape dual-layer fix | `parseInlineTokens` gains `escape` token handler. `encodeTextForMarkdown` re-escape logic for markdown-syntax chars in text nodes. `\*`, `\_`, `\[`, `\#` round-trip byte-exact. Verified by 12 P0 test cases. |
| **R3** | Must | Frontmatter CRLF + empty-block regex fixes | `FRONTMATTER_RE` updated: `\n` → `\r?\n`; quantifier adjusted for empty block. Windows files and `---\n---\n` round-trip correctly. |
| **R4** | Must | Tier 2 attribute preservation (8 items) | Bullet marker, ordered delim, emphasis delim, fence delim, heading style, HR raw, link style, tight/loose list — all stored as node/mark attributes extracted from `token.raw`/`token.loose`. Fallback to CommonMark canonical when attr missing. ~325 LOC across 8 extension overrides per I4 sketches + R16. |
| **R5** | Must | Tier 3 custom node types (3 items) | `htmlBlock` (atom:true, stores raw HTML), `linkRefDef` (atom:true, Option A doc-footer), `hardBreak` (form attribute). ~95 LOC per I4. |
| **R6** | Must | Invariant assertion suite (I1-I7) | 7 test files in `packages/app/tests/fidelity/` with shared `arbitraries.ts`. Each invariant asserted at 1000 generative runs by default; 10000 at `STRESS_FIDELITY=1`. |
| **R7** | Must | CommonMark corpus integration | `commonmark.json` npm package imported; 652 spec examples tested for I1 identity (modulo documented normalization). |
| **R8** | Must | GFM corpus extraction | One-time script extracts GFM spec examples (~200) into `fixtures/gfm-examples.json`. Tested for I1 identity. |
| **R9** | Must | Construct catalog regression | Existing 118-case catalog from prior report expanded and ported into `conversion-fidelity.test.ts`. `/\w{3,}/g` assertion replaced with strict non-whitespace comparison. |
| **R10** | Must | V1 Playwright test — browser paste current behavior | `packages/app/tests/stress/paste-fidelity.e2e.ts` documents current paste via construct fixtures. Acts as regression baseline for the future paste-UX spec. |
| **R11** | Must | V2 integration test — external-write Y.Text convergence window | Verifies `/api/document` returns either raw or canonical form during Observer A's debounce window. ~50 LOC in `bridge-matrix.test.ts`. |
| **R12** | Must | CLAUDE.md architectural codification | New section: "Storage-layer fidelity contract — storage never sanitizes; render does." Documents the 7 invariants + irreducible gaps + pinned-version discipline. |
| **R13** | Should | Turbo `test:fidelity` task | Independent cache key. Wired into `bun run check`. |
| **R14** | Should | Pin `@tiptap/markdown` exact version | `package.json` uses `3.22.3` (no caret). Document upgrade protocol: run probe before bumping. |
| **R15** | Could | Continuous probe wiring | CI step re-runs the 118-case probe on any `@tiptap/*` version bump to surface upstream-introduced regressions. |
| **R16** | Must | Tight/loose list preservation | List nodes gain `loose: boolean` attribute extracted from marked's `token.loose`. Tight lists (`<li>content`) and loose lists (`<li><p>content</p></li>`) round-trip semantically. ~50 LOC in Phase 2 (T2-8). |
| **R17** | Should | Startup fidelity canary | At server init, round-trip `"# H&M Store\n"` through `mdManager.parse → mdManager.serialize`. Assert byte identity. Log pass via pino `info`; log fail via pino `warn`. Graceful degradation on fail (continue with warning). ~15 LOC. |
| **R18** | Should | Always-parse paste for text/plain | Register `clipboardTextParser` EditorProps that routes `text/plain` clipboard data through `mdManager.parse()`. No detection heuristic — all text/plain is markdown (Archetype D, matching Milkdown/Plate defaults). Cmd+Shift+V remains the browser-level plain-text escape hatch. ~30 LOC. Does NOT cover HTML paste, sanitization, or toast UX (those remain in the deferred paste-UX spec). |
| **R19** | Must | Inline-level PBT generator | `arbitraries.ts` includes inline-mark composition generator: text runs with marks (bold, italic, code, link) inside container nodes (heading, paragraph, blockquote, list item). Directly tests `encodeTextForMarkdown`'s code/non-code boundary. ~30 LOC. |
| **R20** | Must | Link URL `&` test case | P0 hit list includes `[text](https://example.com?a=1&b=2)` to verify link href attributes (not text nodes) are not entity-encoded. ~5 LOC. |

### Non-functional

- **Performance:** PBT adds ~7s to `bun run check` (cold), ~0s (turbo-cached). Nightly `STRESS_FIDELITY=1` adds ~70s. `bun patch` applies at install time with zero runtime cost (source is patched before compilation).
- **Reliability:** `@tiptap/markdown` version pinned exact. Patches verified via build-time assertion that `MarkdownManager.prototype.encodeTextForMarkdown` exists.
- **Security:** No storage-layer sanitization. Raw HTML in markdown passes through unchanged. XSS mitigation is a render-layer concern (out of scope for this spec; documented in CLAUDE.md).
- **Cost:** Zero infra cost. Developer time: ~10-12 days per phase estimates.

## 7) Success metrics & instrumentation

- **M1 — Construct fidelity rate:** % of 970 corpus cases that pass I1 identity. Baseline: ~60% (118-case catalog equivalent). Target: ≥95% (remaining ~5% are documented irreducible per NG1-NG4).
- **M2 — P0 bug closure:** 12 P0 test cases all green post-Phase 1.
- **M3 — PBT regression catch rate:** Run invariant suite against pre-patch code; all invariants should fail (proves tests have teeth).
- **M4 — git-diff noise reduction:** Manual check on 5 real docs pre/post migration. Zero spurious `&amp;` or marker-normalization diffs.
- **M5 — Maintenance overhead:** Time per `@tiptap/markdown` version bump to verify patches still apply. Target: ≤15 minutes with pinned version.

## 8) Current state

See `evidence/i1-library-reuse-survey.md`, `evidence/i2-pbt-tooling.md`, `evidence/i3-paste-and-frontmatter.md`, `evidence/i4-extension-design-sketches.md`, `evidence/i5-tiptap-roadmap.md`, `evidence/i6-path-matrix.md` plus prior research at `reports/markdown-construct-fidelity-catalog/` for complete current-state analysis.

Key current-state facts:
- 2/118 byte-identical; 77 whitespace-only; 39 material differences
- Layer A (mdManager) ≡ Layer B (Y.Doc path) on all 118 cases
- `encodeHtmlEntities` in `@tiptap/core/src/utilities/htmlEntities.ts` (26 LOC) is the entity-bug root cause
- `parseInlineTokens` in `@tiptap/markdown/src/MarkdownManager.ts` has no `escape` token handler (the backslash-bug root)
- Frontmatter regex in `packages/core/src/extensions/frontmatter.ts` fails on CRLF and empty blocks
- Paste handler has NO custom logic, NO sanitization, NO markdown detection (gap forked to separate spec)
- `@tiptap/markdown` upstream won't fix for ≥6 months (markdown deprioritized on roadmap)

## 9) Proposed solution (vertical slice)

### Architecture overview

Single PR with 5 atomic commits shipping:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1 — Tactical patches + test infra (~185 LOC prod, ~360 LOC test) │
│  • `bun patch @tiptap/markdown@3.22.3` targeting MarkdownManager.ts │
│  • parseInlineTokens escape handler (in patch)              │
│  • Re-escape logic in encodeTextForMarkdown (in patch)      │
│  • Frontmatter regex fixes (CRLF + empty block)             │
│  • fast-check + bun:test PBT infra + arbitraries.ts         │
│  • arbitraries.ts inline-mark composition generator (R19)   │
│  • commonmark.json import + GFM extraction                  │
│  • 12 P0 test cases + link URL & test (R20)                 │
│  • Tightened conversion-fidelity assertion                  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Phase 2 — Tier 2 attribute preservation (~325 LOC)          │
│  • Bullet marker (T2-1, ~35 LOC)                            │
│  • Ordered delim (T2-2, ~40 LOC)                            │
│  • Emphasis delim (T2-3, ~60 LOC)                           │
│  • Fence delim (T2-4, ~40 LOC)                              │
│  • Heading style (T2-5, ~35 LOC)                            │
│  • HR raw (T2-6, ~15 LOC)                                   │
│  • Link style (T2-7, ~50 LOC, pairs with T3-2)              │
│  • Tight/loose list (T2-8, ~50 LOC, via token.loose)        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Phase 3 — Tier 3 custom nodes (~95 LOC)                     │
│  • htmlBlock atom node (T3-1, ~35 LOC)                      │
│  • linkRefDef doc-footer node (T3-2, ~40 LOC)               │
│  • hardBreak form attr (T3-3, ~20 LOC)                      │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Phase 4 — Cross-path test hardening (~130 LOC)              │
│  • V1 Playwright paste baseline tests                       │
│  • V2 integration: external-write Y.Text convergence        │
│  • Always-parse clipboardTextParser for text/plain (R18)    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Phase 5 — Codification (docs only)                          │
│  • CLAUDE.md sanitization boundary + invariants + irreducible│
│  • Pinned-version discipline documented                     │
│  • Upgrade protocol + probe run instructions                │
└─────────────────────────────────────────────────────────────┘
```

**Total: ~635 LOC production + ~1165 LOC test code + corpus imports + docs.**
(Production: ~185 Phase 1 + ~325 Phase 2 + ~95 Phase 3 + ~30 Phase 4. Test: ~360 Phase 1 + ~100 Phase 4 + ~650 invariant suite + corpora loaders.)

### Alternatives considered

All rejected based on I1-I6 evidence:

- **Migrate to prosemirror-markdown:** Breaks 9 GFM + custom extensions. Rejected by F4.
- **Migrate to remark-stringify:** Can't preserve per-occurrence source form. Rejected by I1.
- **Wait for @tiptap/markdown v4:** No v4 imminent, markdown deprioritized. Rejected by I5.
- **Fork @tiptap/markdown:** Maintenance burden > patch burden. Rejected by I5.
- **linkRefDef Option B (Y.Map side-channel):** Bad collab semantics (cross-client URL hijack on shared labels). Rejected by D7 analysis.
- **linkRefDef Option C (per-link attr):** Latent correctness bug on WYSIWYG link-edit. Rejected by D7 analysis.
- **Paste detection in this spec:** 3 original options all flawed; forking to dedicated spec. D8.
- **5 sequential PRs:** Worse rebase burden on Miles's open PR #39. Rejected by D10 analysis.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Evidence |
|---|---|---|---|---|---|
| D1 | Import CommonMark (652) + GFM (~200) + keep our 118 as regression corpora | T | LOCKED | No | I1, I2 |
| D2 | Paste hardening full scope → SUPERSEDED by D8 | P | SUPERSEDED | — | — |
| D3 | Frontmatter CRLF + empty-block regex fixes in Phase 1 | T | LOCKED | No | I3 |
| D4 | Patch strategy: `bun patch` (was Option D monkey-patch) + backslash + Tier 2 + Tier 3 | T | LOCKED | No | I1, I5, challenger H2 |
| D5 | Keep all 5 test tiers | T | LOCKED | No | I2, I6 |
| D6 | Wait for I4 re-dispatch (now complete) | Process | COMPLETE | — | I4 |
| D7 | linkRefDef = Option A (doc-footer invisible node) | T | LOCKED | **Yes (Y.Doc schema)** | I4, /analyze |
| D8 | Paste-UX forks to separate spec; this spec ships V1 tests + always-parse text/plain (R18). Full paste-UX (HTML, sanitization, toast) remains deferred. | P | LOCKED (partially reopened) | No | I3, I6, /analyze, /assess-findings on survey |
| D9 | PBT at 1000 runs default, 10k at STRESS_FIDELITY=1 nightly | T | LOCKED | No | I2, /analyze |
| D10 | Single mega-PR with 5 atomic commits | P | LOCKED | No | D4, PR #38 precedent, /analyze |

## 11) Open questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| Q1 | HTML block UX in WYSIWYG (atom:true shows raw source; should editor provide a sandboxed-render preview?) | P | P2 | Parked — doesn't affect fidelity contract |
| Q2 | Orphan linkRefDef cleanup when user removes all references | T | P2 | Parked — NG9 accepts orphans |
| Q3 | Exact CLAUDE.md section placement for invariants + boundary codification | P | P0 | Resolve at Phase 5 writing time |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan |
|---|---|---|---|
| A1 | Team has bandwidth for ~1800 LOC single-PR review | MEDIUM | Monitor review velocity; fall back to hybrid if stalled |
| A2 | `@tiptap/markdown` 3.22.x stable across our maintenance window | HIGH | I5 verified no v4 imminent |
| A3 | CommonMark.json + GFM extraction produce usable fixtures | HIGH | I1 verified |
| A4 | fast-check + bun:test works without config surprises | HIGH | I2 cited official docs + concrete sketch |
| A5 | Phase 1 patches don't break existing tests | HIGH | Existing conversion-fidelity + bridge-matrix tests provide baseline |

## 13) In Scope

See §2 goals + §6 requirements + §9 architecture.

### Deployment / rollout

| Concern | Approach | Verify |
|---|---|---|
| First-save-after-deploy diff noise | Acceptance: existing docs with `&amp;` self-heal on next save to literal `&` | Manual check on 3 real docs |
| `@tiptap/markdown` version drift | Pin exact. Upgrade protocol: run probe first | Build-time assertion in Phase 1 |
| PBT flakes | Seed deterministic; bug repro reproducible | CI config uses fixed seed |
| Miles's PR #39 conflict | Our edits touch none of his 22 files | Verify pre-merge via `gh pr diff` |
| Phase 3 custom nodes in existing docs | Existing docs have no `htmlBlock`/`linkRefDef` nodes; absence is valid | Schema backward-compatible |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bun patch` breaks on @tiptap/markdown minor bump | Low | Medium | Pin exact version; failed patch surfaces at install time (fail-loud) |
| Tier 2 attr preservation misses an edge case (e.g., `1)` with wrong delim) | Medium | Low | PBT catches it; regression test added |
| linkRefDef node creates git-diff noise (position-preserving vs end-footer) | Low | Low | Position-preserving by default matches author intent |
| V1 Playwright test flakes on CI (paste is notoriously flaky) | Medium | Low | Retry up to 3x; use `page.evaluate` for clipboard injection |
| User pastes doc with HTML → escape behavior changes unexpectedly after Option D | Low | Medium | V1 tests document current behavior; migration diff is one-time |
| PBT catches a new bug class during development | Medium | Medium | Not a risk — catching bugs is the point |
| Single mega-PR stalls in review | Medium | High | Fall back to hybrid (Phase 1 alone first) if review >7 days |

## 15) Future Work

### Explored

- **Paste-UX dedicated spec (forked from D8).**
  - What we learned: Three paste-detection heuristics (conservative/aggressive/heuristic) all have false-positive or false-negative issues. Two better alternatives (no-detection / confirm-toast) exist. DOMPurify integration for HTML paste sanitization is ~30 LOC + dep.
  - Recommended approach: Dedicated `/spec` pass with UX research, maybe user testing on Open Knowledge's target persona.
  - Why not in scope now: Paste UX requires judgment calls beyond fidelity; forking keeps this spec focused.
  - Triggers to revisit: After this spec ships; when V1 Playwright tests surface a paste-fidelity regression; when an author reports paste-corrupted content.

- **Render-layer sanitization specification (docs site).**
  - What we learned: Raw HTML now flows through our storage. Docs site (Fumadocs/MDX) is responsible for XSS sanitization. Current Fumadocs config is unaudited for our HTML surface.
  - Recommended approach: Follow-up investigation of Fumadocs sanitization + DOMPurify integration.
  - Why not in scope now: Storage-layer is our spec boundary.
  - Triggers to revisit: Before any untrusted-authorship features; during any docs-site security audit.

### Identified

- **3+ client concurrent construct mutation.** F3 verified 2-client; 3+ is extrapolation. Needs dedicated investigation if production use evolves to large collaborative teams.
- **Orphan linkRefDef background sweep.** NG9 accepts orphans. Could add a background CRDT sweep to garbage-collect unreferenced defs. Non-urgent.
- **HTML block rich preview in WYSIWYG.** Q1. T3-1 preserves raw HTML correctly as an atom node; rendering it visually is a product UX enhancement, not a fidelity concern. Ghost uses DOMPurify + `dangerouslySetInnerHTML`; AFFiNE uses iframe sandbox. Recommended approach: DOMPurify (~20KB gzipped) + NodeView rendering; not inline-editable — double-click opens source mode. Why not in scope: presentation concern inside a preservation spec; adds a runtime dependency and security surface. Triggers to revisit: when users report that `<details>`/`<summary>` or other HTML blocks are confusing in the editor view.

### Noted

- **@tiptap/markdown v4 upgrade protocol.** When v4 eventually ships: run 118-case probe, verify Option D still applies, update pinned version, re-run full invariant suite.
- **`STRESS_FIDELITY=10` for pre-release validation.** Nightly CI budget could accept 100k runs per invariant for pre-release gates.

## 16) Agent constraints

- **SCOPE:**
  - `packages/core/src/extensions/` — new/modified extensions for Tier 2 attrs + Tier 3 custom nodes (bullet-list, ordered-list, heading, code-block, emphasis, bold, link, hardBreak, horizontalRule, htmlBlock, linkRefDef)
  - `packages/core/src/extensions/frontmatter.ts` — regex fixes
  - `packages/core/src/index.ts` — export new extensions
  - `packages/app/src/editor/observers.ts` — IF needed for Tier 2 attr plumbing
  - `packages/app/tests/fidelity/` (new directory) — invariant test suite, PBT arbitraries, corpus loaders
  - `packages/app/tests/integration/conversion-fidelity.test.ts` — tightened assertion
  - `packages/app/tests/integration/bridge-matrix.test.ts` — V2 convergence test
  - `packages/app/src/editor/TiptapEditor.tsx` — register `clipboardTextParser` EditorProps (R18)
  - `packages/app/tests/stress/paste-fidelity.e2e.ts` (new) — V1 paste baseline
  - `packages/app/package.json` — new `test:fidelity` script + pin `@tiptap/markdown` exact
  - `turbo.json` — new `test:fidelity` task
  - `CLAUDE.md` — sanitization boundary + invariants section
- **EXCLUDE:**
  - `node_modules/@tiptap/*` — no source forks; only runtime monkey-patches
  - Full paste-UX changes (HTML paste sanitization, detection heuristics, DOMPurify, toast confirmation) — D8 deferral. Note: R18 `clipboardTextParser` for text/plain always-parse IS in scope (Phase 4).
  - Any sanitization logic in storage layer — NG4
  - Any `@tiptap/markdown` version bump without re-running the probe
  - `packages/server/src/external-change.ts` — V2 test is integration-level; no production changes
  - Any migration script to rewrite existing docs — NG self-heal on next save
- **STOP_IF:**
  - `bun run check` fails on any intermediate commit
  - PBT fails on an invariant with no matching bug in our catalog (may indicate an unknown sparse-bug class)
  - `@tiptap/markdown` minor bump drops in mid-implementation (re-run probe, verify patches, re-assess)
  - Miles's PR #39 merges with unexpected changes to `standalone.ts`, `hocuspocus-plugin.ts`, or `api-extension.ts` (re-verify conflict surface)
  - The existing `conversion-fidelity.test.ts` construct list breaks in ways we can't explain with the 7 invariants
- **ASK_FIRST:**
  - Adding any new dependency beyond `fast-check` + `commonmark.json`
  - Modifying `sharedExtensions` order (wiki-link + jsx-component positioning matters)
  - Adding a custom node type outside T3-1 / T3-2 / T3-3
  - Changing the `STRESS_FIDELITY` default from 1000 runs
  - Shipping any paste-handler change (deferred per D8)
