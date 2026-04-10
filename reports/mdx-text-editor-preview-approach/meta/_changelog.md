# Changelog

## 2026-04-07 — Path C: "Burn the boats" CM6-only analysis
**Update type:** Additive
**Why this pass happened:** Extend report with 5 new dimensions analyzing the "drop TipTap, go CM6-only" alternative for Open Knowledge editor architecture. Motivated by the source toggle problem (TipTap uses Y.XmlFragment but source mode needs Y.Text).

### Scope (delta only)
- D7: CM6 decoration ceiling for Notion-grade WYSIWYG
- D8: What we'd lose dropping TipTap
- D9: What we'd gain going CM6-only
- D10: Effort estimate: CM6-only vs TipTap for full product
- D11: Hybrid option: CM6 source + TipTap WYSIWYG, shared Y.Text

### What changed (current-state)
- REPORT.md — sections touched: frontmatter (updatedAt, subjects, topics, description), Executive Summary (added Path C key findings), Research Rubric (added D7-D11 rows), Detailed Findings (added D7-D11 sections), Limitations (added 3 new gaps), References (added evidence files and 12 new external sources)
- Evidence — added: d7-cm6-decoration-ceiling.md, d8-what-wed-lose-dropping-tiptap.md, d9-what-wed-gain-cm6-only.md, d10-effort-estimate-cm6-vs-tiptap.md, d11-hybrid-cm6-tiptap-shared-ytext.md

### Notes on confidence / contradictions
- D7 finding (CM6 has a structural ceiling) tensions with D9 finding (CM6 gains are significant). Both are accurate — the gains are real for source editing, the ceiling is real for WYSIWYG. The hybrid option (D11) resolves this tension.
- Effort estimates in D10 are INFERRED from ecosystem analysis, not from direct implementation experience. Actual effort could vary 2x in either direction.

### Open questions / gaps
- Performance benchmarks for CM6 with many widget decorations (100+ rendered React components)
- Feasibility of Y.Text formatting attributes as a Peritext-like mechanism for the hybrid binding
- Cross-mode collaboration implementation details (conflict resolution, cursor mapping)
