# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/markdown-table-rendering-in-prose-columns/REPORT.md`
**Audit date:** 2026-04-14
**Total findings:** 2 (0 High, 2 Medium, 0 Low)

---

## High Severity

None detected.

---

## Medium Severity

### [M] Finding 1: Tailwind Typography claim lacks version-date qualifier in Executive Summary

**Category:** COHERENCE (Confidence-prose alignment)
**Source:** L2 (confidence-prose misalignment)
**Location:** Executive Summary, page 65; D6 detailed findings
**Issue:** The Executive Summary claims "Tailwind Typography's `prose` plugin ships no overflow handling" with definitive language, but the evidence retrieval was version-specific (fetched 2026-04-14). The Detailed Findings D6 explicitly notes "(retrieved 2026-04-14)" but the Executive Summary prose does not. If Tailwind Typography ships a new version with different table rules, this claim would become stale without explicit version qualification in the summary.

**Current text:** "Tailwind Typography's `prose` plugin ships no overflow handling — its `src/styles.js` contains `table: { width: '100%', tableLayout: 'auto', … }` with zero `overflow-x`, `display: block`, or wrapper."

**Evidence:** D6 evidence file explicitly notes "Direct fetch of `src/styles.js`, retrieved 2026-04-14" and includes the exact CSS rules from that point-in-time fetch. The claim is CONFIRMED for the version as of 2026-04-14, but lacks explicit version/date qualification in the ES prose.

**Status:** INCOHERENT (prose certainty not matched to version-bounded evidence)

**Suggested resolution:** Either (a) add a qualifier to the ES prose: "As of 2026-04-14, Tailwind Typography's `prose` plugin..." or (b) add "version" metadata to the report frontmatter noting the TW version examined, or (c) accept that the report's date-stamped nature (2026-04-14 in frontmatter and D6 evidence footer) implicitly qualifies all fetched-source claims. Option (c) is acceptable if the parent consumer understands the report's version-date scope; options (a) or (b) are safer for long-term reference.

---

### [M] Finding 2: Docusaurus Infima version used in research is alpha; CSS may have changed

**Category:** COHERENCE (Staleness risk)
**Source:** L4 (evidence-synthesis fidelity) + gap noted in evidence file
**Location:** D4 detailed findings (page 168); D4 evidence file gap section
**Issue:** D4 evidence file explicitly notes: "The Infima version queried (0.2.0-alpha.45) may not match the Infima currently bundled with the latest Docusaurus. Verify the rule hasn't changed in a newer Infima release." The gap section flags this as unresolved. However, the Detailed Findings D4 prose presents the CSS as Docusaurus's current approach without hedging the version risk.

**Current text:** "Docusaurus (via Infima) applies `table { display: block; overflow: auto; border-collapse: collapse; }` directly on the `<table>` element."

**Evidence:** Evidence D4 fetched from "https://unpkg.com/infima@0.2.0-alpha.45/dist/css/default/default.css" but noted in the gaps section that this version may not reflect the latest Docusaurus bundle. D4 evidence file confidence is CONFIRMED for that alpha version.

**Status:** STALE (potential, flagged in evidence file but not in prose)

**Suggested resolution:** Add a qualifier to D4 prose: "Docusaurus (via Infima 0.2.0-alpha.45, queried 2026-04-14) applies..." or verify against the latest Infima version and update if CSS has changed. The gap is acknowledged in the evidence file but not surfaced to readers in the main findings prose.

---

## Low Severity

None detected.

---

## Confirmed Claims (summary)

