# Changelog

## 2026-04-12 — Audit resolution pass

Resolved 11 audit findings (3 high, 5 medium, 3 low). See `meta/audit-findings.md` for full audit.

### High severity (resolved)

- **H1 (stale CommonMark data):** 74.8% figure was from marked v0.5.0 (2018). Updated all references to reflect current ~90%+ compliance with specific weaknesses in Images (68%) and Links (83%) per v4.2.3 (2022). Added note that remaining gaps align with our fidelity pain points.
- **H2 (asymmetric LOC accounting):** Separated stack-specific code from shared fidelity logic in the custom-code scorecard. Revised totals: ~475 LOC marked-specific vs ~380 LOC remark-specific, with ~200 LOC of shared fidelity logic in either stack. Foregrounded that the decisive delta is MDX (~370 LOC).
- **H3 (unhedged verdict):** Added conditional qualification to the executive summary verdict — recommendation is contingent on verifying the 118-case fidelity pass rate through a live remark pipeline. Added the untested assumption as a Key Finding.

### Medium severity (resolved)

- **M1 (12 → 11 extensions):** Corrected throughout.
- **M2 (3.20.x → v3.22.0):** Corrected the @tiptap/markdown #7539 fix version (was merged in PR #7565, shipped in v3.22.0).
- **M3 (perf comparison confusion):** Clarified that the 13x and 50% figures measure different baselines (micromark vs marked; micromark vs legacy remark-parse).
- **M4 (zero-patches framing):** Reframed. Both stacks require workaround code; mechanism differs (bun patch on vendor source vs handler overrides via exposed API). Removed the "zero patches" framing that obscured this.
- **M5 (MarkdownManager.ts line count 994 → 1,307):** Corrected in evidence/d1.

### Low severity (resolved)

- **L1 (bun patch LOC inconsistency):** Standardized on ~15 LOC for source-level changes; noted that dist copies bring the patch file to ~25 LOC total but they are compiler output.
- **L2 (maintainer name):** Replaced "Sam Smoores" with "the smoores-dev maintainer" to avoid name ambiguity (handle confirmed; real name not definitively verified via public profiles).
- **L3 (#8 wontfix → invalid):** Corrected. mdast-util-to-markdown#66 was closed as not-planned; #8 was closed as invalid (spec-compliant behavior per maintainer).

### Confirmed (no action needed)

- TipTap #7258 still OPEN.
- mdast-util-to-markdown #12 still OPEN (~5 years).
- Tom MacWright "Don't use marked" Jan 2024.
- micromark 100% CommonMark (per @wooorm + current README).
- BlockNote uses full unified stack.
- @handlewithcare/remark-prosemirror metadata.
- 77/118, 74/118, 91/118 fidelity numbers from prior report.
