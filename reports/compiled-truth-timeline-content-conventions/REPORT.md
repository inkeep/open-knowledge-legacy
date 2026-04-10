---
title: "Compiled Truth + Timeline: Content Conventions for Agent-Authored Knowledge Entries"
description: "Investigates the two-zone content pattern where each knowledge entry splits into a rewritable current assessment (compiled truth) above a horizontal rule and an append-only evidence base (timeline) below it. Maps prior art across six domains, analyzes rewrite mechanics, merge strategies, failure modes, and proposes a minimal convention for agent-native knowledge platforms."
createdAt: 2026-04-07
updatedAt: 2026-04-07
subjects:
  - GBrain
  - ByteRover
  - Andrej Karpathy
  - Zettelkasten
  - Wikipedia
  - Intelligence Community
  - Letta
  - Mem0
topics:
  - knowledge entry conventions
  - compiled truth
  - agent-authored knowledge
  - append-only timeline
  - knowledge compilation
  - provenance tracking
---

# Compiled Truth + Timeline: Content Conventions for Agent-Authored Knowledge Entries

**Purpose:** Map the prior art, mechanics, failure modes, and design space of the "compiled truth + timeline" content convention — where each knowledge entry splits its body into a rewritable current assessment above a separator and an append-only evidence base below it — and produce a concrete minimal convention for agent-native knowledge platforms using markdown+git.

---

## Executive Summary

The "compiled truth + timeline" pattern — splitting each knowledge entry into a rewritable current assessment and an append-only evidence base — is not a novel invention. It is a convergent solution that has been independently discovered in at least six domains: intelligence analysis (75+ years), academic note-taking (Zettelkasten, 1950s), collaborative encyclopedias (Wikipedia, 2001), personal knowledge management (Karpathy llm-wiki, 2026), agent memory systems (ByteRover, 2026), and structured personal CRMs (GBrain, 2026). The structural logic is identical across all of them: the compiled zone is rewritten to reflect current best understanding; the evidence zone is append-only and never deleted. Metadata bridges the two.

The pattern solves a fundamental tension in knowledge systems: **overwrite loses provenance; append loses coherence.** By splitting the entry, each zone optimizes for its purpose — the compiled truth for readability and current-state queries, the timeline for auditability and historical context.

**Key Findings:**

- **Convergent discovery across six domains.** GBrain, Karpathy, ByteRover, NIEs, Wikipedia, and Zettelkasten all implement the same structural pattern despite having no shared lineage. The pattern is a natural attractor for any system that must maintain both current understanding and historical evidence.
- **The rewrite decision has two triggers.** Immediate (on ingest: new evidence triggers recompilation of relevant sections) and deferred (on maintenance: periodic sweeps detect staleness when timeline has advanced beyond compiled truth). Both are needed; neither alone is sufficient.
- **Multi-agent merge is unsolved in practice.** No production system implements true concurrent compilation merge. All surveyed systems serialize writes (GBrain via SQLite WAL, ByteRover via task queue). For markdown+git systems, optimistic locking with version-based CAS is the pragmatic approach.
- **Five metadata fields are the minimum viable set.** Date, source, author, type, and confidence appear in 3+ systems and serve distinct, non-redundant purposes. Adding more creates skill-author friction without proportional value.
- **The canonical failure mode is decoupling.** Across all six domains, the critical failure is the compiled truth becoming disconnected from its evidence base — through time pressure, format constraints, hidden synthesis, or stale references. Every mitigation strategy ultimately addresses this single failure.
- **A concrete minimal convention is feasible.** A single-file format with horizontal-rule separator, structured compiled-truth headers, and a simple timeline entry format can serve as the convention for agent-authored entries in markdown+git knowledge systems.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Prior art landscape | Deep | P0 |
| D2 | Rewrite decision mechanics | Deep | P0 |
| D3 | Multi-agent concurrent update | Moderate | P1 |
| D4 | Timeline metadata schema | Moderate | P0 |
| D5 | Failure modes | Deep | P0 |
| D6 | Minimal convention design | Deep | P0 |

**Stance:** Conclusions — this report includes a concrete convention recommendation.

---

## Detailed Findings

### D1: Prior Art Landscape — Who Uses This Pattern?

**Finding:** Six independent domains converge on the same two-zone structural pattern, differing only in naming and implementation details.

