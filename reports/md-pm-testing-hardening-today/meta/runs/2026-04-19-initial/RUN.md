# Run: 2026-04-19-initial

**Status:** Closed
**Intent:** Fanout (Step 3 — initial research pass)
**Created:** 2026-04-19
**Closed:** 2026-04-19

## Outcome
- 4 parallel `/research --headless` sub-instances spawned, all succeeded (REPORT.md + ≥4 evidence files each).
- Consolidation via `/consolidate` (fork-session): 1321-line REPORT.md, 21 evidence files, CLAIMS.md inventory.
- Audit via `/audit`: 9 findings (2 High, 5 Medium, 2 Low); all accepted and applied.
- Zero fanout/ path leakage in consolidated report (verified).
- Zero recommendation language (stance honored).

## Parent Context

**Purpose:** What testing techniques and edge-case corpora should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs before the upcoming Rust migration locks in whatever we ship?

**Primary question:** What is the landscape of mutation testing, differential testing within the JS markdown-parser ecosystem, and historical edge-case corpora (BOM, CRLF, tabs, pathological inputs) applicable to a unified/remark-based TS md ⇄ PM pipeline today?

**Stance:** Factual/Landscape (not Conclusions) — layout of options with tradeoffs, not recommendations.

**Framing:** 3P (external findings) with Applicability callouts referencing the parent's established repo context (fast-check v4.6.0, bun test, `packages/app/tests/fidelity/` suite with 34 files / 4410 LOC, `bridge-observer-conversion.test.ts` from PR #213).

**Non-goals (inherited — sub-research must not drift here):**
- No analysis of the user's codebase in report bodies; external findings only
- No migration execution plan for the Rust bridge
- No Rust-specific pre-work (cargo-mutants, markdown-rs NAPI/WASM, JS↔Rust diff techniques) — these were explicitly dropped from the rubric
- No broader PBT tooling alternatives — fast-check is pinned
- No recommendations rankings; options + tradeoffs only

## Selected Follow-up Directions (clustered from 7 dimensions)

| # | Direction | Dimensions | Facet Count | Source Diversity | Assessment |
|---|---|---|---|---|---|
| 1 | Mutation testing for TS parser/serializer code | D1 | 5 (integration, operators, runtime, PBT interop, CI placement) | Multi (Stryker docs + adopter repos + blogs + GitHub issues) | Heavy |
| 2 | Differential testing within the JS markdown-parser ecosystem today | D2 | 4 (harness patterns, AST-diff techniques, community tools, common normalizations) | Multi (markdown-rs, comrak, markdown-it, unified ecosystem) | Heavy |
| 3 | Whitespace / line-ending / tab edge-case family | D3+D4+D5 | 6 (BOM in CommonMark, BOM in parsers, BOM+frontmatter, CRLF/LF handling, tab expansion, SKIP_SECTIONS root causes) | Multi (CommonMark spec + talk.commonmark.org + parser bug trackers + YAML parsers) | Heavy |
| 4 | Pathological inputs + concrete divergence snippets corpus | D6+D7 | 4 (CVEs/GHSAs, nesting/blowup issues, Babelmark3 divergence mining, snippet curation) | Multi (CVE databases, parser changelogs, Babelmark3, forum threads) | Heavy |

## Sub-instance Tracking

| Direction | Status | Report Path | Notes |
|---|---|---|---|
| mutation-testing-ts-parsers | completed | fanout/2026-04-19-initial/mutation-testing-ts-parsers/ | REPORT.md 39K + 5 evidence files |
| differential-testing-js-parsers | completed | fanout/2026-04-19-initial/differential-testing-js-parsers/ | REPORT.md 27K + 5 evidence files |
| whitespace-edge-cases-commonmark | completed | fanout/2026-04-19-initial/whitespace-edge-cases-commonmark/ | REPORT.md 23K + 4 evidence files, 28 test vectors |
| pathological-inputs-divergence-corpus | completed | fanout/2026-04-19-initial/pathological-inputs-divergence-corpus/ | REPORT.md 29K + 7 evidence files, divergence corpus |

## Fanout Directory

`/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-initial/`

## Depth Guard

CLAUDE_FANOUT_DEPTH was unset at Phase 1 → defaulted to 1. Children will run with CLAUDE_FANOUT_DEPTH=0, preventing further fanout. Children will fall back to deep-research mode (Step 3.2 subagents) if they try to fanout.
