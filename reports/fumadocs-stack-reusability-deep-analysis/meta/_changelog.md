# Changelog

## 2026-04-05 — Add D13: llms.txt internals reusability for local catalog generation
**Update type:** Additive
**Why this pass happened:** User asked whether the same Fumadocs internals that power llms.txt web delivery can be reused for local filesystem catalog generation (per-folder catalog files computed from CRDT content + folder metadata).

### Scope (delta only)
- D13: Traced the full data flow of remarkLLMs, stringifier, llms() index generator, content negotiation, and getLLMText pattern. Assessed each function's IO coupling, state management, and output-target dependency. Determined which pieces are shared between web serving and local disk writing.

### What changed (current-state)
- REPORT.md — sections touched: Research Rubric (added D13 row), Executive Summary Key Findings (added D13 bullet), new D13 section after D12, References/Evidence Files (added d13 entry), frontmatter topics (added "local catalog generation")
- Evidence — added: `evidence/d13-llms-internals-local-reusability.md`

### Notes on confidence / contradictions
- All findings CONFIRMED via primary source code analysis (no web sources needed)
- D13 findings are fully consistent with D11 -- D13 extends D11's analysis to the specific question of output-target reusability

### Open questions / gaps
- Performance of `remark().use(remarkMdx).parse()` at Hocuspocus event frequency -- not benchmarked
- Whether remark-mdx alone (without full MDX compiler) produces sufficient AST for remarkLLMs -- needs integration test
