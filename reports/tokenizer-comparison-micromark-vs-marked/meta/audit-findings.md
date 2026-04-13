# Audit Findings

**Artifact:** reports/tokenizer-comparison-micromark-vs-marked/REPORT.md
**Audit date:** 2026-04-12
**Total findings:** 11 (3 high, 5 medium, 3 low)

---

## High Severity

### [H1] Finding: marked CommonMark compliance 74.8% is from v0.5.0 (2018), not current marked

**Category:** FACTUAL
**Source:** T4 (web verification), T5 (external claims)
**Location:** Executive Summary (line 36), D1 (line 100), D4 table (line 163), D5 (lines 196-200), evidence/d1 (lines 41-47), evidence/d5 (lines 19-20)
**Issue:** The report cites "74.8% CommonMark compliant (fails 157/624 tests)" as a current characterization of marked and calls it "architecturally capped." The 467/624 figure comes from discussion #1202 but corresponds to **marked v0.5.0 from August 2018** — not the current v18.0.0. Discussion #1202 itself shows steady improvement: v0.6.0 (Jan 2019) reached 502/624 (80%), and by v4.2.2 (Nov 2022) most sections were at 100% with only Images (68%) and Links (83%) lagging. The compliance gap has narrowed substantially over 8 years.
**Current text:** "marked is 74.8% CommonMark compliant (fails 157/624 tests; architectural root cause). micromark is 100% CommonMark compliant"
**Evidence:** GitHub discussion #1202 version history table shows 74.8% = v0.5.0 (2018); by v4.2.2 (2022) compliance was near-complete in most categories. The claim "not fixable incrementally without a rewrite" is contradicted by the incremental improvement shown in the same discussion.
**Status:** STALE
**Suggested resolution:** Re-run the CommonMark test suite against the version of marked actually used in this project (v17 or the version pinned in @tiptap/markdown@3.22.3) and report the current pass rate. The architectural root cause claim may still be valid for the remaining gaps (lazy continuation, certain nested blocks), but 74.8% materially understates current compliance and is load-bearing for the verdict. If current compliance is, say, 90%+, the "correctness" pillar of the three-point gap analysis weakens significantly.

---

### [H2] Finding: LOC comparison systematically skewed by asymmetric fidelity-code accounting

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** Executive Summary (line 40), D8 (lines 248-264), evidence/d3 custom-code scorecard (lines 94-112)
**Issue:** The ~660 LOC (marked) vs ~380 LOC (remark) comparison includes "12 fidelity extensions' token.raw logic: ~200 LOC" in the marked column. The report itself notes this is "partially shared" — "includes actual fidelity logic we'd write in both stacks." But zero portion of this shared code appears in the remark column. The remark column lists only "150 LOC of custom handlers" for delimiter preservation, which is the remark *equivalent* of the token.raw extraction logic, not an additional cost. If the 200 LOC is partially shared, some portion must be added to the remark total. As stated, the comparison inflates the delta and produces the "~40% less" headline that doesn't survive scrutiny.
**Current text:** "remark stack requires ~40% less custom third-party-code debt" and "~660 LOC vs ~380 LOC"
**Evidence:** The D8 parenthetical "(includes actual fidelity logic we'd write in both stacks, so partially shared)" contradicts the scorecard's exclusive allocation to marked.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) remove the shared fidelity LOC from both columns and compare only stack-specific code, or (b) allocate the shared portion to both columns. The real decisive delta is the MDX tokenizer (370 vs 0 LOC) which is not affected by this accounting issue — foreground that instead.

---

### [H3] Finding: Verdict doesn't flag the untested 118-case fidelity assumption in the executive summary

**Category:** COHERENCE
**Source:** L5 (summary coherence), L2 (confidence-prose misalignment)
**Location:** Executive Summary verdict (lines 42-43), Limitations (line 298)
**Issue:** The executive summary confidently recommends remark: "Use unified + remark + remark-prosemirror." But the project's own quality metric — the 118-case fidelity probe — has never been run through the remark pipeline. This is acknowledged in Limitations as "the highest-value gap" but is absent from the executive summary. A reader who only reads the summary (the most common read pattern for a comparison report) would not know the recommendation rests on an empirically untested assumption about remark's fidelity pass rate.
**Current text:** "Verdict for greenfield: Use unified + remark + remark-prosemirror"
**Evidence:** Limitations section (line 298): "Live 118-case fidelity probe through unified+remark pipeline... We have theoretical assessment but no empirical number comparable to @tiptap/markdown's 77/118"
**Status:** INCOHERENT
**Suggested resolution:** Add a qualification to the executive summary verdict, e.g.: "Conditional on verifying the 118-case fidelity pass rate is comparable to or better than the current 77/118 (not yet empirically tested through the remark pipeline)."

---

## Medium Severity

