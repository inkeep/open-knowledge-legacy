# Audit Findings

**Artifact:** reports/markdown-construct-fidelity-catalog/REPORT.md
**Audit date:** 2026-04-11
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H1] Finding 1: D3 priority ranking claims "41 constructs with material differences" but lists 49 items

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L1 (cross-finding contradiction)
**Location:** REPORT.md D3 section (line 167); evidence/d3-hit-list-ranked.md
**Issue:** The D3 section states: "Of the 41 constructs with material differences, 12 are P0 (must test immediately), 14 are P1 (should test), 17 are P2 (already covered or low frequency), and 6 are P3 (out of scope)." The sum is 12 + 14 + 17 + 6 = **49**, not 41. Furthermore, the ranking doesn't only cover "material differences" — P2 includes passing WHITESPACE_DIFF constructs (Unicode, wiki-links, task lists, strikethrough, standard emphasis, etc.) used as regression guards, and P3 includes 6 constructs not in the 118-case catalog at all (math blocks, definition lists, footnotes, alerts, emoji shortcodes, BOM/CRLF).
**Current text:** "Of the 41 constructs with material differences, 12 are P0 (must test immediately), 14 are P1 (should test), 17 are P2 (already covered or low frequency), and 6 are P3 (out of scope)."
**Evidence:** D3 evidence file numbers items 1-49 across P0-P3. `probe-results.tsv` confirms only 39 constructs have non-WHITESPACE_DIFF, non-BYTE_IDENTICAL classifications. P2 items 27-43 in the evidence file include WHITESPACE_DIFF constructs like Unicode, wiki-links, and standard emphasis. P3 items 44-49 reference constructs absent from the 118-case catalog.
**Status:** INCOHERENT
**Suggested resolution:** Reframe to: "Of all 118 constructs, we ranked 49 by test priority: 12 P0, 14 P1, 17 P2, 6 P3. The 12 P0 and 14 P1 constructs all have material fidelity issues; P2/P3 include regression guards and out-of-scope constructs." Alternatively, if the intent is to rank only the material-difference cases, remove the P2 regression guards and P3 out-of-scope items from the count and revise to "39 constructs with material differences."

---

### [H2] Finding 2: Numeric entity cases counted as COSMETIC_NORMALIZATION in tables but described as ENTITY_CORRUPTION in prose

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L4 (evidence-synthesis fidelity)
**Location:** REPORT.md exec summary (line 38), D1 section (lines 96-106); evidence/d1-construct-catalog.md (lines 101-106)
**Issue:** The aggregate classification table shows ENTITY_CORRUPTION: 10 and COSMETIC_NORMALIZATION: 3. The `probe-results.tsv` classifies `numeric-entity-decimal` and `numeric-entity-hex` as COSMETIC_NORMALIZATION — and these are 2 of the 3 COSMETIC_NORMALIZATION cases. The D1 evidence file explicitly acknowledges this is wrong: "**This is data corruption** — numeric entities are broken on round-trip. Reclassifying in hit list." However, the aggregate table in D1 and the REPORT.md exec summary were never updated to reflect this reclassification. The exec summary says "10 ENTITY_CORRUPTION cases" but its prose description says the 10 include "all named / numeric entities (&copy;, &#169;)" — implying the 2 numeric cases are among the 10, when the TSV says they aren't. If the reclassification were applied: ENTITY_CORRUPTION → 12, COSMETIC_NORMALIZATION → 1.
**Current text:** "10 ENTITY_CORRUPTION cases — literal &, <, > in body text get HTML-escaped on every save... Affects brand names (H&M, AT&T), mathematical notation (a < b), any HTML in body text, and all named / numeric entities (&copy;, &#169;)."
**Evidence:** `probe-results.tsv` lines 77-78: `numeric-entity-decimal` and `numeric-entity-hex` both classified as `COSMETIC_NORMALIZATION`. D1 evidence lines 101-105: analyst notes corruption and says "Reclassifying in hit list." D3 evidence lists them as P0 #7 alongside entity corruption cases.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) update the aggregate classification table to show ENTITY_CORRUPTION: 12, COSMETIC_NORMALIZATION: 1, and change the exec summary to "12 ENTITY_CORRUPTION cases" — or (b) keep the TSV's mechanical classification at 10 but add an explicit note that 2 additional COSMETIC_NORMALIZATION cases (numeric entities) are analytically reclassified as corruption, making the practical corruption count 12.

---

## Medium Severity

### [M1] Finding 3: "30 constructs with material corruption" is unexplained arithmetic

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L5 (summary coherence)
**Location:** REPORT.md exec summary (line 36)
**Issue:** The exec summary states "there are **30 constructs with material corruption**" and then itemizes failure types: 10 ENTITY_CORRUPTION + 4 BACKSLASH_ESCAPE_CONSUMED + 1 LINK_REFERENCE_DEFINITION_DESTROYED + 3 NON_IDEMPOTENT + ~18 STRUCTURE_CHANGE. These sum to ~36, not 30. No combination of the 6 TSV classification categories produces exactly 30. The correct count of non-WHITESPACE_DIFF, non-BYTE_IDENTICAL constructs from the TSV is 39. The number 30 does not reconcile with any derivable grouping and appears to be a draft artifact.
**Current text:** "Behind that cushion of 'mostly fine' there are **30 constructs with material corruption**"
**Evidence:** `probe-summary.txt`: STRUCTURE_CHANGE(18) + ENTITY_CORRUPTION(10) + SEMANTIC_LOSS(8) + COSMETIC_NORMALIZATION(3) = 39. The itemized list in the exec summary sums to ~36. Neither produces 30.
**Status:** INCOHERENT
**Suggested resolution:** Replace "30" with the correct count. If "material corruption" means all non-WHITESPACE_DIFF, non-BYTE_IDENTICAL: 39. If it means only categories with data impact (excluding STRUCTURE_CHANGE which the report calls "harmless"): 10 + 8 + 3 = 21. Pick the intended grouping and state it explicitly.

