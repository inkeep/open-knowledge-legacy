# Markdown Pipeline Engineering Health

**Status:** Draft — Iterate in progress
**Owner(s):** Nick Gomez
**Baseline commit:** `2de299b`
**Related:**
- `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` (sister spec — Rust port; this spec is prerequisite foundation)
- `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md` (parallel workstream — agnostic MDX + rawMdxFallback)
- `reports/crdt-observer-bridge-latency-analysis/REPORT.md` (motivational evidence)
- `reports/collaborative-editor-timing-best-practices/REPORT.md` (cross-reference: timing constants validated against prior art)

---

## 1) Problem statement (SCR)

**Situation.** Open Knowledge has a TypeScript-canonical markdown pipeline (`packages/core/src/markdown/`, ~2,900 LOC) that serializes CRDT state to disk and parses it back on load, external change, and agent writes. The pipeline has 10 active fidelity invariants (I1-I10) with I11 pending tolerant parsing merge (11 total planned), and 11 documented irreducible gaps (NG1-NG11). CLAUDE.md's "seven fidelity invariants" section enumerates I1-I7 and is stale relative to the codebase (I8-I10 exist on disk); the stale CLAUDE.md text is a separate docs-update follow-up. The sister markdown-engine-rust-bridge spec proposes a Rust port to drop server-side parse latency. That spec defines byte-identical TS↔Rust equivalence as its correctness contract. Any bug in the TS reference propagates byte-for-byte to the Rust port.