### [M1] Finding: "12 fidelity extensions" — actually 11

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Executive Summary (line 34), D1 (line 98), D4 (line 254), D8 (line 254), CLAUDE.md, evidence/d1 (line 73)
**Issue:** The report consistently says "12 fidelity extensions" but the codebase contains exactly 11 `*-fidelity.ts` files: bullet-list, code-block, emphasis, hard-break, heading, horizontal-rule, html-block, link, link-ref-def, list-item, ordered-list. The evidence file d1 lists them by name and counts 11 items (with ItalicFidelity/BoldFidelity mentioned as a pair but implemented as single `emphasis-fidelity.ts`).
**Current text:** "12 fidelity extensions"
**Evidence:** `ls packages/core/src/extensions/*-fidelity.ts` returns 11 files. Evidence d1 lists 11 by name.
**Status:** CONTRADICTED
**Suggested resolution:** Change "12" to "11" throughout.

---

### [M2] Finding: TipTap #7539 fix version is wrong

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** D1 (line 95), D5 (line 195), evidence/d1 (line 61), evidence/d5 (line 27)
**Issue:** Report claims issue #7539 was "fixed upstream in 3.20.x." The fix was PR #7565, merged March 28, 2026 — after the v3.20.6 release (March 27). The fix shipped in **v3.22.0** (March 31), not 3.20.x.
**Current text:** "Issue #7539 (fixed upstream) — entity double-encoding" and "Issue #7539 fixed upstream in 3.20.x"
**Evidence:** GitHub PR #7565 merge date (March 28) post-dates v3.20.6 (March 27). v3.22.0 release notes explicitly include "Fix HTML character escaping in markdown roundtrip."
**Status:** CONTRADICTED
**Suggested resolution:** Change "3.20.x" to "3.22.0" throughout.

---

### [M3] Finding: Performance section presents incompatible numbers without disambiguation

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** D7 (lines 229-241)
**Issue:** Two performance claims appear in the same section: (1) "micromark is ~13x slower than marked" (marked 2,950 ops/sec vs micromark 229 ops/sec from innodoc/markdown-benchmark), and (2) @wooorm says "about 50% slower than the original remark-parse." These measure entirely different comparisons — (1) is micromark vs marked, (2) is micromark vs the *old* remark-parse (which used a different tokenizer). A reader could confuse "50% slower" as contradicting "13x slower."
**Current text:** "micromark is ~13x slower than marked... @wooorm acknowledges: 'about 50% slower than the original remark-parse'"
**Evidence:** The @wooorm quote compares micromark to remark-parse (not marked). The benchmark compares micromark to marked.
**Status:** INCOHERENT
**Suggested resolution:** Clarify that the @wooorm quote is about a different comparison (micromark vs old remark-parse, not micromark vs marked), or remove the @wooorm quote as it addresses a different question.

---

### [M4] Finding: "Zero upstream patches" framing creates false symmetry

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment), L6 (stance consistency)
**Location:** D8 remark scorecard (line 262), Executive Summary (line 42)
**Issue:** The remark scorecard claims "Zero upstream patches (extensible via extension API)" while the marked scorecard has "bun patch" as a line item. But the remark side requires ~150 LOC of custom mdast-util-to-markdown handlers to override default escape/delimiter behavior — these are functionally equivalent to patching (overriding behavior the library gets wrong for our use case). The framing "zero patches" vs "bun patch" creates an asymmetry where one stack's workarounds are called "extensibility" and the other's are called "patches."
**Current text:** "Zero upstream patches (extensible via extension API)" for remark; "bun patch (entity + escape): ~25 LOC" for marked
**Evidence:** Both stacks require custom code to fix behavior that doesn't match our fidelity requirements. The mechanism differs (handler override vs file patch) but the functional purpose is the same.
**Status:** INCOHERENT
**Suggested resolution:** Frame both as "custom code to fix behavior gaps" rather than privileging one mechanism over the other. The remark API is genuinely better-designed for extensibility (handler registration vs monkey-patching), but the framing should acknowledge that both stacks need workarounds.

---

### [M5] Finding: MarkdownManager.ts line count is 31% wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/d1 (line 12)
**Issue:** Evidence d1 claims "MarkdownManager.ts — the core parse/serialize engine (994 lines)." The installed file at `node_modules/@tiptap/markdown/src/MarkdownManager.ts` (v3.22.3, the version specified in the evidence) is 1,307 lines. Even accounting for the bun patch adding ~12 net lines, the unpatched file would be ~1,295 lines — 30% larger than claimed.
**Current text:** "MarkdownManager.ts — the core parse/serialize engine (994 lines)"
**Evidence:** `wc -l node_modules/@tiptap/markdown/src/MarkdownManager.ts` = 1307 at version 3.22.3.
**Status:** CONTRADICTED
**Suggested resolution:** Correct to "1,307 lines" (or ~1,295 unpatched).

---

## Low Severity

