# Audit Findings

**Artifact:** specs/2026-04-12-remark-prosemirror-migration/SPEC.md
**Audit date:** 2026-04-12
**Total findings:** 9 (2 high, 4 medium, 3 low)

---

## High Severity

### [H1] Finding: remark-directive scope is contradicted across three spec sections

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** NG8 (line 45), D12 (line 233), EXCLUDE in Agent Constraints (line 334), R3 (line 88)
**Issue:** Three sections of the spec give mutually contradictory directives on whether `remark-directive` is in scope.

**Current text (NG8, line 45):**
> "[NOT UNLESS] NG8: Adopting remark-math, remark-github-blockquote-alert, remark-definition-list. [...] **Note:** `remark-directive` is IN SCOPE from day one per D12"

**Current text (EXCLUDE, line 334):**
> "Adding remark-rehype, remark-lint, remark-math, remark-directive (beyond NOT UNLESS) -- NG6, NG7, NG8"

**Current text (D12, line 233):**
> "Register `remark-directive` from day one | T | LOCKED"

**Current text (R3, line 88):**
> "Pipeline registers: remark-parse, remark-gfm, remark-frontmatter, remark-mdx, remark-directive (registered day one per D12)"

**Evidence:** NG8 carries a `[NOT UNLESS]` tag that implicitly covers remark-directive (it's listed under the same non-goal), while its body text and D12/R3 all say remark-directive IS in scope. The EXCLUDE section in Agent Constraints lists remark-directive among items an implementer should not add. An implementer following EXCLUDE would skip remark-directive; an implementer following R3/D12 would add it. This is a recipe for confusion during implementation.

**Status:** INCOHERENT
**Suggested resolution:** (1) Move remark-directive out of NG8 entirely -- NG8 should only cover remark-math, remark-github-blockquote-alert, and remark-definition-list. (2) Remove remark-directive from the EXCLUDE list in Agent Constraints, or add an explicit exception noting it is IN SCOPE per D12. (3) D12 and R3 are correct as-is.

---

### [H2] Finding: remark-prosemirror "~300 LOC" claim is contradicted -- actual is ~542 LOC

**Category:** FACTUAL
**Source:** T2 (OSS repos) + T4 (web verification)
**Location:** D1 (line 222), Risk table (line 289), Future Work (line 312)
**Issue:** The spec claims `@handlewithcare/remark-prosemirror` is "~300 LOC" three times (D1 justification, risk mitigation "vendor the ~300 LOC library", and Future Work "the library is ~300 LOC"). This figure is used as the basis for the forkability argument -- that if upstream breaks us, we can vendor a small library. The actual library source is ~542 LOC across 4 files (`mdast-util-to-prosemirror.ts` alone is 341 lines).

**Current text (D1):**
> "confirmed small (~300 LOC) and forkable if needed"

**Current text (Risk table):**
> "Pin exact version. Vendor the ~300 LOC library if upstream breaks us."

**Evidence:** GitHub repo inspection (https://github.com/handlewithcarecollective/remark-prosemirror) shows 4 source files totaling ~542 LOC. The prior research report assessed remark-prosemirror "theoretically, not live tested" per the markdown-roundtrip-fidelity report. The ~300 LOC figure appears to have been estimated without reading the full source tree. Current version is 0.1.5 (published 2025-01-03).

**Status:** CONTRADICTED
**Suggested resolution:** Update all three references from "~300 LOC" to "~550 LOC". The forkability conclusion is weakened but likely still holds (550 LOC is still tractable). However, the increased size means a fork has higher maintenance cost than the spec implies -- this should be acknowledged in the risk assessment.

---

## Medium Severity

### [M1] Finding: "~90%+ marked CommonMark compliance" is version-bound but presented as universal

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** Problem statement (line 21), Current state (line 129)
**Issue:** The spec claims "~90%+ marked" CommonMark compliance with "weak Images 68% / Links 83% categories." These figures trace to marked v4.2.3 (November 2022) via GitHub discussion markedjs/marked#1202. The current marked.js documentation claims **98% CommonMark 0.31 compliance** with Links improved to 86%. The version condition is absent from the spec, creating an impression that marked is weaker than its current state.

**Current text (line 21):**
> "100% CommonMark compliance via micromark (vs ~90%+ marked with weak Images 68% / Links 83% categories, which happen to be our fidelity pain points)"

**Evidence:** marked.js GitHub discussion #1202 (v4.2.3 compliance table, November 2022) is the primary source. Current marked.js homepage claims 98% compliance. The spec's argument is structurally valid (our stack uses marked@17 which may predate v4.2.3 improvements), but the version binding should be explicit.

**Status:** INCOHERENT
**Suggested resolution:** Add version context: "~90%+ CommonMark compliance at marked@17/v4.x (Images 68%, Links 83% per markedjs/marked#1202)." This prevents a reader from checking current marked docs and concluding the spec is wrong. If marked@17 is actually after the v4.2.3 improvements, the 68%/83% figures may themselves be stale for our version -- verify which marked version our @tiptap/markdown@3.22.3 pins.

---

### [M2] Finding: Evidence file call-site counts are stale

**Category:** FACTUAL
**Source:** T1 (own codebase) + L4 (evidence-synthesis fidelity)
**Location:** evidence/call-site-inventory.md (lines 23, 53)
**Issue:** The evidence file claims "All 28 @tiptap/markdown import sites" but its own categorical breakdown sums to 26 (5 server + 3 browser + 2 harness + 16 test = 26). Current repo-wide grep shows 26 production+test import sites, plus additional references in report evidence scripts and markdown files. The "51 call sites for parse()/serialize()" count is also significantly below current grep results.

**Current text (evidence, line 23):**
> "All 28 @tiptap/markdown import sites use only `MarkdownManager`"

**Current text (evidence, line 53):**
> "51 call sites across production + tests"

**Evidence:** Grep for `from '@tiptap/markdown'` returns 26 unique production+test `.ts/.tsx` files. The evidence file's own breakdown (5+3+2+16) sums to 26, not 28. The internal arithmetic error doesn't affect the spec's conclusion (R2 coverage is still valid), but it undermines the evidence file's reliability as a precise inventory.

**Status:** STALE
**Suggested resolution:** Update the evidence file header from "28" to "26" to match its own breakdown. Re-run the `.parse()`/`.serialize()` call-site count with current codebase and update the "51" figure. The conclusion (R2 fully covers integration surface) remains valid regardless.

---

### [M3] Finding: "695 fidelity tests" is repeated as fact but unverified in this audit

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Problem statement (line 19), G8 (line 34), R13 (line 98)
**Issue:** The spec states "695 fidelity tests" three times as an established current-state fact. The fidelity test suite could not be run in this worktree (module resolution errors for `@inkeep/open-knowledge-core`). The number is plausible given the test file inventory (7 invariant tests, P0 entity/escape suite, CommonMark corpus, GFM corpus) but could not be independently confirmed. If the count is wrong, it misrepresents the quality baseline the migration is measured against.

**Current text (line 19):**
> "passes 695 fidelity tests"

**Evidence:** `bun test packages/app/tests/fidelity/` fails in this worktree with module resolution errors. 10 test files exist. The number 695 appears to be the sum of individual test cases across all files (PBT runs expand the count significantly). The claim is plausible but unverified.

**Status:** UNVERIFIABLE
**Suggested resolution:** Run `bun test packages/app/tests/fidelity/` on the main branch and confirm the actual test count matches 695. If PBT runs inflate the count (e.g., 7 invariants x 100 PBT runs = 700), document the counting methodology.

---

### [M4] Finding: Byte-exact fidelity claim reads as established but is aspirational

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment) + L5 (summary coherence)
**Location:** Problem statement (line 21-23), G4 (line 30), R1 (line 86)
**Issue:** The Problem Statement's Resolution reads as a confident migration plan: "Migrate the markdown engine to the unified+remark stack. Keep every other layer unchanged..." and "10 of 11 fidelity extensions keep their PM schema." G4 commits to "byte-exact source-text fidelity equal to or better." But Q1 ("Is the 118-case probe pass rate >=77/118?") and Q2 ("Do all 13 P0 entity/escape cases pass?") are both "Not yet run." The spec correctly gates migration code on R1 (the probe), but a reader of just the Problem Statement and Goals would conclude the migration is proven to work. The gate condition appears only at the end of the long Resolution paragraph and in R1.

**Current text (line 23):**
> "This migration is gated by a pre-flight 118-case fidelity probe"

**Evidence:** Q1 status = "Not yet run." Q2 status = "Not yet run." The structural gate is sound -- the spec will not proceed without probe results. The issue is prose calibration: the first 20 lines of the spec read as though the migration is a done deal, while the empirical basis doesn't exist yet.

**Status:** INCOHERENT
**Suggested resolution:** Add a confidence qualifier early in the Resolution: "Migrate the markdown engine to the unified+remark stack, **subject to the pre-flight fidelity probe passing (Q1, Q2)**." Or move the gate condition from the end of the Resolution paragraph to a prominent position near the beginning.

---

## Low Severity

### [L1] Finding: jsx-tokenizer LOC count is slightly off

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Problem statement (line 19)
**Issue:** The spec says "~370-LOC `jsx-tokenizer.ts`". Actual file is 384 lines.

**Current text:** "a custom ~370-LOC `jsx-tokenizer.ts`"
**Evidence:** `wc -l packages/core/src/extensions/jsx-tokenizer.ts` = 384 lines.

**Status:** CONTRADICTED (minor)
**Suggested resolution:** Update to "~380-LOC" or leave as "~370-LOC" (acceptable rounding). Very low impact.

---

### [L2] Finding: Assumptions A1 and A2 are MEDIUM confidence but have no fallback path

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** Assumptions table (lines 260-261), R5 (line 90), R6 (line 91)
**Issue:** A1 ("Position-slice delimiter recovery works for all our fidelity attributes") and A2 ("remark-prosemirror handler API supports our full schema surface") are both MEDIUM confidence. Their corresponding requirements R5 and R6 are both P0. If either assumption fails during the probe, the spec doesn't articulate what happens -- the risk table (§14) only addresses the aggregate "probe shows <77/118" scenario. A failure in A1 or A2 specifically could mean the architectural approach (position-slice recovery or remark-prosemirror handler registration) is wrong, which is a deeper problem than a pass-rate shortfall.

**Status:** INCOHERENT
**Suggested resolution:** Add specific failure modes to the risk table for A1 and A2 failures. E.g., "Position-slice recovery doesn't work for code fence delimiters -> fallback: custom micromark extension that preserves delimiter in token metadata" or "remark-prosemirror handler API doesn't support custom mdast node types -> fallback: fork + extend handler registry."

---

### [L3] Finding: mdast-util-to-markdown #12 impact assessment is sound but the spec's tone on fidelity preservation should acknowledge it more prominently

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** Q3 (line 243), Risk table (line 288), G4 (line 30)
**Issue:** The mdast-util-to-markdown #12 nested emphasis bug is real and still open (confirmed via GitHub). The spec correctly: (a) identifies it as P0, (b) gates it on the probe, (c) has a mitigation plan (custom emphasis handler). The risk table rates likelihood as "Low" which is reasonable for real-world content. However, G4 commits to "byte-exact fidelity" while this known upstream bug *specifically* breaks byte-exact round-trip for nested emphasis constructs like `***emphasis*in emphasis*`. The spec should acknowledge that G4 achievement for nested emphasis specifically depends on the custom handler mitigation -- it's not automatic from adopting the remark stack.

**Evidence:** GitHub issue syntax-tree/mdast-util-to-markdown#12 (opened 2021-02-03, still open, labeled `type/bug` + `yes/confirmed`). Reproducer: parse `***emphasis*in emphasis*`, serialize produces `\***emphasis*in emphasis*`, re-parse produces different AST. The bug affects the serialize direction (PM -> mdast -> markdown), which is exactly the path G4's "byte-exact fidelity" claim covers.

**Status:** INCOHERENT (minor -- structurally addressed but prose doesn't reflect the dependency)
**Suggested resolution:** In G4 or R4, add a note: "Nested emphasis round-trip depends on a custom emphasis handler working around mdast-util-to-markdown#12; this is a known upstream bug affecting the serialize direction." This makes the dependency explicit rather than buried in Q3/risk table.

---

## Confirmed Claims (summary)

**T1 (Own codebase) -- confirmed:**
- 11 fidelity extensions exist (11 files matching `*-fidelity.ts`)
- jsx-tokenizer.ts has 3 version variants (A, B, C)
- 77/118 whitespace-only round-trips (confirmed via markdown-roundtrip-fidelity-tiptap report)
- frontmatter.ts exists and performs strip/prepend with CRLF handling
- All @tiptap/markdown imports use only `MarkdownManager` (zero tokenizer-internal imports)
- Zero direct `marked` imports in production code
- All token-field access confined to fidelity extensions

**T3/T4/T5 (External -- confirmed):**
- mdast-util-to-markdown #12 is real, open, confirmed bug (GitHub)
- micromark is ~13x slower than marked (innodoc/markdown-benchmark: 12.9x)
- All 6 industry alignment claims verified (Docusaurus, Astro, Next.js MDX, Milkdown, BlockNote, Prettier)
- @tiptap/markdown #7258 is real, open ~5 months, escape consumption bug
- remark-mdx supports nested fragments, member expressions, spread attributes, expression props, import/export
- remark-prosemirror maintainer is Shane Friedman, ex-NYT Oak Staff Eng/Tech Lead (confirmed via resume + blog)
- remark-prosemirror is version 0.1.5 (pre-1.0 confirmed)
- D12 user direction (no-deferred-tech-debt) is consistent with project principle

## Unverifiable Claims

| Claim | Location | What was checked | Why unverifiable |
|---|---|---|---|
| 695 fidelity tests | §1, G8, R13 | Attempted `bun test` in worktree | Module resolution fails in this worktree; needs main branch run |
| remark-prosemirror handler API supports all custom node types (A2) | Assumptions table | Checked prior research reports | Report explicitly says "assessed theoretically, not live tested" |
| Performance delta acceptable in practice (A7) | Non-functional requirements | Confirmed 13x benchmark; acceptability is design judgment | Runtime measurement needs the probe |
