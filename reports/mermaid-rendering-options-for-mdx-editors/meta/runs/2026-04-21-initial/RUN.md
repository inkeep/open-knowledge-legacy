---
run_id: 2026-04-21-initial
status: Closed
purpose: Initial research pass on Mermaid rendering options for MDX editors
---

# Run: 2026-04-21-initial

**Status:** Closed (2026-04-21 — REPORT.md + 5 evidence files + audit-findings.md + _changelog.md shipped)
**Report:** `mermaid-rendering-options-for-mdx-editors`

## Purpose (this pass)

Factual landscape on Mermaid rendering options for a live MDX editor context. No recommendations. Evidence-cited facts only per rubric.

## Scoping decisions (post-confirmation, 2026-04-21)

- Rubric dimensions D1–D7 confirmed as proposed.
- **D6 (mermaid-live-editor) folded into D3** — it's a sibling editor implementation, same category as BlockNote/Outline. Keeps dimension count at 5 P0 + rolled P1 observations.
- **Fallback-behavior observations** captured organically under D3 where sources discuss "render error → show raw code fence" patterns. Not promoted to own dimension.
- **Editor-constraint framing paragraph** included in report intro. Report stays 3P-factual; intro names the constraints that made the research useful without doing 1P analysis.
- Version pins: `mermaid@11.14.0` (installed in `docs/package.json`). Document v9→v10→v11 API drift where relevant.

## Delta rubric (owners by dimension cluster)

| Cluster | Dimensions | Source anchors |
|---|---|---|
| **A — Mermaid package facts** | D1 + D7 | `node_modules/mermaid@11.14.0`; github.com/mermaid-js/mermaid; mermaid.js.org |
| **B — Alternatives** | D2 | npm registry (beautiful-mermaid, mermaid-cli); kroki.io; github.com/mermaid-js/mermaid-cli |
| **C — Sibling editors** | D3 (+ D6 folded) | `~/.claude/oss-repos/{blocknote,lexical,outline,tiptap,tiptap-markdown}`; github.com/mermaid-js/mermaid-live-editor; web for Notion, Obsidian, MDXEditor, VS Code |
| **D — Re-render + bundle** | D4 + D5 | `node_modules/mermaid`; bundlephobia; npm pack; fumadocs docs reference pattern |

## Canonical sources

- **Primary (source)** — `node_modules/mermaid/package.json`, `node_modules/mermaid/dist/*`, local OSS clones.
- **Primary (docs)** — mermaid.js.org, github.com/mermaid-js/mermaid (README, CHANGELOG, issues), fumadocs docs mermaid page.
- **Secondary (community)** — GitHub issues, dev.to only as corroboration, flagged at evidence level.

## Non-goals (hard boundaries for this run)

- No 1P implementation recommendation
- No 1P codebase analysis beyond the intro framing paragraph
- No performance benchmarks we run ourselves
- No accessibility or syntax-highlighting (raw code fence) dimensions

## Vendor-bias flags expected

- `beautiful-mermaid` docs — 3P product with GTM interests
- Kroki.io docs — service vendor
- Notion, Obsidian eng blogs when touching their own products
- fumadocs docs when discussing their own recommendation

## Coverage tracking (via tasks in parent session)

Tasks #83-#87 track the full workflow. Within this run, the parent (this session) orchestrates directly — no persistent task file inside RUN.md per skill convention.