### [L1] Finding: Bun patch LOC inconsistent between sections

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** D1 (line 94 — "~15 LOC"), D8 (line 251 — "~25 LOC"), evidence/d1 (line 67 — "~15 lines"), evidence/d3 (lines 98-99 — "~15 LOC + ~10 LOC")
**Issue:** The bun patch is described as "~15 LOC maintained against upstream" (D1, evidence/d1) and "~25 LOC" (D8 scorecard). The actual source changes to `src/MarkdownManager.ts` are ~15 LOC of logic. The ~25 figure appears to include comments or count the dist/ file changes (which are just compiled copies). The inconsistency is minor but erodes precision.
**Current text:** "~15 LOC" in some sections, "~25 LOC" in others
**Evidence:** Patch file shows ~15 LOC of actual logic changes to src/MarkdownManager.ts (escape handler: ~8 LOC, entity bypass: ~1 LOC + comments).
**Status:** INCOHERENT
**Suggested resolution:** Standardize on "~15 LOC" for source changes. If counting dist/ copies, say so explicitly.

---

### [L2] Finding: Maintainer name is wrong

**Category:** FACTUAL
**Source:** T5 (external claims)
**Location:** D6 (line 224), evidence/d2 (line 82), evidence/d5 (line 58)
**Issue:** Report identifies the remark-prosemirror maintainer as "Sam Smoores (ex-NYT Oak, 5 yrs)." The maintainer's name is **Shane Friedman** — "SMores" is a handle (GitHub: `smoores-dev`), not a first name. The ex-NYT Oak engineer claim (5 years) is confirmed via the maintainer's blog at smoores.dev.
**Current text:** "Sam Smoores (ex-NYT Oak engineer, 5 yrs)"
**Evidence:** GitHub profile `smoores-dev`, npm handle `smoores-hwc`, blog at smoores.dev identifies author as having worked on NYT's Oak editor.
**Status:** CONTRADICTED
**Suggested resolution:** Change to "Shane Friedman (handle: SMores, ex-NYT Oak engineer, 5 yrs)" or verify the correct name via the maintainer's public profiles.

---

### [L3] Finding: mdast-util-to-markdown #8 was closed as "invalid," not "wontfix"

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** D2 (line 123), D5 (line 200), evidence/d2 (line 91), evidence/d5 (line 44)
**Issue:** Report says issues #66 and #8 were both "closed as wontfix." Issue #66 was indeed closed as NOT_PLANNED (effectively wontfix). Issue #8 was closed with stateReason "COMPLETED" and label "no/invalid" — the maintainer considered it invalid (spec-compliant behavior, not a bug), not wontfix. Both are non-fix closures but for different reasons.
**Current text:** "#66, #8 closed as wontfix"
**Evidence:** GitHub issue #8 has stateReason "COMPLETED" and label "no/invalid."
**Status:** CONTRADICTED
**Suggested resolution:** Change to "#66 closed as not-planned/duplicate; #8 closed as invalid (spec-compliant behavior)."

---

## Confirmed Claims (summary)

**T1 (own codebase):** jsx-tokenizer.ts LOC (~370 claimed, 384 actual — accurate within margin). frontmatter.ts LOC (~30 claimed, 24 actual — accurate). Fidelity extensions all read `token.raw` as described. Bun patch fixes both bugs as described.

**T4/T5 (web verification):** TipTap #7258 still OPEN (~5 months). mdast-util-to-markdown #12 open ~5 years. Tom MacWright "Don't use marked" Jan 2024 confirmed. micromark 100% CommonMark (per @wooorm Oct 2020 + current README). BlockNote uses full unified stack confirmed with exact version numbers. @handlewithcare/remark-prosemirror v0.1.5, ~16.8k downloads, 29 stars all confirmed. Performance benchmark (marked 2,950 vs micromark 229 ops/sec = ~13x) confirmed from innodoc/markdown-benchmark.

**Coherence (L4):** MDX round-trip 22/23 claim confirmed against the cited sub-report (14 byte-identical + 8 normalize-in-one-pass; 1 non-converging indentation drift). 77/118 (@tiptap/markdown) and 74/118 (prosemirror-markdown) and 91/118 (marked-only) confirmed from prior fidelity report evidence.

**Coherence (L6):** Stance ("Factual with conclusions") is mostly consistent. Executive summary leans slightly more prescriptive than body sections, which is expected for a comparison report with a verdict.

---

## Unverifiable Claims

- **"marked: losing share"** (D6, line 217): Download trends are volatile week-to-week. marked currently has ~35M weekly downloads (higher than the report's ~27-28M claim). Whether this represents "losing share" relative to remark-ecosystem growth would require longitudinal analysis not performed.

- **"Prior theoretical estimate: comparable or better than our current patched @tiptap/markdown stack"** (D3, line 151): The remark pipeline fidelity pass rate is the report's self-identified "highest-value gap." No empirical data exists to confirm or deny.

- **"edge case frequency is low in natural markdown content but non-zero"** (D3, line 148): Referring to nested emphasis edge cases. No corpus analysis was performed to quantify frequency.

- **micromark 100% CommonMark against current spec version:** The @wooorm tweet is from Oct 2020 (CommonMark 0.30 era). Current spec is 0.31.2 (Jan 2024). micromark v4.0.2 (Feb 2025) likely passes the current spec but this was not explicitly verified.

- **MeasureThat.net benchmark URL** (D7, line 230): The benchmark source is identified as "MeasureThat.net" but no URL is provided. The verified source is actually `innodoc/markdown-benchmark` (April 2023). The MeasureThat.net attribution may be incorrect.
