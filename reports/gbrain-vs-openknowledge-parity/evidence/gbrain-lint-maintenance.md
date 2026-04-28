# Evidence: GBrain Lint & Maintenance (D9)

**Dimension:** D9 — Lint / maintenance parity
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README — `lint`, `orphans`, `check-backlinks`, `doctor` sections; `maintain` skill description; prior `reports/knowledge-linting-karpathy-workflow/REPORT.md`

---

## Findings

### Finding: GBrain ships ~13 enforceable maintenance/lint surfaces
**Confidence:** CONFIRMED
**Evidence:** README enumeration:

| Surface | CLI | Trigger / Output |
|---|---|---|
| Citation audit | (skill: citation-fixer) | Detects missing/malformed citations; auto-fixes format |
| Back-link enforcement | `gbrain check-backlinks check\|fix` | Asserts that linked-to pages link back where bidirectional |
| Orphan detection | `gbrain orphans [--json] [--count]` | Pages with zero inbound wikilinks |
| LLM artifact detection | `gbrain lint [--fix]` | Catches "as an AI", "I cannot", boilerplate |
| Stale page detection | (skill: maintain) | Pages not updated past freshness threshold |
| Dead link detection | (skill: maintain) | Internal + external dead links |
| Resolver conformance | `gbrain check-resolvable [--strict]` | Reachability, MECE, DRY, routing gaps, filing audit, SKILLIFY_STUB sentinels |
| Routing accuracy | `gbrain routing-eval [--llm] [--json]` | Intent→skill routing on fixtures |
| Skill audit | `gbrain skillify check [path]` | 10-item: SKILL.md, script, tests, evals, resolver, trigger eval, filing |
| Skill manifest coverage | (skill: testing) | Validates every skill has SKILL.md w/ frontmatter, manifest coverage |
| Health checks | `gbrain doctor [--json] [--fast]` | Resolver, skills, DB, embeddings; auto-fix with `--fix` |
| Skillpack health | `gbrain skillpack-check --quiet` | Exit 0/1/2 for pipeline gating |
| Smoke tests | `gbrain jobs smoke` | 8 post-restart checks with auto-fix |

**Implications:**
- This is **dramatically more comprehensive** than OK's current lint coverage.
- OK has `get_dead_links` and `get_orphans` MCP tools (matching dead-link + orphan detection). OK's `consolidate` tool overlaps loosely with citation fixing but isn't structured as a lint check.
- **Critical missing surfaces in OK:**
  - `lint --fix` for LLM artifacts (boilerplate detection)
  - Stale-page detection (no freshness gate)
  - Resolver conformance (no resolver concept)
  - Skill audit (no skill testing infrastructure)
  - System doctor (no health command)

### Finding: 17-check lint taxonomy (cross-survey, prior research)
**Confidence:** CONFIRMED (from prior research)
**Evidence:** `reports/knowledge-linting-karpathy-workflow/REPORT.md`:

> "Across Karpathy (6 checks), GBrain (8 checks), ByteRover (AKL decay), and 5+ community implementations, a 17-check taxonomy emerges. ~41% are mechanically detectable today; ~29% are pure LLM-judgment; ~29% are hybrid (deterministic prefilter + LLM final call)."

The 17-check enumeration (from same report):

| # | Check | Source projects | Class |
|---|---|---|---|
| 1 | Contradictions between pages | Karpathy + GBrain | LLM-only |
| 2 | Stale claims (newer source supersedes) | Karpathy + GBrain | Hybrid |
| 3 | Orphan pages (no inbound links) | Karpathy + GBrain | Deterministic |
| 4 | Redlinks (concepts without pages) | Karpathy + GBrain | Deterministic |
| 5 | Missing cross-references | Karpathy + GBrain | Hybrid |
| 6 | Data gaps / unanswered questions | Karpathy + GBrain | LLM-only |
| 7 | Dead links (internal + external) | GBrain + community | Deterministic |
| 8 | Tag consistency | GBrain | Deterministic |
| 9 | Embedding freshness | GBrain | Deterministic |
| 10 | Source traceability (page→raw/) | kytmanov | Deterministic |
| 11 | Index ↔ content drift | Spisak, Karpathy implicit | Deterministic |
| 12 | Compiled-truth ↔ timeline coupling | GBrain, ByteRover | Hybrid |
| 13 | Lost-nuance regression | this repo's prior research | LLM-only |
| 14 | Hallucination amplification | this repo's prior research | LLM-only |
| 15 | Over-confident summaries | this repo's prior research | LLM-only |
| (16+17 — additional, not enumerated above) | — | — | — |

**Implications:** OK already has the **17-check taxonomy as a research deliverable**. Implementation status:
- Deterministic checks (~41%) — orphans + dead-links shipped; redlinks, embedding freshness, index-drift, source traceability, tag consistency NOT shipped.
- Hybrid checks (~29%) — stale-claim and missing cross-references would need both freshness data + LLM call. NOT shipped.
- LLM-only checks (~29%) — contradictions, data-gaps, lost-nuance, hallucination, over-confident summaries. NOT shipped (would require batch LLM passes via dream cycle).

**Parity gap is bounded and concrete.** The taxonomy already exists in OK's research. The shipping work is real but not architecturally novel.

### Finding: GBrain `maintain` skill structures the maintenance workflow
**Confidence:** CONFIRMED
**Evidence:** README skills enumeration: "`maintain` — Periodic health: stale pages, orphans, dead links, citation audit, back-link enforcement, tag consistency".

Original spec gist (2026-04-05): "8 lint checks — contradictions, stale info, orphan pages, missing cross-references, dead links, open thread audit, tag consistency, embedding freshness. Outputs a maintenance report as a new page."

**Implications:**
- The `maintain` skill **outputs a maintenance report as a brain page** — meta-knowledge. The KB itself documents its health state, which becomes searchable.
- OK should ship a `maintain` reference skill that:
  1. Runs each lint check (using existing MCP tools where they exist; CLI/skill where they don't).
  2. Outputs a maintenance report page (e.g., `reports/maintenance/YYYY-MM-DD.md`).
  3. Can be triggered by `dream` or by hand.

---

## Negative searches

- Searched README for explicit "embedding freshness" implementation → mentioned in lint list but not detailed (likely `gbrain embed --stale` is the operational primitive).
- Searched for "redlinks" check in shipped state → NOT FOUND in README. Spec mentioned it; not confirmed shipped.

---

## Gaps / follow-ups

- The full enumerated GBrain `maintain` skill checklist (the actual SKILL.md content) not fetched — would clarify whether all 8 spec'd checks shipped.
- Whether `lint --fix` does anything beyond LLM-artifact detection (e.g., normalize headings, strip trailing whitespace) is unspecified.
