---
title: yjs-dual-key-shimmer-analysis
description: ""
generated: true
schema_version: 1
---

## Articles

- **[Yjs Dual-Key Shimmer Analysis: Will Bidirectional Observer Sync Between Y.XmlFragment and Y.Text Actually Cascade?](reports/yjs-dual-key-shimmer-analysis/REPORT.md)** — Source-code-level analysis of whether the 'shimmer' problem (cascading formatting normalizations) actually occurs in a dual-key Yjs architecture using @tiptap/markdown. Traces the exact observer firing sequence through Yjs, y-prosemirror, and marked to prove that idempotent round-trips produce no-op diffs that fire no observers.

## Subfolders

- **[evidence](.open-knowledge/catalogs/reports/yjs-dual-key-shimmer-analysis/evidence/INDEX.md)** (5 articles)
