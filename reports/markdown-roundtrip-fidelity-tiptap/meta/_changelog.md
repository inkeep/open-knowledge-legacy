# Changelog — Markdown Round-Trip Fidelity Through @tiptap/markdown

## 2026-04-11 — F4: 118-Case Three-Library Ecosystem Comparison

**Finding ID:** F4
**Dimension:** D2 (Ecosystem Comparison)
**Type:** Path C update (extend existing report)

Extended the D2 ecosystem comparison from 27 constructs to 118, testing all three libraries:
- @tiptap/markdown (marked v17 + TipTap JSON)
- prosemirror-markdown (markdown-it v14 + ProseMirror doc)
- marked-only (marked lexer + manual token reconstruction)

**Key findings:**
- prosemirror-markdown fixes ALL 10 entity corruption cases and ALL 4 backslash escape cases
- prosemirror-markdown introduces 9 NOT_IN_SCHEMA failures (task lists, strikethrough, wiki-links)
- marked-only has the highest raw fidelity (91/118 whitespace-only) proving corruption is in serialize layers
- Migration to prosemirror-markdown NOT recommended: fixes 14 bugs but creates 9 new ones

**Files added:**
- `evidence/d2-ecosystem-comparison-118.md` (synthesis, supersedes d2-ecosystem-comparison.md)
- `evidence/d2-three-library-probe.ts` (probe script)
- `evidence/d2-three-library-results.tsv` (118-row results)

**Files updated:**
- `REPORT.md` — D2 section: appended "D2 Update 2026-04-11" subsection; updated evidence references; updated limitations

## 2026-04-07 — Initial Report

Original 7-dimension report with 27 test cases across 2 libraries.
