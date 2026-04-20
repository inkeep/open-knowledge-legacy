# Audit Findings

**Artifact:** /Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/REPORT.md
**Audit date:** 2026-04-19
**Total findings:** 9 (2 High, 5 Medium, 2 Low)

**Coverage summary:**
- All 7 coherence lenses applied.
- Factual tracks T3 (3P dependencies), T4 (web verification), T5 (external claims) applied. T1 (own codebase) and T2 (OSS repos) not applicable — artifact is a landscape report with no first-party codebase claims and no cloned OSS repos under audit.
- Spot-checks: 10 external citations (6 CVEs/GHSAs, 3 GitHub issues, 1 PR) fetched directly; Stryker-js release history verified; Appendix A and B entry counts independently enumerated against evidence files.

---

## High Severity

### [H] Finding 1: Divergence corpus entry count is inconsistent and under-counts the evidence

**Category:** COHERENCE + FACTUAL
**Source:** L1 (cross-finding contradictions), L5 (summary coherence), L4 (evidence-synthesis fidelity), T5
**Location:** YAML frontmatter (line 3); Executive Summary point 11 (line 62); IV.7 (line 658); Appendix B title and body (lines 1120–1122)
**Issue:** The report asserts "45 snippets / 45 entries / ~45 cross-parser divergence snippets" in five places, but the taxonomy sub-counts in IV.7 sum to 58 and the backing evidence file contains 59 entries. Per-family counts also under-count by 1 on autolinks (10 claimed vs. 11 in evidence).

**Current text (representative):**
- Frontmatter: "a 45-snippet cross-parser divergence corpus"
- Exec Summary #11: "a **45-snippet cross-parser divergence corpus** spanning 13 test families"
- IV.7: "A consolidated, lift-and-shift-ready library of ~45 cross-parser divergence snippets is organized into 13 test families."
- Appendix B heading: "Cross-Parser Divergence Snippet Corpus (45 entries)"
- Appendix B body: "It organizes ~45 divergence snippets into 13 test families."

IV.7 taxonomy (lines 660–673):
```
emphasis (7) + links (6) + html-blocks (4) + setext-vs-hr (2)
+ autolinks (10) + lists (5) + fenced-code (4) + code-spans (1)
+ hard-breaks (3) + gfm-strikethrough (3) + gfm-tables (7)
+ gfm-tasks (3) + disallowed-html (3) = 58
```

**Evidence:**
- `grep -c "^- name:" evidence/divergence-corpus.md` → **59**
- `grep "test_family:" evidence/divergence-corpus.md | sort | uniq -c`:
  ```
  11 autolinks          (not 10)
   7 gfm-tables
   7 emphasis
   6 links
   5 lists
   4 html-blocks
   4 fenced-code
   3 hard-breaks
   3 gfm-tasks
   3 gfm-strikethrough
   3 disallowed-html
   2 setext-vs-hr
   1 code-spans
  ```
  Sum: 59.

**Status:** INCOHERENT + CONTRADICTED
**Suggested resolution:** Choose one number. If the intent is 59 (the evidence): update the title claim, frontmatter, Exec Summary #11, IV.7, and Appendix B heading to "59 snippets" (or "~60"), and correct autolinks count to 11. If the intent is 45 (trim the library): prune the evidence file and republish so the number matches. Do not leave the numeric mismatch as-is — the figure is load-bearing for a "lift-and-shift" library.

---

### [H] Finding 2: remark#660 mischaracterized — conflates issue with maintainer position

