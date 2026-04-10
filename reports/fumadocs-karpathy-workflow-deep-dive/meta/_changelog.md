# Changelog

## 2026-04-02 — Fumadocs-Orama integration deep dive
**Update type:** Additive
**Why this pass happened:** Deep-dive on how Fumadocs integrates with Orama — the full pipeline from MDX files to searchable index, to inform what orchestration code we would need for our own Orama integration.

### Scope (delta only)
- D2 (Search Capabilities) — expanded with full Orama pipeline analysis
- Seven sub-dimensions investigated: integration package, indexing pipeline, Orama schema, search UI, advanced/vector integration, Fumadocs vs Orama responsibility boundary, limitations for real-time use case

### What changed (current-state)
- REPORT.md — sections touched: D2 (Search Capabilities) expanded with pipeline deep dive subsection, Executive Summary updated with three new bullet points, Limitations section clarified on embedding generation
- Evidence — added: `evidence/fumadocs-orama-integration.md` (full pipeline source code analysis, ~500 lines)
- References — added evidence file link

### Notes on confidence / contradictions
- Prior report stated "Orama advanced mode with vector embeddings enables hybrid search" which could imply Fumadocs provides embedding generation. Clarified: the schema *supports* vectors but Fumadocs never populates the field — embedding generation is entirely Orama's responsibility via `@orama/plugin-embeddings`.

### Open questions / gaps
- `@orama/plugin-embeddings` internals (models, latency, build-time vs runtime)
- Incremental indexing with Orama's `insert`/`update`/`remove` APIs — feasibility study for CRDT-backed use case
- FlexSearch as lightweight alternative evaluation