**Evidence:** [evidence/prior-art-landscape.md](evidence/prior-art-landscape.md)

The following table maps each system to the pattern:

| System | Compiled Zone | Evidence Zone | Update Model |
|--------|--------------|---------------|--------------|
| [GBrain](https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb) (Garry Tan, 2026) | `compiled_truth` column, above `---` in markdown | `timeline` column, below `---`, append-only reverse-chronological | Rewrite on ingest + periodic maintenance |
| [Karpathy llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (2026) | `wiki/` directory — entity pages, concept pages, summaries | `raw/` directory (immutable sources) + `log.md` (append-only operations log) | Incremental integration on ingest |
| [ByteRover](https://arxiv.org/abs/2604.01599) (2026) | Narrative section (V_i) — interpreted structure, dependencies, rules | Raw Concept section (C_i) — task, changes, sources, timestamp, author | Five atomic operations (ADD/UPDATE/UPSERT/MERGE/DELETE), each with mandatory `reason` |
| NIE (intelligence community, 1950s–present) | Key Judgments — declarative conclusions with confidence levels | Body text, appendices, source footnotes | Supersession (new estimate replaces old) or Memorandum to Holders |
| Wikipedia (2001–present) | Article text — governed by NPOV, Verifiability, NOR | Talk page (deliberation) + edit history (provenance) | Continuous rewriting with deliberation gates |
| Zettelkasten (Luhmann, 1950s) | Permanent notes — ideas reformulated in own words | Bibliographic box — page-indexed source references | New note + forward link (never rewrite, never delete) |

**Three additional agent memory systems implement partial versions of the pattern:**

- **[Letta](https://docs.letta.com/guides/agents/memory/) (formerly MemGPT):** Core memory blocks (compiled, agent-rewritable) + Recall memory (full conversation history, raw). MemFS adds git versioning as provenance. The clearest compiled+evidence split in production agent memory.
- **[A-MEM](https://arxiv.org/abs/2502.12110) (NeurIPS 2025):** Raw content and compiled metadata coexist in the same record. Unique feature: retroactive recompilation — new memories trigger re-annotation of existing memories' contextual attributes.
- **[AWS AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html):** Session event stream (evidence) → extraction pipeline → memory records (compiled). The clearest enterprise implementation of the pattern.

Most production agent memory systems (Claude Code MEMORY.md, Cursor rules, Mem0, LangGraph/LangMem) **discard raw evidence** after extraction, maintaining only compiled truth. This is a deliberate tradeoff of provenance for efficiency.

**Implications:** The pattern's convergent discovery across unrelated domains — from Cold War intelligence to 2026 AI agents — suggests it is a structural invariant of maintained knowledge, not a design choice that could equally well go the other way.

**Decision trigger:** If a knowledge system needs both queryability (current state) and auditability (how did we get here?), this pattern or an isomorphic variant is effectively mandatory.

---

### D2: Rewrite Decision Mechanics — When Does Compiled Truth Get Rewritten?

**Finding:** Two distinct trigger mechanisms exist across systems, and both are needed.

**Evidence:** [evidence/rewrite-decision-mechanics.md](evidence/rewrite-decision-mechanics.md)

**Trigger 1 — Immediate (on ingest):** When new evidence arrives, the skill that processes it immediately rewrites the relevant sections of compiled truth. This is GBrain's primary model ("State section gets REWRITTEN, not appended to") and Karpathy's model ("updating entity pages, revising topic summaries"). The agent reads existing compiled truth, reads the new evidence, and synthesizes a new version incorporating both.

**Trigger 2 — Deferred (on maintenance):** A periodic sweep detects entries where the timeline has advanced beyond the compiled truth. GBrain's maintain skill: "Flag pages where the State section hasn't been updated but timeline has new entries." This catches cases where ingest updated the timeline but didn't trigger a compiled-truth rewrite — either because the ingest skill judged the change too minor, or because the entry was only tangentially affected.

**The relationship between triggers is complementary, not redundant:**

| Trigger | Catches | Misses |
|---------|---------|--------|
| Immediate | Direct impacts of new evidence on affected entries | Indirect effects (entry B becomes stale because entry A was updated) |
| Deferred | Indirect staleness, accumulated minor changes | Nothing (but runs less frequently, so staleness window exists) |

**ByteRover adds a third mechanism — maturity-based decay.** Entries have an importance score that decays automatically (0.995^dt per day). An entry that hasn't been accessed or updated loses salience and eventually demotes from `core` → `validated` → `draft`. This doesn't rewrite the compiled truth but signals to consumers that it may be stale.

**What none of these systems do:** Automated semantic diff to assess "is this new evidence significant enough to warrant recompilation?" All surveyed systems either recompile on every relevant ingest (GBrain, Karpathy) or rely on metadata heuristics (ByteRover's AKL, GBrain's maintain). The semantic significance judgment is delegated to the LLM during compilation, not pre-filtered.

**Remaining uncertainty:** No quantitative data exists on optimal recompilation frequency. Too frequent wastes tokens; too infrequent produces stale compiled truth. The right cadence likely depends on the domain's rate of change.

---

### D3: Multi-Agent Concurrent Update

**Finding:** No production system implements true concurrent compilation merge. All serialize writes.

**Evidence:** [evidence/concurrent-update-merge.md](evidence/concurrent-update-merge.md)

| System | Concurrency Model | Merge Strategy |
|--------|-------------------|----------------|
| GBrain | SQLite WAL (concurrent reads, serialized writes) | Last-writer-wins, contradiction detection via maintain skill |
| ByteRover | Sequential deduplicated task queue | Serialized — concurrent writes are queued |
| Wikipedia | Optimistic conflict detection (edit conflict on save) | Human resolution via talk page |
| Karpathy | Single-agent (no concurrency) | N/A |

**For markdown+git systems, four merge strategies are available, with increasing complexity:**

1. **Serialized writes (simplest).** One agent compiles at a time. Use a lock file or advisory lock. Sufficient for single-user systems with 1-3 agent instances.

2. **Optimistic locking (CAS).** Compiled truth carries a version number. Writer reads version N, synthesizes, writes only if version is still N. On conflict, retry with fresh data. Best for infrequent compilation with occasional concurrency.

3. **Section-level three-way merge.** Compiled truth is structured into independent sections (headers). Two agents rewriting different sections can be auto-merged. Same-section conflicts require resolution. Requires compiled truth to be genuinely decomposable into independent sections.

4. **CRDT-based metadata merge.** Use CRDTs for compiled-truth metadata (version vectors, staleness flags, claim confidence scores) while serializing prose content rewrites. Best suited as a complement to strategies 1-3, not a standalone solution.

**Recommendation for markdown+git systems:** Start with strategy 1 (serialized writes). If concurrency becomes a bottleneck, upgrade to strategy 2 (CAS). Strategy 3 is only needed for multi-agent teams with frequent concurrent compilation.

---

### D4: Timeline Metadata Schema

**Finding:** Five metadata fields are the minimum viable set across all surveyed systems.

**Evidence:** [evidence/timeline-metadata-schema.md](evidence/timeline-metadata-schema.md)

Cross-referencing all systems, the fields that appear in 3+ independent implementations and serve distinct, non-redundant purposes:

| Field | Present In | Purpose |
|-------|-----------|---------|
| **date** (ISO 8601) | All systems | When the event occurred or was observed |
| **source** | GBrain, ByteRover, Karpathy, IC, Wikipedia | Provenance — where this information came from (URL, meeting ID, file path, citation) |
| **author** | ByteRover, IC, Wikipedia, event sourcing | Attribution — which agent or human wrote this entry |
| **type** | Karpathy, event sourcing, changelog | Classification — what kind of entry (observation, correction, retraction, reframe) |
| **confidence** | ByteRover, Karpathy, IC | Epistemic state — how certain is this evidence (high/medium/low or confirmed/inferred/uncertain) |

**Fields considered and excluded from the minimum set:**

- **Sequence number:** Useful for staleness detection but can be derived from file position in an append-only log. Include if the system needs random-access to timeline entries.
- **Importance/salience score:** ByteRover's AKL assigns 0-100 importance with automatic decay. Valuable but adds complexity; defer to maintenance skills rather than baking into the entry format.
- **Compiled-into version:** Tracks which compiled-truth version incorporated this entry. Enables orphan detection. High value but no production system implements it yet — include in the convention as optional.

**GBrain's timeline entry format** is the most practical for markdown:

```markdown
- **2026-04-07** | meeting/standup | @compile-skill — Observed that deployment cadence changed from weekly to daily. Confidence: high.
```

Structure: `- **date** | source | @author — Summary. Confidence: level.`

This is parseable by regex, human-readable, and git-diffable.

---

### D5: Failure Modes

**Finding:** Eight failure modes identified, all traceable to one root cause — compiled truth decoupling from its evidence base.

**Evidence:** [evidence/failure-modes.md](evidence/failure-modes.md)

| # | Failure Mode | Root Cause | Severity | Mitigation |
|---|-------------|-----------|----------|------------|
| 1 | **Stale compiled truth** | Timeline advances, compiled truth not recompiled | High | Staleness flag (`compiled_truth_dirty`), deferred maintenance sweep |
| 2 | **Lost nuance in rewrites** | LLM compresses during rewrite, drops caveats | High | Structured compiled-truth schema with explicit `open_questions` and `confidence` fields |
| 3 | **Unbounded timeline growth** | Append-only by design, no compaction | Medium | Tiered archival (hot/warm/cold), snapshot events |
| 4 | **Conflicting rewrites** | Two agents rewrite simultaneously | Medium | Serialized writes or optimistic locking (CAS) |
| 5 | **Circular compilation** | Compiled truth used as input to its own recompilation | High | Rule: compile only from timeline entries, never from prior compiled truth as evidence |
| 6 | **Hallucination amplification** | Error in compiled truth reinforced through subsequent compilations | High | Confidence metadata preserved through compilations; contradiction detection |
| 7 | **Over-confident summaries** | Epistemic qualifiers stripped in compilation | Medium | Require explicit confidence field; penalize certainty inflation in compilation prompts |
| 8 | **Orphaned timelines** | Major rewrite disconnects historical entries | Low | `reframe` event type; tag entries with compiled-truth version |

**The canonical failure — decoupling — manifests differently across domains:**

- **NIEs:** Time pressure compresses production cycle, bypassing interagency rigor (2002 Iraq WMD)
- **PDB:** "Overtaken by events" — items obsolete before they're read; oral briefing dependency
- **Wikipedia:** Hidden SYNTH — sources combined to imply unstated conclusions
- **Zettelkasten:** Stale chains — old permanent notes with superseded conclusions persist alongside current ones
- **GBrain:** Compiled truth references dates >6 months old without newer timeline evidence

**The event sourcing analogy provides the clearest mitigation framework:** Treat compiled truth as a materialized view (disposable, rebuildable from events). Treat the timeline as the event store (authoritative, immutable). If the compiled truth ever becomes suspect, rebuild it from the timeline. This requires maintaining the ability to recompile from scratch even when incremental compilation is the default.

**Decision triggers:**
- If entries are expected to live >6 months: staleness detection (failure #1) is critical
- If multiple agents compile: serialized writes or CAS (failure #4) is required from day one
- If the system is used for high-stakes decisions: circular compilation prevention (failure #5) and confidence preservation (failures #6, #7) are non-negotiable

---

### D6: Minimal Convention — Concrete Recommendation

**Finding:** A single-file format with horizontal-rule separator, structured compiled-truth headers, and a simple timeline entry format is the optimal convention for agent-authored entries in markdown+git knowledge systems.

**Evidence:** [evidence/minimal-convention-design.md](evidence/minimal-convention-design.md)

Three structural models were evaluated:

| Model | Structure | Strengths | Weaknesses |
|-------|-----------|-----------|------------|
| A — Single-file separator (GBrain) | One .md file, `---` divides compiled/timeline | Simple, grep-friendly, one file = one entry | Large diffs on rewrite; compiled truth and timeline grow in same file |
| B — Directory separation (Karpathy) | `wiki/` for compiled, `raw/` for sources, `log.md` for timeline | Cleanest separation, immutable sources | Cross-referencing requires following links; log.md is global not per-entry |
| C — Structured sections (ByteRover) | Multiple `##` sections within one file | Richest metadata per entry | Complex schema, high learning curve for skill authors |

**Recommendation: Model A with structured compiled-truth headers.**

This preserves the "one file = one knowledge entry" invariant that makes grep, git log, and MCP tools simple. The horizontal-rule separator is universally understood. Structured headers within the compiled truth zone provide the benefits of Model C's expressiveness without its full complexity.

#### The Minimal Convention

**File format:**

```markdown
---
title: "[Entry Title]"
type: "[person|company|concept|source|project|...]"
tags: [tag1, tag2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
compiled_by: "[agent-id]"
compiled_at: YYYY-MM-DDTHH:MM:SSZ
---

# [Entry Title]

> [One-paragraph executive summary — the "Key Judgment."
> Updated on every compilation. Readers who read only this
> should get the current bottom line.]

## State

[Current factual state. Rewritten on every compilation.
Structured claims, not flowing prose. Each claim should
be traceable to a timeline entry.]

## Assessment

[Analytical interpretation of the state. What it means,
what's changing, what to watch. Rewritten on compilation.
Include confidence level for each major assessment.]

## Open Questions

[Unresolved items. Added when questions arise, removed
when resolved (with resolution noted in timeline).
Actively maintained — not a graveyard.]

---

## Timeline

- **YYYY-MM-DD** | source | @author — Summary. Confidence: level.
  Detail paragraph if needed, indented under the entry.

- **YYYY-MM-DD** | source | @author — Summary. Confidence: level.
```

**Compilation rules (for skill authors):**

1. **Compiled truth (above the line) is always rewritten, never appended to.** When new evidence arrives, the skill reads the full timeline, re-synthesizes the compiled truth, and writes a complete replacement. The compiled truth reflects ALL timeline evidence, not just the latest entry.

2. **Timeline (below the line) is always appended to, never rewritten.** New entries go at the top (reverse-chronological, newest first). Existing entries are immutable. Corrections to past entries are new timeline entries of type `correction`.

3. **The horizontal rule (`---`) is the separator.** The first `---` after frontmatter closes the YAML block. The second `---` (on its own line, preceded and followed by blank lines) separates compiled truth from timeline.

4. **Compile from timeline, not from prior compiled truth.** The compiled truth is a derived artifact. When recompiling, read the timeline entries as the source of truth. Use prior compiled truth as a structural hint (section layout, established claims), but verify every claim against timeline evidence. This prevents circular compilation.

5. **Preserve epistemic state through compilations.** A claim supported by low-confidence evidence must remain low-confidence in compiled truth. Confidence can only be upgraded by new timeline evidence, never by re-summarization.

6. **Timeline entries must carry five metadata fields:** date (ISO 8601), source (provenance identifier), author (`@agent-id` or `@human`), type (implicit in the summary or explicit prefix), confidence (high/medium/low).

7. **Special timeline entry types exist:**
   - `correction` — Corrects a prior entry. References the corrected entry's date.
   - `retraction` — Retracts a prior entry. The corrected/retracted claim should be removed from compiled truth on next compilation.
   - `reframe` — Signals a major conceptual shift. Entries before this point used a different framing. Prevents orphaned-timeline confusion.

**Staleness detection (for maintenance skills):**

A compiled truth is **stale** when timeline entries exist with dates after `compiled_at` in the frontmatter. Maintenance skills should flag entries where `compiled_at` is more than N days behind the most recent timeline entry. The threshold N depends on the domain's rate of change — daily for fast-moving topics, weekly or monthly for stable reference.

**MCP tool implications:**

The convention implies two write operations for entry updates:
- `write_entry(slug, compiled_truth, timeline_append)` — analogous to GBrain's `brain_put` with separate parameters for each zone
- `append_timeline(slug, entry)` — append-only operation on the timeline zone without touching compiled truth

The MCP read operation should return both zones, with optional filtering (`compiled_only=true` for agents that just need current state).

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Scale behavior (>10K entries):** No system in the survey operates the single-file model at this scale. GBrain uses SQLite (handles tens of thousands). Karpathy's wiki is ~100 articles. The convention may need adaptation for very large knowledge bases — possibly splitting timeline into a separate file when it exceeds a size threshold.
- **Timeline compaction:** No markdown+git system has tested timeline archival (moving old entries to cold storage). Event sourcing's snapshot pattern is well-proven but not yet adapted to markdown files.
- **Automated semantic diff:** No system evaluates "is this new evidence significant enough to warrant recompilation?" All rely on heuristics (any new evidence = recompile) or metadata signals (staleness flags). Automated significance assessment remains an open research problem.

### Out of Scope (per Rubric)

- Implementation code (MCP tool signatures, CRDT integration specifics)
- Storage backend comparison (SQLite vs markdown vs database)
- Agent memory systems (Mem0, Zep, Letta) as experiential memory — these were surveyed for structural patterns only, not evaluated as alternatives
- Permission and access control for entries

---

## References

### Evidence Files
- [evidence/prior-art-landscape.md](evidence/prior-art-landscape.md) — Six-domain survey of the compiled truth + timeline pattern
- [evidence/rewrite-decision-mechanics.md](evidence/rewrite-decision-mechanics.md) — How and when rewrite decisions are triggered
- [evidence/concurrent-update-merge.md](evidence/concurrent-update-merge.md) — Merge strategies for concurrent compilation
- [evidence/timeline-metadata-schema.md](evidence/timeline-metadata-schema.md) — Cross-system metadata comparison and minimum viable set
- [evidence/failure-modes.md](evidence/failure-modes.md) — Eight failure modes with mitigations
- [evidence/minimal-convention-design.md](evidence/minimal-convention-design.md) — Three structural models evaluated

### External Sources
- [GBrain Spec — Garry Tan](https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb) — Personal CRM with compiled truth + timeline architecture on SQLite
- [llm-wiki — Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — LLM Knowledge Base pattern: raw/ + wiki/ + log.md
- [ByteRover (arXiv:2604.01599)](https://arxiv.org/abs/2604.01599) — Agent-native memory through LLM-curated hierarchical context
- [A-MEM (arXiv:2502.12110)](https://arxiv.org/abs/2502.12110) — Zettelkasten-inspired memory with retroactive recompilation (NeurIPS 2025)
- [Memory in the Age of AI Agents (arXiv:2512.13564)](https://arxiv.org/abs/2512.13564) — Comprehensive agent memory taxonomy survey
- [ICD 203: Analytic Standards](https://www.dni.gov/files/documents/ICD/ICD-203.pdf) — Intelligence community standards for confidence levels and sourcing
- [Letta Memory Architecture](https://docs.letta.com/guides/agents/memory/) — Core/Recall/Archival three-tier agent memory
- [Mem0 Research Paper (arXiv:2504.19413)](https://arxiv.org/abs/2504.19413) — ADD/UPDATE/DELETE/NOOP memory consolidation
- [AWS AgentCore Memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html) — Session events → extraction → memory records pipeline
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — Append-only changelog conventions
- [Azure: Event Sourcing Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) — Materialized view as compiled truth analog
- [Zettelkasten Introduction](https://zettelkasten.de/introduction/) — Permanent notes vs literature notes methodology
- [Wikipedia: No Original Research](https://en.wikipedia.org/wiki/Wikipedia:No_original_research) — Compiled truth governance policy

---

## Implications for Open-Knowledge

*This section is clearly separated from the 3P research above. It contains observations about how the findings could apply to the open-knowledge project specifically.*

1. **The convention in D6 maps directly to PQ13 (smart conventions) and PQ14 (reference skills).** The compiled truth + timeline format is the content convention that ingest, compile, and lint skills would operate on. The file format in D6 can be adopted as-is for open-knowledge entries.

2. **The two MCP write operations (`write_entry` with separate compiled/timeline parameters, `append_timeline` for timeline-only writes) align with XQ1's MCP interface design.** Whether using Approach A (semantic tools) or Approach B (just-bash), the convention needs to be expressible through the chosen interface.

3. **The permission model (PQ7, PQ9) intersects with compilation rules.** A compile skill needs `maintainer` permission on an entry to rewrite compiled truth but only `editor` to append to the timeline. This maps naturally to the Zanzibar model.

4. **Staleness detection aligns with the lint skill (PQ14).** The lint skill should check `compiled_at` vs most recent timeline date and flag stale entries.

5. **The circular compilation rule (D5, failure #5) should be enforced by the compile skill's SKILL.md, not by the platform.** The platform provides the format; the skill provides the discipline.

6. **Timeline entries ARE git commits, conceptually.** The auto-persistence pipeline (TQ8) already creates WIP refs and auto-commits. Timeline entries could be correlated with git commits for additional provenance, but the timeline in the file is the canonical record (git history is an implementation detail).