**Category:** FACTUAL
**Source:** T4 (direct fetch of cited issue)
**Location:** Executive Summary point 6 (line 52); III.2 (line 423); Theme C in Cross-Cutting Synthesis (line 703)
**Issue:** The report claims remark#660 was "closed `wontfix` with the explicit position that LF-only output is intentional." The issue exists and carries the "🙅 no/wontfix" label (that half is accurate), but the public issue body/title is "Remark replaces CRLF with LF on Windows" — a user bug report against remark-cli auto-update mode on Windows. The report's gloss ("explicit position that LF-only output is intentional") is not present in the issue's visible content; it is a downstream characterization of the wontfix decision rather than a quoted maintainer statement. Load-bearing for the "byte-level CRLF round-trip is architecturally impossible" chain in Exec Summary #6 → III.2 → Theme C.

**Current text (Exec Summary #6):**
> "the `mdast` tree exposes no distinction, and `remark-stringify` emits LF only — [remark #660](https://github.com/remarkjs/remark/issues/660) closed `wontfix` with the explicit position that LF-only output is intentional."

**Current text (III.2):**
> "[remark #660](https://github.com/remarkjs/remark/issues/660) was closed `no/wontfix` with the explicit position that LF-only output is intentional. Byte-level idempotence of CRLF input is architecturally impossible under the default pipeline."

**Evidence:** Direct WebFetch of https://github.com/remarkjs/remark/issues/660 — title is "Remark replaces CRLF with LF on Windows"; label "🙅 no/wontfix" present. The stronger mdast-util-to-markdown claim ("no `lineEnding` / `eol` option") is independently verifiable from the docs and is the actual load-bearing evidence for "CRLF round-trip impossible." The issue#660 citation adds a maintainer-intent narrative that the issue does not itself state.

**Status:** PARTIAL CONTRADICTION — the wontfix label is real, but the framing as "explicit position that LF-only output is intentional" overstates what the issue documents.
**Suggested resolution:** Soften the attribution. Either (a) cite the issue only as "closed wontfix" and derive the architectural claim from the stronger `mdast-util-to-markdown` absence-of-`lineEnding`-option evidence, or (b) locate and quote the actual maintainer comment (if one exists in the thread not captured by WebFetch) that states LF-only is intentional. Do not attribute an "explicit position" without the quote. Propagate to Exec Summary #6, III.2, and Theme C.

---

## Medium Severity

### [M] Finding 3: CVE-2026-2327 vulnerable range understated as "v13.x"

**Category:** FACTUAL
**Source:** T4 (GitHub Advisory direct fetch)
**Location:** IV.3 ReDoS table, row P4 (line 564)
**Issue:** The report's ReDoS table lists CVE-2026-2327 as targeting "markdown-it linkify (v13.x)". The GHSA advisory's `vulnerable_version_range` is `">= 13.0.0, < 14.1.1"` — i.e., the bug affects both 13.x AND 14.x through 14.1.0, and is fixed in 14.1.1. Framing it as "v13.x" implies 14.x is unaffected, which is wrong.

**Current text:**
| P4 | `'*'.repeat(N) + 'x'` | markdown-it linkify (v13.x) | Quadratic+ | [CVE-2026-2327] |

**Evidence:** GHSA-38c4-r59v-3vqw fetched directly; `vulnerable_version_range: ">= 13.0.0, < 14.1.1"`. Evidence file d6.1-cves-ghsas.md row for CVE-2026-2327 correctly lists patched version as 14.1.1 — so the evidence is self-consistent; only the report's parenthetical "v13.x" is wrong.

**Status:** CONTRADICTED
**Suggested resolution:** Change "markdown-it linkify (v13.x)" to "markdown-it linkify (< 14.1.1)" or "markdown-it linkify (v13.x and v14.x pre-14.1.1)". A reader currently on 14.0.x would wrongly believe they were safe.

---

### [M] Finding 4: DOMPurify CVE-2024-48910 CVSS score unqualified (v3 vs v4)

**Category:** FACTUAL
**Source:** T4 (GHSA direct fetch)
**Location:** IV.1 (line 505) and evidence/d6.1-cves-ghsas.md
**Issue:** Report states "[CVE-2024-48910](...) (prototype pollution, CVSS 9.3)". GHSA-p3vf-v8qc-cwcr reports CVSS v3 score of 9.1 and CVSS v4 score of 9.3. Report does not specify which version; a reader defaulting to v3 (the more widely-used score in security tooling today) will see 9.1 and treat the report as wrong. Evidence file d6.1 reproduces "9.3" without qualifier.

**Current text:**
> "[CVE-2024-48910](https://github.com/advisories/GHSA-p3vf-v8qc-cwcr) (prototype pollution, CVSS 9.3)"

**Evidence:** GHSA-p3vf-v8qc-cwcr — CVSS v3 = 9.1, CVSS v4 = 9.3.

**Status:** PARTIAL / AMBIGUOUS
**Suggested resolution:** Annotate as "CVSS v4 9.3" (or drop to the v3 "CVSS 9.1" which is the more commonly cited score). Apply same treatment across the DOMPurify bullet list for internal consistency.

---

### [M] Finding 5: oven-sh/bun#26191 close date off by four days

**Category:** FACTUAL
**Source:** T4 (GitHub issue direct fetch)
**Location:** I.1 (line 89)
**Issue:** Report states the Bun programmatic test-runner API issue was "closed as duplicate 2026-01-17". Actual `closedAt` is 2026-01-21T09:07:24Z.

**Current text:**
> "[oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191), closed as duplicate 2026-01-17"

**Evidence:** Direct issue fetch — `closedAt: 2026-01-21T09:07:24Z`, state CLOSED/DUPLICATE.

**Status:** CONTRADICTED
**Suggested resolution:** Update date to 2026-01-21. Low-impact on conclusions; still worth correcting since the date is load-bearing for the "blocked on Bun" narrative in Exec Summary #1 and I.1.

---

### [M] Finding 6: Divergence-corpus autolinks sub-count off by one

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** IV.7 taxonomy bullet list (line 665)
**Issue:** IV.7 lists "autolinks (10 entries)". The evidence file has 11 autolinks entries (`grep "test_family: autolinks" evidence/divergence-corpus.md` → 11 lines). This finding is structurally part of Finding 1 but is also a standalone evidence-fidelity gap: the sub-count differs from the backing evidence file by one entry even before the grand-total question.

**Current text:**
> "- `autolinks` (10 entries) — bare URL, www, backslash, parens, trailing punctuation"

**Evidence:** evidence/divergence-corpus.md — 11 autolinks entries (lines 271, 279, 288, 295, 302, 311, 317, 323, 331, 339, 347).

**Status:** INCOHERENT
**Suggested resolution:** Change to "autolinks (11 entries)" and re-verify each per-family count against evidence before republishing.

---

### [M] Finding 7: Call-stack-ceiling numbers (Node ~3,842, Chrome ~3,931, Firefox ~49,392) uncited

**Category:** FACTUAL (unverifiable)
**Source:** L7 (inline source attribution)
**Location:** IV.2 (line 522)
**Issue:** Claim "~3,842 frames in Node, ~3,931 in Chrome, ~49,392 in Firefox" is load-bearing for the "single-digit-KB inputs crash every major parser" thesis, but carries no inline citation. A reader cannot assess whether these are from a benchmark, Node version, or folklore. Firefox's 49,392 vs. Chrome's 3,931 is a >10× claim that hinges on unspecified engine versions. Evidence file d6.2-stack-overflow-bugs.md would need to be checked to see if sources are there, but the report itself is unsourced inline.

**Current text:**
> "JS-engine call-stack ceilings are surprisingly low: ~3,842 frames in Node, ~3,931 in Chrome, ~49,392 in Firefox."

**Evidence:** Report prose has no inline link; not confirmed in this audit pass.
**Status:** UNVERIFIABLE (inline)
**Suggested resolution:** Either (a) add a citation (specific Node/V8/SpiderMonkey version or benchmark source), or (b) move the numbers behind a "per evidence/d6.2" reference and ensure the evidence file cites a primary source, or (c) generalize to "single-digit-thousand frames" without specific numbers.

---

## Low Severity

### [L] Finding 8: "remark-parse ~7k stars" / "markdown-it 21.3k stars" — star counts not dated

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** I.5 adopter table (line 217)
**Issue:** The ecosystem-adoption table uses approximate star counts (`~7k`, `21.3k`, `~50k`) without a "stars as of YYYY-MM-DD" footer. The report's `createdAt: 2026-04-19` frontmatter implies a fresh read, but star counts drift; in six months a reader can't tell whether "~7k" was at audit time or extrapolated. The Stryker-js maintenance block (lines 235–244) correctly includes "(2026-04-19)" — applying the same convention to the adopter table would close the gap.

**Current text:**
> "| remarkjs/remark | ~7k | ..."

**Status:** INCOHERENT (minor) — star counts were not independently verified in this audit; flagging as conditionality gap rather than contradiction.
**Suggested resolution:** Add "(stars as of 2026-04-19)" to the table caption, or note in I.5 header.

---

### [L] Finding 9: Exec Summary #5 footnote structure: "micromark strips a single leading BOM" — "every other BOM survives" understates

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence)
**Location:** Executive Summary point 5 (line 50); III.1 STRING-vs-STREAM paragraph (line 396)
**Issue:** Exec Summary #5 says BOM "mid-text, doubled, post-concatenation" survives under micromark. III.1 body documents a subtle additional case: mid-text BOM in **string** input is preserved, but in **stream** input via TextDecoder is stripped — "SAME parser, different input modes." The Exec Summary elides this nuance and reads as "all mid-text BOMs survive," which under-represents the actual per-input-path divergence that III.1 names as a silent hazard. For an Executive Summary meant to reflect the body findings, the string-vs-stream divergence is the more operationally important discovery.

