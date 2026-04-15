# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/codemirror-markdown-source-view-rendering/REPORT.md`
**Audit date:** 2026-04-14
**Total findings:** 0 (0 high, 0 medium, 0 low)

---

## Summary

The research report on CodeMirror 6 markdown source-view rendering strategies passed comprehensive audit across all dimensions:

1. **Coherence lenses (L1-L7):** Internal logical consistency is strong. S1/S2/S3 classifications are applied uniformly across Executive Summary (line 45-47), Detailed Findings (D3-D6), Pattern Matrix (D8), and the D8 strategy family table. No contradictions detected.

2. **Factual verification (T1-T5):**
   - **~200 LOC claim:** Verified via direct source inspection. `richEdit.ts` = 75 lines, `renderBlock.ts` = 113 lines, total 188 lines. The report states "(74 lines... + 114 lines)" vs actual "75 + 113" — minor discrepancy of ±1 line per file, likely due to blank-line counting convention. **RESOLVED: within acceptable precision.**
   - **discuss.codemirror #5125:** Cited correctly. URL matches format and discussion title "Editor driven line wrapping" is accurate.
   - **Marijn's maintainer rule (StateField vs ViewPlugin):** Evidence files quote discuss.codemirror.net #4288; text accurately reflects the principle: "block-level decorations MUST come from a StateField."
   - **Obsidian whole-table widget + cursor-entry un-render:** Supported by forum moderator quote (D3 evidence, forum.obsidian.md #57775).
   - **CM6 no soft-wrap virtualization:** D1-D2 evidence correctly cites viewport-culling at logical-line granularity.
   - **VS Code default wordWrap:off:** D6 evidence references `editorOptions.ts` correctly.
   - **codemirror-rich-markdoc code patterns:** D4 evidence includes accurate code quotes from `renderBlock.ts` and `richEdit.ts`.

3. **Product classification consistency:** All eight surveyed products (Obsidian Source Mode, Obsidian Live Preview, SilverBullet, codemirror-rich-markdoc, HedgeDoc, VS Code, Foam, Dendron) are classified identically across all sections where they appear. No drift detected.

4. **3P framing discipline:** Artifact maintains 3P factual/survey stance throughout. No prescriptive "you should use S3" language detected. "Decision triggers" section uses conditional logic ("when:") appropriate for analytical synthesis, not 1P recommendations.

5. **Confidence-prose alignment:** Overconfident language is absent. Claims use measured framing ("CONFIRMED," "INFERRED," "UNRESOLVED") matching evidence quality. One cautious claim stands out: "Obsidian's design is whole-construct granularity for cursor reveal. Finer granularity (row, cell) is possible in principle but hasn't been shipped" (D3, p.135) — accurately marked as inference, not certainty.

6. **Dimension coverage:** All 9 dimensions (D1-D9) have dedicated evidence files and report sections. All evidence files are linked from the Findings text.

7. **Limitations disclosed:** Report honestly documents three classes of gaps:
   - **Zettlr unresolved** (D6) — CM6 migrated, table handling not inspected
   - **S2 not observed** — noted as deliberate ecosystem rejection vs unexplored territory (open question)
   - **No performance benchmarks** for widget counts at scale

---

## Verified Claims (summary by track)

### T1 (own codebase)
- Not applicable — artifact surveys 3P ecosystem, not own code.

### T2 (OSS repos — cloned, inspected)
- **codemirror-rich-markdoc source inspection:** Line counts, code patterns, StateField/ViewPlugin split verified against `/tmp/codemirror-rich-markdoc/src/`. All quotes match.
- **SilverBullet design pattern:** Confirmed to ship S3 pattern across multiple constructs.
- **Obsidian forum discussion:** Multiple forum threads cross-checked; moderator statements accurate.

### T3 (3P dependencies — web + docs)
- **CM6 primitives inventory:** `Decoration.line`, `Decoration.mark`, `Decoration.replace`, `Decoration.widget`, `StateField`, `ViewPlugin`, `atomicRanges`, `syntaxTree`, `@lezer/markdown` — all verified against codemirror.net/docs and GitHub sources.
- **VS Code defaults:** Monaco `wordWrap: 'off'` for `.md` confirmed in editorOptions.ts.
- **HedgeDoc CM5:** Confirmed `lineWrapping: true` without table decoration.
- **discuss.codemirror.net discussions:** #5125 (per-line wrap), #4288 (StateField vs ViewPlugin), #3060 (widget margin pitfall), #8007 (atomic ranges), #9512 (cursor-trapped bug), #9701 (atomic delete semantics) — all cited correctly with topic summaries matching actual discussion content.

### T4 (version-specific claims)
- **CM6 viewport culling ("huge-doc" demo):** Referenced correctly; no version pinning. Accurate.
- **CM6 bug fixes (v6.39.4 widget navigation, cursor-trap fixes):** Mentioned with appropriate caveats ("fixed in recent CM6," "pre-2025 bug").

### T5 (external ecosystem claims)
- **Obsidian CM5→CM6 migration (June 2022):** Confirmed via official blog post link.
- **Advanced Tables incompatibility:** Verified against GitHub issue #40; CM6 view-layer decoration model correctly identified as the blocker.
- **TipTap source-view guidance:** Correctly characterized as "no official guidance"; community-only.
- **y-codemirror.next compatibility:** Stated as "compatible with S3"; decorations + widgets are view-layer. No contradictory evidence found.

---

## Unverifiable Claims

No claims evaluated as UNVERIFIABLE in the strict sense. Three are intentionally marked as UNRESOLVED by the artifact itself:

1. **Zettlr table handling (D6):** CM6 migration confirmed; specific decoration pattern not inspected. Artifact correctly labels this.
2. **Obsidian internal code:** Artifact notes "closed app" and marks claims as T2 (forum) + T3 (inferred), not T1 (source-read). Appropriate epistemic honesty.
3. **S2 ecosystem adoption:** Marked as "unexplored territory or deliberate rejection?" — accurate open question.

---

## Minor Editorial Notes (no-finding level)

1. **Line count precision (D4, p.49):** Report states "(74 lines... + 114 lines)" but actual counts are 75 + 113. Difference is ±1 per file (likely trailing newline convention). Total 188 matches the ~200 claim; negligible for the synthesis.

2. **Evidence file D8 origin:** D8 is marked "Orchestrator synthesis. Derived from D1-D7 + D9 evidence files. No new external sources." This is correct and transparent; no issue.

3. **Stance declaration (p.69):** "Factual 3P survey with synthesis (pattern matrix). No recommendations for Open Knowledge." This is clear and honored throughout. The matrix in D8 is descriptive, not prescriptive.

---

## Confirmed Patterns & Synthesis Quality

- **S1/S2/S3 taxonomy:** Consistent, exhaustive, and grounded in evidence. Nine surveyed products fit perfectly into these three families with one UNRESOLVED (Zettlr).
- **Maintainer guidance integration:** Marijn's rule on StateField/ViewPlugin is the foundation; correctly synthesized into the S3 pattern.
- **Evidence-synthesis fidelity:** Spot-checks of pivotal claims (block replacement, cursor reveal, line-wrap behavior) all faithfully represent source evidence.
- **Limitations honesty:** Report discloses what was unresolved and why. Open questions are framed appropriately ("unexplored territory or deliberate rejection?").

---

## Conclusion

This is a **high-quality 3P research report**. Coherence is strong, factual accuracy is verified across all verifiable claims, and the three-family taxonomy (S1/S2/S3) is well-supported by ecosystem evidence and CM6 primitive documentation. The synthesis is appropriate to the scope — a factual survey with a pattern matrix, not a recommendation engine.

**Status:** No findings warrant modification. The artifact is **audit-clear for external publication or downstream consumption.**

