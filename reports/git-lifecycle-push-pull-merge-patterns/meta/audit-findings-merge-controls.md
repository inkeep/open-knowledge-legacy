# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/reports/git-lifecycle-push-pull-merge-patterns/REPORT.md
**Scope:** New "Merge Control UI Fitness (@codemirror/merge)" subsection (lines 285-325) + D3 (extended) exec summary bullet (line 106)
**Evidence file:** evidence/codemirror-merge-controls-fitness.md
**Audit date:** 2026-04-15
**Total findings:** 4 (0 high, 2 medium, 2 low)

---

## Medium Severity

### [M] Finding 1: Comparison table drops diffview.nvim row present in evidence

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L5 (summary coherence)
**Location:** REPORT.md lines 314-323 (embedded comparison table)
**Issue:** The evidence file's comparison table has 9 rows including `diffview.nvim` (keybindings, per-hunk + per-file, Yes 3+4 way, No (Neovim), Low non-dev). The synthesized table in the report has only 8 rows -- diffview.nvim was silently dropped. This is notable because diffview.nvim is the only surveyed tool with 4-way merge support, and it appears earlier in the D3 section at line 255 ("Architecture 1 -- Dedicated 3-way merge editor... diffview.nvim") and again at line 612 ("diffview.nvim supports both 3-way and 4-way layout options"). A reader comparing the new table against D3 references elsewhere will notice the omission.
**Current text:** Table at lines 314-323 (8-row table without diffview.nvim)
**Evidence:** Evidence file lines 147-157 contain the full 9-row table including `| diffview.nvim | Keybindings (co/ct/cb/ca) | Per-hunk + per-file | Yes (3+4 way) | No (Neovim) | Low |`
**Status:** INCOHERENT
**Suggested resolution:** Add the diffview.nvim row to the report's table for completeness and consistency with the evidence file and earlier D3 references.

---

### [M] Finding 2: "The only production-quality, embeddable, per-hunk accept/reject implementation" stated as absolute fact

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** REPORT.md line 291 (subsection) and line 106 (exec summary)
**Issue:** The claim "@codemirror/merge's `mergeControls` is the only production-quality, embeddable, per-hunk accept/reject implementation available" is stated as absolute fact in both the subsection and exec summary. The evidence supports this as a survey finding (the survey covered Monaco, react-diff-view, react-diff-viewer-continued, @git-diff-view/react, Mergely, and standalone tools). However, negative survey results ("we found no alternative") are not the same as universally exhaustive claims ("no alternative exists"). The survey did not cover every npm package, and the community Monaco demo (evidence line 139) shows others are attempting to build this capability. The prose should reflect that this is based on a bounded survey, not a provable universal.
**Current text:** "@codemirror/merge's `mergeControls` option is the only production-quality, embeddable, per-hunk accept/reject implementation available."
**Evidence:** Evidence file "Negative searches" section (lines 162-167) correctly frames these as bounded searches. Evidence file finding line 141 correctly uses "the clear foundation choice" rather than "the only."
**Status:** INCOHERENT
**Suggested resolution:** Add a bounded qualifier, e.g., "Among surveyed React-embeddable diff/merge libraries, @codemirror/merge's `mergeControls` is the only production-quality per-hunk accept/reject implementation found." Or use the evidence file's softer framing: "the clear foundation choice."

---

## Low Severity

### [L] Finding 3: Mergely license cited as "LGPL" without noting triple-license (GPL/LGPL/MPL)

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md line 321 (table cell: "Yes (LGPL)"), evidence file line 137 ("LGPL-licensed")
**Issue:** Mergely uses GPL/LGPL/MPL triple licensing per the official license page. Citing only "LGPL" is not wrong (LGPL is one of the available options) but is incomplete. A reader evaluating license compatibility might make different decisions knowing all three options are available (MPL is more permissive than LGPL for certain integration patterns).
**Current text:** "Yes (LGPL)" in table; "LGPL-licensed" in evidence
**Evidence:** Web search confirms Mergely distributes under GPL, LGPL, and MPL open source licenses; commercial CDL also available.
**Status:** INCOHERENT
**Suggested resolution:** Change "Yes (LGPL)" to "Yes (GPL/LGPL/MPL)" in the table, and update the evidence file similarly.

---