**Current text (Exec Summary #5):**
> "`micromark` strips a single leading BOM; every other BOM (mid-text, doubled, post-concatenation) survives."

**Evidence:** III.1 line 396 explicitly calls the divergence out: "`'# hea\uFEFFding'` (string input) → `'<h1>hea\uFEFFding</h1>'` — BOM preserved mid-text. `'# hea\uFEFFding'` (stream via `TextDecoder`) → `'<h1>heading</h1>'` — TextDecoder strips the internal BOM. Same input, same parser, two different outputs depending on input mode."

**Status:** INCOHERENT (mild)
**Suggested resolution:** Extend Exec Summary #5 with a clause like "...survives in string-input mode; TextDecoder-driven stream input auto-strips internal BOMs, producing mode-dependent output from a single parser."

---

## Confirmed Claims (summary by track)

**T4 (web verification) — confirmed as stated:**
- Stryker-js v9.6.1 release date 2026-04-10 ✓ (as well as v9.6.0 / v9.5.1 / v9.4.0 / v9.3.0 dates).
- GHSA-rrrm-qjm4-v8hf (CVE-2022-21680, marked block.def cubic backtracking) ✓.
- GHSA-5v2h-r2cx-5xgj (CVE-2022-21681, marked reflinkSearch exponential) ✓.
- GHSA-9q5w-79cv-947m (CVE-2021-39199, remark-html CVSS 10.0, patched 13.0.2/14.0.1) ✓.
- GHSA-4fh9-h7wg-q85m (CVE-2025-66400, mdast-util-to-hast < 13.2.1, triple-backtick classname injection with exact PoC shape) ✓.
- stryker-js#5714 closed 2026-01-30; title and mechanism exactly as reported ✓.
- PR #5745 confirmed merged 2026-01-30, description "Fixes #5714", includes `vitest-fastcheck` e2e test ✓.
- commonmark/cmark#550 state OPEN, created 2024-06-24 (~22 months from 2026-04-19) ✓.

**T5 (external claims) — confirmed by evidence-file enumeration:**
- d6.1 evidence file contains exactly 20 advisories — matches Exec Summary #8 "9 of 20" and IV.1 "20 advisories captured." ReDoS count (9) matches by CWE-1333 / CWE-400 enumeration.
- Appendix A whitespace test vector corpus has exactly 28 entries (8 BOM + 10 line-ending + 10 tabs), matching Exec Summary #11 and III.4.
- d6.1 DOMPurify chain: 4 advisories (CVE-2024-48910, CVE-2024-45801, CVE-2025-26791, GHSA-h8r8-wccr-v5f2) — matches IV.1 "four 2024–2026 advisories."

**L1–L7 (coherence lenses) — broad result:**
- L1: No hard cross-finding contradictions across Parts I–IV. The three "conclusion-level tensions" in §Conflicts & Disagreements are correctly surfaced and framed as tradeoff-not-conflict.
- L2: Confidence-prose match generally holds. Inferred/unpublished items are explicitly marked ("Signal ranking is inferred from mutator semantics," "six patterns, inferred from mutator semantics + domain code shape," "composed effect is not isolated in a public benchmark").
- L3: Version-pinned claims carry dates (Stryker block, "as of 2026-04-19"). Exception: Finding 8 (star counts).
- L6: Stance "factual / landscape, no recommendations" is applied uniformly. The `Applicability` callouts enumerate levers rather than prescribe adoption. No "should / must / recommend" phrasing found in imperative form.
- L7: Inline attribution is strong for version/CVE/issue claims. Exception: Finding 7 (call-stack numbers).

---

## Unverifiable Claims

- **Community `stryker-mutator-bun-runner@0.4.0` "2–3× perf vs Node runners" maintainer claim** (I.1): report correctly hedges as "author claims... no independent third-party benchmark validates this." No action needed; properly hedged.
- **"No public GitHub repository runs ≥2 JS markdown parsers against shared inputs for equivalence assertion"** (II.4, Exec Summary #3): negative claim with documented search methodology. Cannot be fully verified without re-running searches; report's Limitations section correctly lists this as a negative finding rather than an absolute.
- **"~43% performance increase while still being 99.1% accurate"** for Stryker 6.4+ TS dependency-graph batching (I.1): attributed to the Stryker blog; not re-verified in this audit but inline-linked.
- **Throughput data "markdown-it 986 ops/sec, marked 729, commonmark.js 709, showdown.js 248, micromark 229"** (IV.4): attributed to "talk.commonmark.org/16" — the URL format is unusual (prose-only, not a hyperlink) and the benchmark source/date is not inline-cited. Reader cannot assess Node version or methodology without opening the evidence file. Not a defect in the report's factual accuracy (evidence file may cover it), but a minor L7 gap.
- **"commit 6b42465526bb15f70d98a0ea0daccea01ffb8004"** as the "remark-parse defers to micromark" pointer (II.1): not independently fetched in this audit. Report's broader claim that remark-parse delegates to micromark is widely documented; the specific commit hash is the only unverified fragment.

---

## Notes for Parent Handler

- **Stats consistency cluster** (Findings 1, 6, and partially 9): the "45 / 58 / 59" mismatch is the single most consequential finding in this audit. It touches the title description, the Executive Summary, the body section, and the Appendix heading — four out of four user-visible surfaces. A reader who sizes "lift-and-shift" effort from the "45" figure will under-estimate by ~30%. Resolving Finding 1 likely resolves Finding 6 as part of the same edit pass.
- **Citation-strength cluster** (Findings 2, 4, 7): three places where the report's inline characterization is stronger than the directly-accessible evidence supports. None invalidate the report's architectural conclusions — only the supporting-citation attribution shape.
- **Minor date/version drift** (Findings 3, 5, 8): low-stakes corrections — CVE range framing, a 4-day issue-close date, and missing star-count timestamp.
- No stance violations detected — the report holds "factual / landscape" uniformly. No "Applicability" callout escalates to recommendation language.
