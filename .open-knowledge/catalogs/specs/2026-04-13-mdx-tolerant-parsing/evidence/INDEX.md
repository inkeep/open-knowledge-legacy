---
title: evidence
description: ""
generated: true
schema_version: 1
---

## Articles

- **[crash-class-coverage](specs/2026-04-13-mdx-tolerant-parsing/evidence/crash-class-coverage.md)** — Empirical grounding of the 26-class crash taxonomy. Tests each crash class against the current parseSafe implementation and measures position-less error rate.
- **[crash-taxonomy](specs/2026-04-13-mdx-tolerant-parsing/evidence/crash-taxonomy.md)** — Enumerates every throw site in micromark-extension-mdx-jsx + mdast-util-mdx-jsx that survives agnostic-mode swap and R23 guard pre-processing. Grounds R6 test fixtures and sizes the coverage gap honestly.
- **[observability-pattern](specs/2026-04-13-mdx-tolerant-parsing/evidence/observability-pattern.md)** — Industry research grounding the R14 design choice (structured stderr + aggregate counter, not Y.Map per-doc event log). Explicit record because codebase patterns are AI-generated and shouldn't anchor decisions.
- **[P3-source-trace](specs/2026-04-13-mdx-tolerant-parsing/evidence/P3-source-trace.md)** — Deterministic code-path trace through y-prosemirror@1.3.7 updateYFragment for content-based vs attr-based node shapes. Replaces runtime probe with source-level verification.
- **[y-prosemirror-failure-modes](specs/2026-04-13-mdx-tolerant-parsing/evidence/y-prosemirror-failure-modes.md)** — Destructive-delete behavior on schema.node() throws; schema add-only invariant; Y.Item identity under updateYFragment