### Cross-finding Coherence
- **Six-family taxonomy**: All six families (A–F) are consistently mapped across Executive Summary, Detailed Findings (D1–D6), and Strategy Adoption Matrix. No contradictions detected.
- **Product-family assignments**: Each product is assigned to one primary family (or combined families for Outline: A+D) consistently across sections. Verified 14+ products.
- **Evidence-synthesis fidelity**: All high-load-bearing claims verified against source evidence:
  - Tailwind Typography: `width: 100%; table-layout: auto` with no overflow — CONFIRMED from direct `src/styles.js` fetch.
  - Docusaurus/Infima: `display: block; overflow: auto` on `<table>` — CONFIRMED from alpha CSS (subject to version caveat above).
  - TipTap demo: `table-layout: fixed; width: 100%` in `.tableWrapper` — CONFIRMED from `demos/src/Nodes/Table/React/styles.scss`.
  - BlockNote: `width: auto !important` — CONFIRMED from `editor.css`.
  - CSS spec claim on `min-width` ignored under `table-layout: fixed` — CONFIRMED from W3C CSS 2.1 §17.5.2.1.

### Confidence-Prose Alignment
- Claims marked CONFIRMED in evidence are stated definitively in prose (appropriate).
- Claims marked INFERRED (e.g., Obsidian default, Docmost CSS) are appropriately hedged in prose without "clearly" or "definitely" modifiers.
- Version-date attribution (2026-04-14) is explicit in most evidence files and acceptable implicitly from report frontmatter.

### 3P Framing Discipline
- Report consistently maintains 3P factual stance per stated rubric ("Factual 3P survey. No recommendations.").
- Conditional guidance in D1 and D7 (Decision triggers) is appropriate for a factual report; no prescriptive recommendations for Open Knowledge are present.
- Explicit non-goal statement: "1P analysis of Open Knowledge" excludes any internal recommendations.

### Completeness
- All D1–D10 rubric dimensions have finding sections with evidence links.
- D8–D10 grouped into one evidence file (d8-responsive-and-misc.md), which contains all three sections.
- Strategy Adoption Matrix accounts for all surveyed products.
- References section lists all external sources and internal evidence files.

### Stance Consistency
- No leakage into prescriptive language. Conditionals ("when the distinction matters", "if the editor needs...") are explanatory, not prescriptive.
- Report respects boundary between 3P survey (this document) and 1P spec (downstream consumer).

---

## Unverifiable Claims

### Docmost table CSS — UNRESOLVED (noted in evidence)
Evidence D2 flags Docmost as UNRESOLVED: "TipTap-based per third-party index; specific CSS not documented publicly." This is appropriately flagged in both the evidence file and the D2 findings section. No finding needed here; the report correctly acknowledges the gap.

### Mintlify table CSS — INACCESSIBLE (noted in evidence)
D4 evidence flags Mintlify as INACCESSIBLE: "Closed-source; public docs pages returned markdown source rather than rendered HTML via WebFetch." Appropriately flagged. No finding needed.

### Obsidian default table CSS — INFERRED (noted in evidence)
D2 evidence flags Obsidian as INFERRED: "proprietary; a direct DOM inspection in the desktop app would upgrade confidence." Appropriately flagged with source of inference (community CSS snippets). No finding needed; confidence level is explicit.

---

## Summary & Recommendation

**Overall quality: High.** The report demonstrates strong internal coherence across all seven coherence lenses (L1–L7). Factual claims are well-sourced, evidence is comprehensive, and 3P framing discipline is consistent.

**Delivery readiness: Conditional.** Two medium-severity findings require attention before delivery:

1. **Tailwind Typography version qualification**: Add explicit date/version qualifier to ES prose mentioning "as of 2026-04-14" or confirm the claim against current TW version.
2. **Docusaurus Infima version risk**: Either add version qualifier to D4 prose or verify against the latest Infima version bundled with current Docusaurus. The gap is noted in evidence but not surfaced to prose readers.

**Severity rationale:** Both findings are Medium rather than High because:
- The underlying claims are CONFIRMED for the versions examined.
- The risk is staleness, not factual incorrectness at report-write time.
- The evidence files explicitly flag the version caveat; it's a prose/visibility issue rather than a data issue.
- For a research report dated 2026-04-14, implicit version-date qualification via frontmatter may be acceptable depending on downstream consumer expectations.

**If conditions are met**, the report is ready for delivery to the downstream 1P spec team. No high-severity coherence, factual, or framing violations detected.