### [L] Finding 4: Report table drops "Granularity" column from evidence table

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** REPORT.md lines 313-323 (table columns)
**Issue:** The evidence file's comparison table includes a "Granularity" column (per-chunk, per-hunk, per-line, per-change, N/A for read-only tools). The report table omits this column. Granularity is directly relevant to the fitness assessment -- the report text discusses per-chunk granularity as a limitation at line 295 ("No per-line or per-character accept/reject is built in"). Dropping the column from the table forces the reader to get this information only from prose, losing the at-a-glance comparison.
**Current text:** Table columns: Component | Merge controls | Embeddable | 3-way | Non-dev fit
**Evidence:** Evidence table columns: Tool | Controls | Granularity | 3-way | Embeddable | Non-dev friendliness
**Status:** INCOHERENT
**Suggested resolution:** Add the Granularity column back to the report table, or add a note explaining why it was omitted.

---

## Confirmed Claims (summary)

**T2 (source code verification against @codemirror/merge v6.12.1 in node_modules):**
- Version pin v6.12.1 confirmed (package.json `^6.12.1`, installed version `6.12.1`)
- Two `<button>` elements per chunk in unified view -- confirmed (source lines 1543-1564)
- `div.cm-chunkButtons` container inside `div.cm-deletedChunk` -- confirmed
- Default colors #2a2 (accept) and #d43 (reject) -- confirmed (source lines 1141-1142)
- `state.phrase("Accept")`/`state.phrase("Reject")` localization -- confirmed (source lines 1558, 1562)
- Custom render function signature `(type: "reject" | "accept", action: (e: MouseEvent) => void) => HTMLElement` -- confirmed (index.d.ts line 362)
- Custom render function called twice per chunk -- confirmed (source lines 1551-1553)
- `acceptChunk` dispatches `userEvent: "accept"`, updates `originalDoc` state field (not editor document) -- confirmed (source lines 1655-1658)
- `rejectChunk` dispatches `userEvent: "revert"`, replaces editor document range -- confirmed (source lines 1675-1678)
- Per-chunk granularity, `Chunk` class, no per-line/per-character -- confirmed (source lines 588-665)
- `Chunk.build(a, b, conf)` compares two `Text` documents (2-way only) -- confirmed (source line 649)
- `collapseUnchanged` creates replacement widgets between chunks, orthogonal to merge controls -- confirmed (source lines 1043-1067)
- `revertControls` in side-by-side mode uses arrow buttons in 1.6em `cm-merge-revert` column -- confirmed (source lines 1082-1083, 1401-1412)
- No read-only guard on button rendering -- confirmed (no `readOnly`/`editable` check in widget construction path)
- CSS selectors `baseTheme` priority -- confirmed (source lines 1129-1143)

**T4/T5 (web verification of landscape claims):**
- Monaco DiffEditor issue #2269 open and unimplemented -- confirmed via GitHub fetch
- react-diff-view has no merge controls (read-only diff viewer) -- confirmed via web search + npm
- @git-diff-view/react is a read-only diff viewer -- confirmed via web search + npm
- Mergely has `mergeCurrentChange(side)` API -- confirmed via web search + official docs
- GitKraken has AI-assisted conflict resolution (v11.2, Preview) -- confirmed via web search
- Mergely license is GPL/LGPL/MPL (triple) -- confirmed via web search (finding [L] F3 about incomplete citation)

**Coherence (no contradictions found):**
- New content is consistent with existing D3 section (lines 247-284) -- no cross-finding contradictions
- Exec summary bullet accurately reflects the detailed subsection
- MEDIUM fitness assessment is supported by the evidence: clear strengths (only embeddable merge controls, custom render function, composable with collapseUnchanged) balanced against clear gaps (2-way only, no read-only guard, per-chunk only)
- Analytical stance maintained consistently with rest of report

## Unverifiable Claims

- **"react-diff-viewer-continued is read-only"** -- Web search confirmed it is a diff viewer; no merge control features found. The specific version v4.2.0 referenced in the external sources (line 1144) was not independently verified.
- **GitKraken non-dev friendliness "Medium-High"** -- Subjective assessment. GitKraken has AI resolve and checkboxes which are more accessible than developer-oriented tools, supporting "Medium-High." Not independently verifiable beyond qualitative judgment.
- **VS Code merge editor non-dev friendliness "Medium"** -- Same subjectivity caveat.