---

### [M2] Finding 4: "41 material differences" double-counts BYTE_IDENTICAL cases

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** REPORT.md D1 section (line 80); evidence/d1-construct-catalog.md (line 74)
**Issue:** D1 states: "Only 2 out of 118 constructs round-trip byte-identically. 77 have whitespace-only differences. 41 have material differences." The "41" is computed as 118 - 77 = 41, which includes the 2 BYTE_IDENTICAL cases. BYTE_IDENTICAL means *no difference at all* — the opposite of a "material difference." The correct count of constructs with material differences is 118 - 77 - 2 = 39. The phrasing presents three partitions (2 identical + 77 whitespace + 41 material) that sum to 120, not 118.
**Current text:** "Only 2 out of 118 constructs round-trip byte-identically. 77 have whitespace-only differences (mostly trailing-newline truncation). 41 have material differences."
**Evidence:** `probe-summary.txt`: BYTE_IDENTICAL: 2, WHITESPACE_DIFF: 77. 118 - 77 - 2 = 39 non-trivial differences.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite as: "Only 2 out of 118 constructs round-trip byte-identically. 77 differ only in trailing whitespace. The remaining **39** have material differences beyond whitespace normalization." This creates a clean partition: 2 + 77 + 39 = 118.

---

## Low Severity

### [L1] Finding 5: D2 root cause trace omits second `encodeTextForMarkdown` call site in MarkdownManager.ts

**Category:** FACTUAL
**Source:** T2 (OSS repos — source verification)
**Location:** REPORT.md D2 section (lines 136-140); evidence/d2-root-cause-entities.md (lines 82-88)
**Issue:** The D2 call path diagram shows a single path: `renderNodeToMarkdown` (line 923) → `encodeTextForMarkdown`. However, `MarkdownManager.ts` has a *second* call to `encodeTextForMarkdown` at line 1020, inside `renderNodesWithMarkBoundaries`. The D2 evidence acknowledges "The full 1298-line MarkdownManager.ts was not exhaustively read," but the call path diagram implies a single invocation path, which could mislead someone patching at the call-site level (Option B).
**Current text:** Call path diagram shows only `renderNodes() / renderNodeToMarkdown() → encodeTextForMarkdown`
**Evidence:** `node_modules/@tiptap/markdown/src/MarkdownManager.ts:1020`: `let textContent = this.encodeTextForMarkdown(node.text || '', node, parentNode)` — a second call path through `renderNodesWithMarkBoundaries`.
**Status:** STALE
**Suggested resolution:** Add the second call site to the call path diagram or note that `encodeTextForMarkdown` is called from both `renderNodeToMarkdown` (line 923) and `renderNodesWithMarkBoundaries` (line 1020). Impact on fix options is minimal — Option A (post-process wrapper) covers both paths.

---

## Confirmed Claims (summary)

**Classification arithmetic:** The 6-class aggregate counts (77 + 18 + 10 + 8 + 3 + 2 = 118) are confirmed by `probe-results.tsv` and `probe-summary.txt`. Each TSV row's classification matches its stated category.

**Layer A = Layer B equivalence:** All 118 TSV rows show `aMatchesB = Y`. Zero divergences. The claim that the CRDT observer bridge is a pass-through is confirmed.

**Non-idempotent cases:** Exactly 3 cases (inline-code-with-backticks, html-block-div, frontmatter-yaml) have `idempotent = N` in the TSV. Matches the report.

**Source code quotes (D2):** The `htmlEntities.ts` source code quoted in the D2 evidence is byte-exact against `node_modules/@tiptap/core/src/utilities/htmlEntities.ts`. The `encodeTextForMarkdown` function signature, the `codeTypes` set, and the import statement all match the quoted line numbers (15, 901-911, 923).

**Serializer call sites:** The 4 call sites claimed in D2 (persistence.ts:333, persistence.ts:348, agent-sessions.ts:58, standalone.ts:169) all confirmed via grep.

**`conversion-fidelity.test.ts` assertion:** The test file uses `normalized.match(/\w{3,}/g)` (lines 180, 198, 242, 287) for non-stable constructs. The report's claim that this regex is blind to `&`, `<`, `>`, `\`, `*`, `_`, `[`, `]`, `#` is correct. The test has 22 constructs in its `CONSTRUCTS` array, matching the report's claim.

**Probe script methodology:** The `probe-script.ts` correctly implements both Layer A (mdManager-only) and Layer B (full Y.Doc path) round-trips. Classification logic is consistent with the reported scheme. The script's `CONSTRUCTS` array has 118 entries matching the TSV.

## Unverifiable Claims

**`@tiptap/markdown` undocumented options:** The report states "Not verified whether @tiptap/markdown has an undocumented option to customize encodeTextForMarkdown." This was not verified during audit either. The full 1298-line `MarkdownManager.ts` was not exhaustively read for configuration options beyond the `encodeTextForMarkdown` function itself.

**marked tokenizer behavior for backslash escapes:** The report notes uncertainty about whether content loss for `\*`, `\_`, `\[`, `\#` originates in marked's tokenizer vs `@tiptap/markdown`'s renderer. Not verified — would require stepping through marked's parse internals.