**Complication.** Deep investigation (/assess-findings on the Rust spec's pre-work + targeted /explore + /research) surfaced concrete findings that are invisible today but load-bearing tomorrow:

1. **Super-linear parse scaling in the current pipeline.** Measured: 9.5ms / 73ms / 494ms / 1,265ms / 3,594ms at 100/1K/5K/10K/20K blocks. Scaling 1K → 10K is 17x for 10x more blocks; 10K → 20K is 2.86x for 2x more blocks. Early profiling (pre-R3b) indicates `remarkParse` (micromark core, upstream code we don't own) dominates at scale — precise per-stage breakdown is R3b's deliverable. Our custom plugin layer is linear or near-linear, but contains two concrete architectural anti-patterns: a per-uppercase-JSX-tag O(n·m) scan in the R23 guard, and per-parse processor reconstruction (Docusaurus #4978 anti-pattern).

2. **Serialization bugs masked by permissive tests.** The CommonMark spec corpus test (`packages/app/tests/fidelity/corpus-commonmark.test.ts`) marks 19 of 24 sections as "NORMALIZE" (crash-free only, no idempotence assertion). Measurement shows 13 of those 19 are already 100% idempotent — the test is strictly more permissive than necessary. 6 sections have 1.1%-8.3% idempotence failure rates hiding specific bugs: escape cumulation, emphasis delimiter instability, list nesting normalization loss, HTML block CDATA fallthrough, link URL paren escaping, image default-handler re-escaping. `KNOWN_CRASH_CEILING=50` tolerates 50 crashes (actual: 0). 7 stale `@tiptap/markdown` references exist across 4 files despite the dependency being removed in PR #83.

3. **Silent regression risk on irreducible gaps.** NG5/6/9/10 are pinned as byte-identity tests. NG1 (blank-line normalization) and NG11 (empty-doc paragraph synthesis) are documented but untested. A well-intentioned "fix" to either would silently diverge output for documents relying on current behavior — precedent #9 warns about exactly this class of bug (CRDT-permanent, multi-peer-broadcast data loss).

4. **Test architecture anti-patterns.** The parse pipeline runs 5 separate post-parse tree traversals per document — 3 via `unist-util-visit` (`restoreFromMdx`, `autolinkPromotionPlugin`, `positionSlicePlugin`) and 2 via ad-hoc mechanisms (`docStartThematicFixPlugin` inspects `tree.children[0]`; `unknownMdastGuardPlugin` uses a custom `walk`). The heterogeneity of traversal mechanisms is itself a smell; the `unist-util-visit` README explicitly warns against multi-visit patterns for the 3 that use it. The I3 test's `markdownDoc` arbitrary always joins blocks with `\n\n`, so multi-blank-line inputs never reach the test — I3 doesn't deliver the coverage its name implies. Test fixtures are embedded in test files, preventing reuse across test layers.

The Rust port would inherit all of issue 2, most of issue 4, and all NG gaps unchanged via byte-identical equivalence. If TS is wrong, Rust will be wrong byte-for-byte.

**Resolution.** Ship a TS-only engineering-health spec that applies the greenfield directive ("no deferred tech debt, architectural correctness over pragmatism") to the markdown pipeline. 20 P0 functional requirements (R3 split into R3a/R3b, R5 split into R5a/R5b):

- **Measure.** Synthetic benchmark corpus (R18), committed benchmark harness (R1), re-measured baseline (R2), committed profile harness (R3a/b), calibrated regression gate (R4), parse-health regression gate (R19).
- **Fix what's in our code.** R23 guard super-linear patterns → O(n log n) (R15). Cache unified processor + plugin-idempotency refactor for two mutating plugins (R16). 2-phase merged visitor for parse-side passes, gated by byte-for-byte mdast diff (R17 + R20). Fix 6 serialization bugs with shared-root-cause consolidation (R6). `parseWithFallback` perf + boundary coverage (R23).
- **Tighten tests.** Promote 13 CommonMark sections to idempotence + drop `KNOWN_CRASH_CEILING` to 0 (R5a). Remove 7 stale `@tiptap/markdown` references (R5b). Pin NG1 + NG11 byte-identically (R7). Extend I3's `markdownDoc` arbitrary for multi-blank-line coverage (R13). PBT invariants for 6 fixed handlers (R14).
- **Restructure.** Externalize fixtures — migrate + consolidate existing two locations into single canonical `packages/core/src/markdown/fixtures/` with duplication detection (R8). Calibrated three-tier CI structure (R9).

Upstream issues (remarkParse super-linearity, remark-gfm table super-linearity) are explicit Future Work because the fixes live in libraries we don't own. This spec is the TS-side architectural audit.

Shares `pipeline.ts` with the tolerant-parsing spec but touches disjoint regions (tolerant parsing modifies `pipeline.ts:26-27` + `parse-with-fallback.ts`; this spec modifies `createParseProcessor` and adds the merged walker). Merge is mechanical — see §13 Risks. Delivers production value whether or not the Rust port ever ships.

---

## 2) Goals

- **G1. Published perf truth.** Committed benchmark (R1) consumes pinned corpus (R18); produces ground-truth parse/serialize latency at 100/1K/5K/10K/20K blocks. Calibrated regression gate (R4) in tier-2 CI. Parse-health regression gate (R19) catches silent degrade-not-crash regressions.
- **G2. Architectural correctness in our code.** R23 guard reaches O(n log n) (R15). Unified processor cached with idempotency refactor for both mutating plugins (R16). Parse-side passes reduced from 5 to 2 phases via merged-dispatcher visitor, gated by byte-for-byte mdast diff (R17 + R20).
- **G3. Zero silent test tolerance.** `KNOWN_CRASH_CEILING = 0` (R5a). Zero stale `@tiptap/markdown` references (R5b). 13+ CommonMark sections promoted to idempotence (R5a).
- **G4. Fidelity bugs fixed.** The 6 sections with 1.1%-8.3% idempotence failure (emphasis, backslash, lists, HTML blocks, links, images) reach 100% idempotence via root-cause-consolidated fixes (R6). Each has a PBT invariant preventing regression (R14).
- **G5. NG coverage complete.** NG1 and NG11 pinned byte-identically with correct canonicals per `evidence/ng-pinned-canonicals.md` (R7). I3's `markdownDoc` arbitrary generates multi-blank-line inputs (R13).
- **G6. Fixtures externalized.** Test fixtures consolidated into a single canonical location at `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/` — existing two locations (`packages/app/tests/fixtures/` + `packages/app/tests/fidelity/fixtures/`) migrated and de-duplicated (R8).
- **G7. CI tier structure.** Three tiers defined, budgets calibrated against measured baselines (not aspirational). Perf regression gate lives in tier-2. No flat PR-time pressure (R9).
- **G8. `parseWithFallback` coverage complete.** Perf bound (fallback within 5× happy path) + parametric `MAX_SPLIT_DEPTH` boundary test (R23). Closes the one untested-at-scale code path in the fallback pipeline.

---

## 3) Non-goals

- **[NEVER] NG1:** Rust implementation. This spec is TS-only foundation. Rust port is the sister spec's scope.
- **[NEVER] NG2:** Changing the dual-CRDT model (Y.XmlFragment + Y.Text).
- **[NEVER] NG3:** Pipeline architectural changes beyond what's listed (handler reorganization, Astro bridge pattern, etc.). That's the Rust spec's Phase 11 refactor.
- **[NOT NOW] NG4:** I11 invariant test (rawMdxFallback coverage). Introduced by tolerant parsing spec; this spec lands in parallel.
- **[NOT NOW] NG5:** NG7 and NG8 byte-identity tests. MDX-specific; defer to tolerant parsing.
- **[NOT NOW] NG6:** Fixture sharing between `bun test` and `cargo test`. Fixtures get externalized (G6) but symlink configuration waits for Rust port Phase 0.
- **[NOT NOW] NG7:** Upstream issue filing (micromark super-linearity, remark-gfm table super-linearity). Documented in Future Work. No code change in our tree.
- **[NOT UNLESS] NG8:** Patching remark-gfm or micromark source in our tree. That's forking — permanent maintenance debt.

---

## 4) Personas / consumers

- **P1 — Engineering team.** Maintains the markdown pipeline. Benefits from: measurable perf baseline, regression gate, architectural fixes, cleaner test signals.
- **P2 — End users (markdown authors).** Writes long content. Benefits from: R23 guard O(n log n) fix (MDX-heavy content), processor caching (Observer B reparse cycle), merged walker (all document sizes).
- **P3 — AI coding agents.** Implements new markdown behaviors. Benefits from: externalized fixtures (discoverable), tight test coverage (fast feedback), CI tier structure (fast PR loop), cleaner processor surface (R16).
- **P4 — Rust-port contributor (future).** Ports TS handlers to Rust against equivalence tests. Benefits from: bug-free TS reference (byte-identical equivalence doesn't inherit bugs), externalized fixtures, established perf baseline, merged visitor pattern to replicate.
- **P5 — Multi-agent concurrent load.** Five concurrent 2K-line writes stack latencies. Benefits from: every TS perf win multiplies across clients.

---

## 5) User journeys

- **J1 (P2, paste long transcript):** User pastes 5,400-line YouTube transcript (~2,350 blocks). Interpolated from the synthetic-corpus baseline (`evidence/perf-baseline-measured.md`): ≈200ms on heading+paragraph mix; real-transcript content (denser prose, sparse structure) may raise this to the 300-400ms range — R1 with an R18 transcript-shaped corpus will pin the number. After R15+R16+R17: measurable improvement expected at 1K-5K block range; magnitude reported post-fix rather than pre-declared. Bigger improvements come from the Rust port.
- **J2 (P1, ship a markdown change):** Engineer modifies a serialize handler, runs `bun run check` (tier-1 budget). Catches regressions in tier-1 time budget. Tier-2 nightly run fails when perf exceeds calibrated threshold (`max(2× p99 variance, 10% floor)`) with specific percentile report. Tier-3 weekly runs elevated-seed PBT.
- **J3 (P1, debug production latency):** Engineer gets a report "editor feels slow on long docs." Runs committed benchmark harness locally at the same doc size, gets reproducible numbers, can bisect.
- **J4 (P3, add a new handler):** AI agent adds a new mdast node handler. Finds existing handler fixture directory, writes fixtures alongside existing ones (G6), extends merged walker dispatcher with one case (R17 pattern). PBT invariant added following R14 pattern.
- **J5 (P4 future, port handler to Rust):** Contributor ports emphasis.ts from TS to Rust. Runs equivalence tests against externalized fixture corpus. All 11 NGs pinned → false positives minimized. Merged walker pattern informs Rust-side structure.

---

## 6) Requirements

### Functional (20 P0 requirements)

| # | Priority | Requirement | Acceptance criteria |
|---|----------|-------------|--------------------|
| **R1** | P0 | Committed benchmark harness | New file `packages/core/tests/perf/markdown-bench.test.ts` measures `parse`, `serialize`, and full round-trip at 100/1K/5K/10K/20K blocks. Consumes corpus from R18. Emits structured JSON to `packages/core/tests/perf/results.<timestamp>.json` (git-ignored; published as CI artifact). Methodology: 10 warm-up iterations per block count, `Bun.gc(true)` between runs, pinned `bun@1.3.11`, documented hardware class (CI runner spec). Lives in tier-2 CI (not tier-1). |
| **R2** | P0 | Perf baseline committed | `evidence/perf-baseline-measured.md` contains fresh numbers at 100/500/1K/2.5K/5K/10K/**20K** blocks measured on this spec's branch. Becomes the comparison point for R4. Re-measure with R1's final methodology once R1 lands. |
| **R3a** | P0 | Profile parse pipeline at scale | Diagnostic harness committed to `evidence/perf-profile-harness.ts` (reproducible; not promoted to `packages/core/tests/`). Consumes R18 corpus from `fixtures/perf/` for measurement parity with R1/R2/R4. Runs at 100/1K/5K/10K/20K blocks with per-stage timing. Identifies super-linear contributors by stage. |
| **R3b** | P0 | Publish profile findings | `evidence/perf-profile.md` contains: per-stage timing table, slope analysis, super-linear terms identified (e.g., `remarkParse` share, R23 guard share, per-plugin share). Findings also feed the sister-spec coordination item in §Non-functional (sister Rust spec's motivational numbers). |
| **R4** | P0 | Perf regression gate in CI | CI fails if any block size regresses beyond `max(2× p99 variance, 10% absolute floor)`. Calibration: measure 10-run variance on tier-2 runner before gate lands. Lives in tier-2 (10K-block parse is seconds, not sub-minute). Gate lands AFTER calibration — do not pre-commit to a specific threshold in code. |
| **R5a** | P0 | CommonMark corpus tightening | Move 13 fully-idempotent sections (Paragraphs, Thematic breaks, Entity refs, Hard breaks, Setext, Link defs, ATX, Autolinks, Raw HTML, Fenced blocks, Blockquotes, List items, Code spans) from `NORMALIZE_SECTIONS` (at `packages/app/tests/fidelity/corpus-commonmark.test.ts:24-44`) to idempotence assertion. Lower `KNOWN_CRASH_CEILING` from 50 (line 49) to 0. |
| **R5b** | P0 | Global @tiptap/markdown cleanup | Remove all 7 stale `@tiptap/markdown` references. Locations verified: `corpus-commonmark.test.ts:48,63`, `p0-entity-escape.test.ts:4,7,93`, `packages/core/src/markdown/index.ts:5`, `packages/app/src/server/agent-flow.test.ts:11`. Dependency removed in PR #83 (commit `ee030b5`, 2026-04-13). |
| **R6** | P0 | Fix 6 serialization bugs + consolidate shared root causes | Each of 6 bugs has root cause documented in `evidence/r6-failure-modes.md` (all 6 now characterized). Bugs: (1) emphasis delimiter instability, (2) backslash escape cumulation, (3) list nesting normalization, (4) HTML blocks CDATA fallthrough + safeText over-escaping, (5) links URL paren escaping lost, (6) images default handler re-escaping. Consolidated where root causes are shared: escape-idempotency at text handler layer (fixes #1-#4 tendency), URL-handler parse↔serialize parity (fixes #5, #6). Acceptance: all 19 formerly-NORMALIZE sections reach 100% CommonMark idempotence. |
| **R7** | P0 | NG1 + NG11 byte-identity tests | New test file `packages/app/tests/fidelity/ng-pinned.test.ts` pins byte-identity for: (a) NG1 — `serialize(parse("# H\n\n\n\nP\n")) === "# H\n\nP\n"`; (b) NG11 — `serialize(parse("---\ntitle: X\n---\n")) === ""` (yaml-alone triggers `ensureNonEmptyDoc` synthesis; empty paragraph serializes to empty string). Canonicals observed via direct probe, pinned in `evidence/ng-pinned-canonicals.md`. **Note:** the prior example `---\n\n---` does NOT trigger NG11 — it parses as two thematicBreak nodes. That case is NG10 and is already covered by three existing tests. |
| **R8** | P0 | Externalize fixtures (migrate + consolidate) | New canonical location `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/` with fixture loader helpers. Migrate existing fixtures at `packages/app/tests/fixtures/` (2 files) and `packages/app/tests/fidelity/fixtures/` (2 files) — merge duplicates (`gfm-examples.json` exists in both). Add lint/test-time assertion that no test file contains fixture strings matching externalized corpus. R1/R18 perf corpus lives in `fixtures/perf/`. |
| **R9** | P0 | CI tier structure (calibrated, not aspirational) | Three tiers defined in `turbo.json` + workflow files. Tier budgets calibrated against measured baselines (CLAUDE.md: `bun run check` ~20-30s warm, `bun run check:full:parallel` ~2 min warm) with 1.5× headroom for future additions. Tier 1 (per PR): lint, typecheck, unit, core integration. Tier 2 (merge + nightly): fidelity corpus, perf regression gate, full integration, fuzz, PBT at 1K samples. Tier 3 (weekly): elevated-seed PBT 10K, stress scenarios, perf trend. Measure + pin before committing absolute budgets. |
| **R13** | P0 | Extend I3's `markdownDoc` arbitrary for multi-blank-line coverage | The arbitrary at `packages/app/tests/fidelity/arbitraries.ts:287-289` currently joins blocks with literal `\n\n` — never exercises multi-blank-line runs. Replace join with `fc.nat({min: 0, max: 3})` blank-line counts per boundary. I3 gains PBT coverage for NG1 via 1K runs default / 10K tier-3. Complements R7's byte-identity test. |
| **R14** | P0 | PBT invariants for 6 previously-failing serialize handlers | New files in `packages/app/tests/fidelity/`: `invariant-emphasis-cumulation.test.ts`, `invariant-backslash-idempotence.test.ts`, `invariant-list-nesting.test.ts`, `invariant-html-block-edge.test.ts`, `invariant-link-edge.test.ts`, `invariant-image-edge.test.ts`. Arbitrary shapes pre-defined in `evidence/r6-failure-modes.md` §"Implication for R14" — not during-implementation decision. Each uses fast-check targeting the specific bug shape. Tier-2 CI at 1K samples; tier-3 at 10K. |
| **R15** | P0 | R23 guard: audit + fix all super-linear regex patterns | In `autolink-void-html-guard.ts:protectFromMdx`, the per-uppercase-JSX-tag `rest.includes(closeTag)` scan at line 194 is the main O(n²) offender. Audit the other regex passes (`LOWERCASE_HTML_TAG_RE`, `HTML_CLOSE_TAG_RE`, `HTML_COMMENT_RE`, `AUTOLINK_RE`) for similar super-linear patterns and fix any found. Replace with pre-indexed position maps + binary search (O(n log n) worst case). Verify via benchmark harness on MDX-heavy synthetic document. |
| **R16** | P0 | Cache unified processor + plugin idempotency audit + memory measurement | `createParseProcessor(opts)` called once at `MarkdownManager` construction, not per `parse()` call (currently `pipeline.ts:99`). Fixes Docusaurus #4978 anti-pattern. **Idempotency refactor required for TWO plugins** (not one as originally claimed): `remarkMdxAgnostic` (`remark-mdx-agnostic.ts:25`) and `remarkWikiLink` (`wiki-link-micromark.ts:239`) both push to `data().micromarkExtensions`. Refactor both to check-before-push: `if (!data.micromarkExtensions.some(e => e === EXPECTED)) push()`. Five other plugins are idempotent as-is (per `evidence/pipeline-refactor-audit.md`). Serialize processor cached similarly. Post-fix heap snapshot in `evidence/` documents memory footprint per cached MarkdownManager instance. |
| **R17** | P0 | Merge parse-side visit() passes into 2-phase dispatcher | **Corrected scope** (per `evidence/pipeline-refactor-audit.md`): a single same-node visitor cannot absorb all 5 passes — pass 2 (`autolinkPromotionPlugin`) regex-matches on literal `<` and `>` chars that pass 1 (`restoreFromMdx`) restores from PUA sentinels. Implementation must be 2-phase: **Phase A:** pass 1 alone (all-nodes value-field restoration); **Phase B:** passes 2-5 merged into single dispatcher visitor (autolink promotion → doc-start thematic fix → position slice → unknown mdast guard), with internal ordering preserving pass-4-before-pass-5 for `.data.sourceRaw` dependency. Uses `unist-util-visit` as the outer loop (handles mid-visit children mutation correctly). Net: 2 visitor phases (down from 5). |
| **R18** | P0 | Synthetic benchmark corpus specification | Commit perf corpus to `packages/core/src/markdown/fixtures/perf/` (per R8): fixed-seed synthetic documents with documented block-type mix (e.g., 40% paragraph, 25% heading, 15% lists, 10% code blocks, 5% tables, 5% MDX components). One fixture per block count (100/1K/5K/10K/20K). R1/R2/R3a/R4 all consume from this corpus; without corpus definition, these measurements are not comparable across runs. |
| **R19** | P0 | Parse-health regression gate in tier-2 CI | Assert against `packages/core/src/metrics/parse-health.ts` counters after the fidelity corpus run: `parseFallback.wholeDoc === 0` (no whole-doc fallbacks on valid CommonMark), `parseFallback.blockLevel <= <corpus-measured baseline>` (no regression vs current main). Guards against silent degrade-not-crash regressions from R16 (processor caching state bleed) and R17 (merged walker ordering drift) that R4 (latency-only) would miss. Infrastructure already exists — this R-item is the CI assertion + baseline capture. |
| **R20** | P0 | Byte-for-byte mdast diff gate for R17 merge | Before R17 lands: committed `evidence/r17-mdast-equivalence.md` demonstrates byte-identical mdast output between the pre-merge 5-pass pipeline and the post-merge 2-phase pipeline across the full fixture corpus (R8's commonmark + gfm + mdx + wiki-links + frontmatter + ng-pinned + perf subdirectories). Diff gate runs as a one-time validation during R17 implementation — deletes after R17 ships green. The only safe correctness proof for the ordering-sensitive merge. |
| **R23** | P0 | `parseWithFallback` perf + boundary coverage | `packages/core/src/markdown/parse-with-fallback.test.ts` extended with: (a) perf test at 1K / 10K blocks — asserts fallback path runs within 5× the happy-path parse time (O(2^MAX_SPLIT_DEPTH) worst case bounded); (b) parametric boundary test — `MAX_SPLIT_DEPTH=20` at depth 20 succeeds, at depth 21 falls through to whole-doc. Currently 12 tests exist with zero perf coverage and only one non-parametric depth test. |

### Non-functional

- **Performance (constraint):** No regressions in any test, stress, or fuzz measurement. R15/R16/R17 combined produce measurable improvement at 1K-5K block sizes. Absolute target not specified — directive is correctness, not arbitrary number.
- **Compatibility (constraint):** No public API changes. `MarkdownManager.parse()`, `.parseWithFallback()`, `.serialize()` unchanged. (Note: `.parseSafe()` was already removed in a prior consolidation pass as a redundant alias per the greenfield precedent; not this spec's change.)
- **Blast radius (constraint):** Confined to `packages/core/src/markdown/`, `packages/app/tests/fidelity/`, `packages/core/tests/perf/` (new), `turbo.json`, `.github/workflows/`. Bridge path (`packages/core/src/bridge/` — `mergeThreeWay`, `applyFastDiff`, `diffLinesFast`) is orthogonal by construction and NOT modified. `packages/server/`, `packages/app/src/editor/` unchanged.
- **Precondition (not a deliverable):** `bun run check` green before and after. No regressions in bridge-matrix, conversion-fidelity, I1-I10, handlers, wiki-link, stress, fuzz. (Was R10 in prior draft; reclassified as precondition.)
- **Sister-spec coordination (Should, cross-worktree):** Update `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` (branch `spec/markdown-source-text-fidelity` — worktree path `.claude/worktrees/markdown-source-text-fidelity/` is the current checkout location but may move; branch name is the durable reference) — replace 460ms / 165ms motivational numbers with this spec's measured baseline, cite `evidence/perf-baseline-measured.md`. Cross-worktree — submit as follow-up PR to sister branch when it re-enters active iteration. (Was R11 in prior draft.)

---

## 6.5) Requirement ordering

Dependency graph — implementation must respect these edges:

```
R18 (corpus spec)     ──┬──▶  R1 (bench harness)  ──▶  R2 (baseline re-measured)
                        │                               │
                        └──▶  R3a (profile harness) ────┤
                                                        │
R2 + R3a (profile)    ──────────────────────────────▶  R4 (gate, calibrated, lands LAST)
                                                        │
                                                        ├──▶ R19 (parse-health gate, shares infra)

R8 (fixtures externalized)  ──▶  R7, R13, R14, R18  (all consume externalized corpus)

R6 (fix bugs + characterize root causes)  ──▶  R5a (promote 13 sections + fix 6 remaining)
                                            ──▶  R14 (PBT arbitraries target characterized shapes)

pipeline.ts refactor chain (sequenced, must respect internal ordering):
  R15 (R23 guard, cleanly separable)
    │
    ▼
  R16 (processor caching — plugin-idempotency refactor for remarkMdxAgnostic + remarkWikiLink first)
    │
    ▼
  R17 (merged walker — gated by R20 mdast-diff on full corpus)

R20 (mdast diff gate) — one-time validation during R17; deleted after R17 ships green.

R23 (parseWithFallback coverage) — independent; can land any time after R8.

R5b (@tiptap cleanup) — independent; mechanical.
```

Rationale for the sequence:
- **Gates land LAST.** R4 and R19 sit downstream of their measurement prerequisites so they can't fire on environmental noise or partially-stabilized baselines.
- **Corpus-first for perf.** R18 precedes R1/R2/R4 because without a pinned corpus, measurements aren't comparable run-over-run.
- **Characterize before inventing arbitraries.** R14's PBT arbitraries target specific bug shapes; R6's diagnosis (evidence/r6-failure-modes.md) is the precondition.
- **Refactor chain.** R15 is independent. R16 precedes R17 because the merged walker (R17) runs inside the cached processor (R16); doing R17 first would rewrite code that R16 then restructures. R20 gates R17's merge — without byte-for-byte mdast equivalence verified on the full corpus, subtle ordering bugs are invisible.
- **Independent items parallelizable.** R5a, R5b, R23, R8 can land on separate branches; R15 can land any time after R8 has corpus ready (for benchmark verification).

## 7) Success metrics

- **M1:** R1 benchmark harness committed at 5 block counts (100/1K/5K/10K/20K), passing in tier-2, consuming R18 corpus. R2 baseline captured at 7 block counts (100/500/1K/2.5K/5K/10K/20K — adds 500 / 2.5K intermediate points for curve shape).
- **M2:** `bun run check` green across all 20 requirements. Zero regressions in bridge-matrix, conversion-fidelity, I1-I10, handlers, wiki-link, stress, fuzz. Acts as the umbrella check-green for R3a (harness committed), R3b (profile published), R4 (gate live), R8 (fixtures migrated), R9 (tiers defined) — each covered by specific Mx metrics below where an explicit observable beyond "tests pass" exists.
- **M3:** CommonMark corpus: 0 crashes (R5a), all 19 formerly-NORMALIZE sections pass idempotence (R6). Zero `@tiptap/markdown` references remain (R5b).
- **M4:** NG1 and NG11 byte-identity tests pass against canonicals in `evidence/ng-pinned-canonicals.md` (R7). I3's arbitrary generates multi-blank inputs (R13).
- **M5:** 6 new PBT invariants (one per formerly-failing handler) pass at tier-2 1K samples and tier-3 10K samples (R14).
- **M6:** R15 benchmark shows MDX-heavy content parse improvement (magnitude measured post-fix).
- **M7:** R16 benchmark shows per-parse overhead reduction. Post-fix heap snapshot captured for per-MarkdownManager footprint.
- **M8:** R17 produces byte-identical mdast output to pre-merge 5-pass pipeline on the full fixture corpus (R20 diff gate green at merge time).
- **M9:** R18 corpus committed; R1/R2/R3a/R4 all consume from fixtures/perf/.
- **M10:** R19 parse-health gate asserts `wholeDoc === 0` and `blockLevel` within baseline tolerance on tier-2 runs.
- **M11:** R23 `parseWithFallback` perf + boundary tests pass (fallback within 5× happy path; depth-20/21 boundary parametrically verified).
- **M12:** R3a diagnostic harness committed to `evidence/perf-profile-harness.ts`; R3b `evidence/perf-profile.md` published with per-stage timing table, slope analysis, super-linear terms by stage.
- **M13:** R4 regression gate live in tier-2 with threshold `max(2× p99 variance, 10% floor)` from calibration measurement; synthetic-regression test proves gate fires on injected slowdown.
- **M14:** R8 fixtures live at single canonical location `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/`; lint/test-time assertion confirms no inline fixture strings remain in test files outside loader helpers.
- **M15:** R9 tier definitions committed in `turbo.json` + `.github/workflows/*.yml` with budget comments matching measured baselines.

---

## 8) Current state

### Pipeline topology (parse direction, 12 stages)

```
remarkParse → remarkFrontmatter → remarkMdxAgnostic → remarkGfm →
remarkWikiLink → restoreFromMdx → autolinkPromotionPlugin →
docStartThematicFixPlugin → positionSlicePlugin →
unknownMdastGuardPlugin → ensureNonEmptyDoc → remarkProseMirror
```

### Measured perf baseline (100-20K blocks)

| Blocks | Doc size | Parse time (avg of 3) |
|--------|----------|----------------------|
| 100 | 8K chars | 9.5ms |
| 500 | 42K chars | 41ms |
| 1,000 | 85K chars | 73.6ms |
| 2,500 | 215K chars | 213.7ms |
| 5,000 | 432K chars | 493.9ms |
| 10,000 | 867K chars | 1,265.3ms |
| 20,000 | 1.8M chars | 3,593.8ms |

Scaling 1K → 10K: 17x time for 10x blocks. 10K → 20K: 2.86x for 2x blocks (super-linearity intensifies). Dominant super-linear term: `remarkParse` (micromark core). Our custom plugins: linear or near-linear.

### Test architecture state

- **Fidelity suite**: 23 test files, ~2,330 LOC. Invariants I1-I10 active (I11 pending tolerant parsing); total planned = 11.
- **CommonMark corpus**: 652 examples. 19/24 sections NORMALIZE (13/19 actually idempotent). `KNOWN_CRASH_CEILING=50` (actual: 0).
- **GFM corpus**: 282 examples.
- **Markdown unit tests**: 15 files, ~2,021 LOC.
- **NG coverage**: NG5/6/9/10 pinned byte-identically; NG1/NG11 unpinned.
- **CI**: flat structure, all tests on every PR, ~2.5 min warm.

See evidence files:
- `evidence/perf-baseline-measured.md` — measured timings at 100-20K blocks
- `evidence/commonmark-corpus-gaps.md` — NORMALIZE section idempotence rates + stale @tiptap refs
- `evidence/ng-coverage-audit.md` — NG1-NG11 byte-identity test coverage
- `evidence/r6-failure-modes.md` — root causes for all 6 R6 bugs (3 newly characterized: HTML blocks CDATA, Links URL escaping, Images default handler)
- `evidence/ng-pinned-canonicals.md` — observed canonical outputs for R7's NG1 + NG11 tests; corrects a prior example misclassification
- `evidence/pipeline-refactor-audit.md` — plugin idempotency matrix (R16) + visitor-pass ordering constraints (R17)

## 9) Proposed solution

### Architecture changes in our code

**R15 — R23 guard optimization.** Current code in `autolink-void-html-guard.ts`:
```
result.replace(/</g, (match, offset) => {
  const rest = result.slice(offset);
  if (rest.includes(closeTag)) { ... }
})
```
Each `.includes()` is O(rest.length). With N `<` chars × source size m, total work is O(n·m), approaching O(n²). Fix: one-time pre-pass building `Map<tagName, sortedOffsets[]>`, then binary search per match. O(n log n) worst case.

**R16 — Processor caching.** Current: `parseMd()` calls `createParseProcessor(opts)` per invocation. Fix: build once at `MarkdownManager` construction, reuse across calls. Verify `remarkWikiLink` attacher is idempotent (it mutates `data().micromarkExtensions`) — may need refactor to append only on first attach.

**R17 — 2-phase merged visitor** (corrected from "5 into 1" — see `evidence/pipeline-refactor-audit.md` for full analysis).

Pass 2 (`autolinkPromotionPlugin`) regex-matches on literal `<` and `>` that Pass 1 (`restoreFromMdx`) restores from PUA sentinels. A single same-node visitor cannot satisfy this ordering — Pass 2 must see a fully-restored tree. Implementation must be 2-phase:

**Phase A — value-field restoration (Pass 1 alone):**
```
visit(tree, (node) => {
  // restore PUA sentinels in .value, .url, .title, .alt
});
```

**Phase B — merged dispatcher (Passes 2-5):**
```
visit(tree, (node, index, parent) => {
  autolinkPromotion.case(node, index, parent);        // may splice parent.children
  docStartThematicFix.case(node, index, parent);      // may splice tree.children at [0]
  positionSlice.case(node, index, parent);            // attaches .data.sourceRaw etc.
  unknownMdastGuard.case(node, index, parent);        // reads .data.sourceRaw written by positionSlice
});
```

**Ordering constraints inside Phase B (all load-bearing — see `evidence/pipeline-refactor-audit.md` for full per-pass analysis):**
1. Pass 2 (autolinkPromotion) requires Phase A's restored `<`/`>` — guaranteed by Phase A completing before Phase B begins.
2. Pass 4 (positionSlice) must see the tree after any structural mutation pass 2 or pass 3 performs — by running in the same node-visit callback, each pass sees the current children shape.
3. Pass 5 (unknownMdastGuard) reads `.data.sourceRaw` written by pass 4 — the callback-order positionSlice-before-unknownMdastGuard enforces this.

`unist-util-visit` is the outer loop — it correctly handles mid-visit `parent.children` mutation from pass 2. Do NOT write a custom tree-walker; re-introduces the class of bug this refactor eliminates. Byte-for-byte mdast equivalence verified via R20 diff gate on the full fixture corpus before R17 merges.

Net: 2 visitor phases (down from current 5).

### Test tightening

**R5 — Corpus tightening.** Move 13 sections from `NORMALIZE_SECTIONS` to default (idempotence asserted). Drop crash ceiling to 0. Grep + remove 7 `@tiptap/markdown` references.

**R6 — Bug fixes.** Each of 6 handlers investigated with failing CommonMark examples → root cause documented → fix lands → idempotence passes. Escape cumulation is likely a single root cause manifesting in both Emphasis and Backslash sections — fixing once may fix both.

**R7, R13 — NG coverage.** New `ng-pinned.test.ts` with explicit byte-identity. Arbitrary extension in `arbitraries.ts` generates multi-blank inputs.

**R14 — PBT for fixed handlers.** Six invariant test files, each with fast-check arbitrary targeting the specific bug shape. Catches adjacent failure modes the example-based fix might miss.

### Test infrastructure

**R8 — Fixtures externalized.** Move embedded fixtures to `packages/core/src/markdown/fixtures/`. Test files load via helpers. Enables future reuse by `cargo test` (via symlink, deferred to Rust port Phase 0).

**R9 — CI tiering.** Tier 1: lint + typecheck + unit + core integration (<5min). Tier 2: fidelity + perf regression + fuzz + PBT 1K (<20min). Tier 3: elevated PBT + stress + perf trend (<2hr).

## 10) Decision Log

| ID | Decision | Type | Resolution | 1-way door? | Evidence |
|----|----------|------|------------|------------|----------|
| MH-D1 | Scope = full engineering-health (Option B, not narrow) | Cross-cutting | LOCKED | No | User direction: "no deferred tech debt on greenfield." |
| MH-D2 | Ship parallel with tolerant-parsing (not after) | Cross-cutting | LOCKED | No | TS-only; different directories; no merge conflict. |
| MH-D3 | TS-only (no Rust work) | Technical | LOCKED | No | Sister spec's scope. |
| MH-D4 | R3 target revised — no absolute perf improvement commitment | Technical | LOCKED | No | Baseline evidence shows super-linear scaling (`evidence/perf-baseline-measured.md`). Early indication is that `remarkParse` (upstream) dominates, but precise attribution is R3b's deliverable. Cannot commit to a specific improvement % against a hotspot in code we don't own. Refined percentages will be published when R3b's `perf-profile.md` lands. |
| MH-D5 | Remove 7 stale `@tiptap/markdown` references globally | Technical | LOCKED | No | grep: dependency removed in PR #83 on 2026-04-13; references mislead. |
| MH-D6 | Extend `markdownDoc` arbitrary for multi-blank lines | Technical | LOCKED | No | NG coverage audit subagent: I3 doesn't test what its name implies. |
| MH-D7 | Add PBT invariants for 6 formerly-failing serialize handlers | Technical | LOCKED | No | Example-based fix without PBT leaves adjacent failure modes uncaught. Greenfield directive: no deferred debt. |
| MH-D8 | R23 guard: replace O(n²) `<` scan with pre-indexed tag positions | Technical | LOCKED | No | Research subagent traced O(n·m) pattern; concrete algorithmic improvement in our code. |
| MH-D9 | Cache unified processor in MarkdownManager | Technical | LOCKED | No | Docusaurus #4978 anti-pattern; industry-recommended pattern (build once, reuse). |
| MH-D10 | Merge 5 parse-side `visit()` passes into single dispatcher | Technical | LOCKED | No | `unist-util-visit` README explicitly warns multi-pass is anti-pattern. Architectural correctness over refactor risk per greenfield directive. |
| MH-D11 | Upstream issue filing (micromark + remark-gfm) is Future Work | Cross-cutting | LOCKED | No | Upstream filing is not our code; classified Future Work per user direction on R18. Same logic applies to R3c. |
| MH-D12 | No patching of remark-gfm or micromark in our tree | Technical | LOCKED | No | Forking creates permanent maintenance debt; violates "clean codebase." |
| MH-D13 | Finding G (merged walker) — IN scope despite refactor surface | Technical | LOCKED | No | Self-corrected via /assess-findings second pass. Greenfield directive: "architectural correctness > pragmatism." |
| MH-D14 | Scope expanded 18 → 20 requirements after adversarial completeness review | Cross-cutting | LOCKED | No | Original table had 18 rows (R1, R2, R3a, R3b, R4, R5, R6-R17). Applied "strictly more correct per evidence" filter: added R18, R19, R20, R23 (+4), split R5 into R5a/R5b (+1), reclassified R10/R11/R12 to Non-functional (-3). Net: 18 → 20 deliverable rows. R21 (type hardening), R24 (parseSafe coverage), R25 (PBT for remaining transformers) excluded as not evidence-backed. See `meta/_changelog.md` 2026-04-16 entry. |
| MH-D15 | Split original R5 into R5a (corpus tightening) + R5b (@tiptap cleanup) | Technical | LOCKED | No | Different risk profiles, different rollback paths. R5a touches fidelity corpus assertions; R5b is mechanical deletion of stale references. |
| MH-D16 | R16 idempotency refactor covers `remarkMdxAgnostic` AND `remarkWikiLink`, not only the latter | Technical | LOCKED | No | Pre-implementation plugin audit (see `evidence/pipeline-refactor-audit.md`) found both plugins push to `data.micromarkExtensions`. Spec's prior single-plugin framing was incomplete. |
| MH-D17 | R17 corrected from "5 into 1" to 2-phase visitor | Technical | LOCKED | No | Pass 2's regex depends on Pass 1's PUA restoration; a single same-node visitor cannot satisfy this ordering. See `evidence/pipeline-refactor-audit.md` §R17. Net is still 2 phases (down from 5) — significant win preserved. |
| MH-D18 | R20 byte-for-byte mdast diff gate is the ONLY acceptance proof for R17 | Technical | LOCKED | No | Subtle ordering bugs in merged walker are invisible to example-based tests. Full-corpus mdast equivalence is the correctness bar. Greenfield directive: "architectural correctness over pragmatism." |
| MH-D19 | R22 (memory baseline) rolled into R16's post-fix validation, not a separate R-item | Technical | LOCKED | No | Originally surfaced as potentially load-bearing due to "multiple MarkdownManagers × cached processors." Code audit confirmed ~5 instance sites in production code (server singleton + per-editor/provider on client); not multi-hundred. Per-instance heap measurement as part of R16 validation is right-sized. |
| MH-D20 | R7's NG11 example corrected from `---\n\n---` to `---\ntitle: X\n---\n` | Technical | LOCKED | No | Direct probe (`evidence/ng-pinned-canonicals.md`) showed `---\n\n---` parses as two thematicBreak nodes (renderable), NOT as ignore-typed nodes. `ensureNonEmptyDoc` does not fire. The prior example tested NG10, not NG11 (and NG10 is already covered by 3 existing tests). Yaml-frontmatter-alone is the cleanest NG11 trigger. |
| MH-D21 | R4 threshold reframed as calibration-first (no pre-commit to 20%) | Technical | LOCKED | No | Pre-committing a hard threshold before measuring CI runner variance risks gate noise. Formula: `max(2× p99 variance, 10% absolute floor)`. Q4 conversation confirmed this direction. |
| MH-D22 | R9 tier budgets calibrated against measured baselines, not aspirational | Technical | LOCKED | No | CLAUDE.md measured baselines: `bun run check` ~20-30s warm, `bun run check:full:parallel` ~2 min warm. Tier budgets scaled to these with 1.5× headroom. Avoids inventing numbers. |

## 11) Open Questions

(All P0 questions resolved via investigation during iterate phase. Questions below are P2 / Future Work triggers.)

| ID | Question | Type | Priority | Status |
|----|----------|------|----------|--------|
| Q1 | What % improvement does R15 (R23 guard fix) actually deliver on production content? | Technical | P2 | Measure post-fix via benchmark harness. Evidence-based, not pre-declared. |
| Q2 | Do `remarkMdxAgnostic` and `remarkWikiLink` idempotency refactors preserve existing behavior? | Technical | P0 | **Resolved via plugin audit in `evidence/pipeline-refactor-audit.md`.** Both plugins push to `data.micromarkExtensions`. Refactor pattern (check-before-push) is standard unified idiom; verified by running full test suite with cached processor. |
| Q3 | Does R17 (2-phase merged walker) change mdast output byte-identically? | Technical | P0 | **Resolved by R20 diff-gate requirement.** Byte-for-byte mdast equivalence verified on full fixture corpus before R17 merges. |
| Q4 | Can R4 regression gate be calibrated tightly enough to catch real regressions without false positives on CI runner variance? | Technical | P0 | **Formula resolved: `max(2× p99 variance, 10% absolute floor)`.** Calibration: measure 10 runs on tier-2 runner pre-gate; gate lands AFTER variance characterized. |
| Q5 | Which fixture shape is right for R8? | Technical | P2 | Resolved: per-feature subdirs (`commonmark/`, `gfm/`, `mdx/`, `wiki-links/`, `frontmatter/`, `ng-pinned/`, `perf/`) with `.json` files containing `{input, expected_output, notes}` triples. Migration from existing `packages/app/tests/fixtures/` + `packages/app/tests/fidelity/fixtures/` merges two locations into one. |
| Q6 | What's the block-type mix for R18's benchmark corpus? | Technical | P2 | Resolved during R18 implementation. Starting point: rough mix observed in production corpora (40% paragraph, 25% heading, 15% lists, 10% code blocks, 5% tables, 5% MDX). Pinned once committed; future spec work can evolve the mix if production corpus shifts. |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan |
|----|-----------|-----------|-------------------|
| A1 | R15 R23 guard fix delivers measurable improvement on MDX-heavy content | HIGH | Verified post-fix via benchmark harness with synthetic MDX-heavy document. |
| A2 | 13 CommonMark sections are genuinely idempotent (not measurement artifact) | HIGH | Verified by promoting to idempotence assertion (R5a) and running in CI. If false, CI fails loudly. |
| A3 | The 6 serialization bugs are fixable without architectural changes | MEDIUM | Per-bug root causes characterized in `evidence/r6-failure-modes.md`. Consolidation path (escape-idempotency + URL-parity) expected to address 4-6 of 6. If any requires architectural change, escalate and reclassify as NG. |
| A4 | R4 regression gate's `max(2× p99 variance, 10% floor)` is appropriate | MEDIUM | Calibrated via 10-run variance measurement on tier-2 runner. Variance determines the active threshold; 10% floor prevents over-tight gates on low-variance runners. |
| A5 | R16 processor caching doesn't break existing tests | HIGH | Run full test suite against cached-processor implementation. Identity of mdast output verifiable via R19 parse-health counters + fidelity suite. |
| A6 | R17 2-phase merged walker produces byte-identical mdast output | HIGH | R20 diff gate: byte-for-byte mdast comparison on full fixture corpus (R8 subdirs). Must be 100% identical before R17 merges. |
| A7 | R18 synthetic corpus block-type mix represents production parse load well enough for meaningful regression detection | MEDIUM | Block-type mix chosen from observed production corpora (~6K-file research dataset + ~2K-file agent docs). Validated by comparing R18 parse times against real-corpus spot-check. If mix drifts from production, update R18 fixtures. |
| A8 | R19 parse-health counters remain meaningful under R16's caching refactor | HIGH | Counter updates are module-local mutations in `parse-health.ts`, not tied to processor identity. Confirmed by direct code read. |
| A9 | R23's 5× fallback-path perf bound is stable across MDX content shapes | MEDIUM | Fallback path invokes recursive parse on split regions; 5× is the worst-case when every block triggers MAX_SPLIT_DEPTH descent. Typical production content falls far below this bound; if tests fail at 5×, investigate the specific shape rather than loosening the bound. |

## 13) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| R16 processor caching exposes hidden per-call state in a plugin we missed | Low | Medium | Full plugin audit already committed (`evidence/pipeline-refactor-audit.md`) — 5 of 7 plugins idempotent, 2 require check-before-push refactor. R19 parse-health gate catches any silent state-bleed regression. If a plugin surfaces later that can't be made idempotent, accept per-call construction for that one plugin. |
| R17 merged walker introduces a subtle regression in pass ordering | Medium | High | R20 byte-for-byte mdast diff gate on full fixture corpus is the hard acceptance criterion. Merge only lands after diff-gate runs green. If flaky: preserve 5-pass implementation under an internal branch until 3 consecutive green CI runs, then retire. |
| R17 pass-2 children splice corrupts iteration in merged visitor | Low | High | Use `unist-util-visit` as the outer loop (already handles mid-visit mutation correctly). Do NOT write a custom tree-walker — re-introduces the class of bug R17 is trying to eliminate. Called out in `evidence/pipeline-refactor-audit.md`. |
| R4 regression gate flakes on CI runner variance | Medium | Medium | Calibrate threshold against measured variance (A4). If flakes persist, split gate into fast (mean) and slow (p99) with different thresholds. |
| R6 (fix 6 bugs) uncovers bug #7 that's structurally unfixable | Low | Medium | If found: classify as NG12 (new invariant), add byte-identity test pinning current behavior, update CLAUDE.md. Same pattern as NG1-NG11. |
| R14 PBT invariants are flaky under tier-2 CI runner conditions | Low | Low | Seeded PRNG in every invariant. Failures reproduce deterministically via `STRESS_FIDELITY_SEED=<n>`. |
| R19 parse-health baseline itself drifts between CI environments | Low | Medium | Baseline captured during R19 landing run; any divergence treated as signal-to-investigate, not noise to tolerate. `wholeDoc === 0` is absolute; `blockLevel` baseline is per-corpus — recalibrate only on deliberate test corpus expansion. |
| Sister-spec coordination blocked — sister Rust spec lives in separate worktree | Medium | Low | Reclassified from R11 to non-functional "should" (see §Non-functional). Submit as follow-up PR to the sister branch when it re-enters active iteration. Does NOT block this spec landing. |
| Tolerant parsing merge creates conflicts with R5/R17 (touching `pipeline.ts`) | Low | Low | Coordinate via small merge. Tolerant parsing touches `pipeline.ts:26-27` (removes `remarkDirective`) and `parse-with-fallback.ts`. This spec touches `pipeline.ts:createParseProcessor` function + adds merged walker. Merge mechanical. |
| R18 corpus mix drifts from production corpus over time (stale benchmark) | Low | Low | R18 corpus is synthetic and deterministic — regression gate measures pipeline self-stability, not absolute prod fidelity. If mix needs refresh: update fixture + re-baseline R2; mechanical. |

## 14) In Scope

See §6 requirements — 20 P0 functional items (R1, R2, R3a, R3b, R4, R5a, R5b, R6, R7, R8, R9, R13, R14, R15, R16, R17, R18, R19, R20, R23) plus non-functional constraints in §6's Non-functional subsection. §6.5 defines implementation ordering.

## 15) Future Work

### Explored (investigated during this spec; recommended path clear)

- **FW-E1: File upstream issue on micromark parse super-linearity.** Evidence: end-to-end scaling is super-linear (`evidence/perf-baseline-measured.md`). Precise per-stage attribution pending R3b's `perf-profile.md` deliverable. Dominant term appears to be `remarkParse` based on early profiling; confirm via R3b before filing. Reproducer exists (R18's synthetic corpus). Trigger: R3b delivered + bandwidth for upstream maintenance dialogue. Source: https://github.com/micromark/micromark/issues.
- **FW-E2: File upstream issue on remark-gfm table super-linearity.** Evidence: [remarkjs discussion #978](https://github.com/orgs/remarkjs/discussions/978) — 400 rows = 1s, 2000 rows = 2 min. Maintainer-acknowledged. Reproducer available. Trigger: same as FW-E1.
- **FW-E3: Document NG12 in CLAUDE.md for large GFM tables.** Tables >400 rows exhibit super-linear parse time. Workaround: Rust port's markdown-rs has a faster GFM table parser. Interim: users advised to avoid large tables. Trigger: customer report of slow tables OR Rust port ships.

### Identified (known to matter; needs own spec pass before implementation)

- **FW-I1: Serialize-side profiling parity.** This spec profiles parse only. Serialize hot path might have its own super-linear terms. Worth the same treatment after R1-R20+R23 land. Trigger: post-R17 retrospective; if serialize regression observed or Rust port raises the question.

### Noted (surfaced but not examined)

- **FW-N1: TypeScript type coverage in pipeline.** The 12-stage parse pipeline may have implicit `any` or `unknown` types at interstage boundaries. Hardening to strict types would catch certain classes of bug at compile time. **Explicitly considered and excluded from this spec's scope** (see MH-D14 — interstage boundaries are internal function composition, not cross-boundary contracts; the user-memory preference for typed approaches applies to cross-boundary work like IPC/API/schema validation). Trigger: discovery of a runtime-only bug that stricter typing would have prevented.
- **FW-N2: PBT invariants for non-handler transformers** (ref-def-hoist, fence-regions, wiki-link-micromark, doc-start-thematic-fix, unknown-mdast-guard). **Explicitly considered and excluded** — existing example-based coverage is already thorough; PBT would be test-count inflation without marginal bug capture. Trigger: a production bug in one of these transformers that example coverage missed.

## 16) Agent Constraints

(Populated during verify-and-finalize phase.)
