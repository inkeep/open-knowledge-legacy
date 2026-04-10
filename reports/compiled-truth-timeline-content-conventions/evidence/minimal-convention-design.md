# Evidence: Minimal Convention Design (D6)

**Dimension:** What should the minimal convention for agent-authored knowledge entries look like?
**Date:** 2026-04-07
**Sources:** Cross-system synthesis from D1-D5 evidence

---

## Findings

### Finding: Three structural models exist, with different tradeoffs
**Confidence:** CONFIRMED
**Evidence:**

**Model A — Single-file, horizontal-rule separator (GBrain)**
- Compiled truth above `---`, timeline below
- Simplest to implement, grep-friendly, git-diffable
- Weakness: compiled truth and timeline in same file means large diffs on rewrite

**Model B — Directory separation (Karpathy)**
- `wiki/` for compiled truth, `raw/` for sources, `log.md` for timeline
- Cleanest separation, sources are immutable files
- Weakness: cross-referencing requires following links across directory structure

**Model C — Structured sections within entry (ByteRover)**
- `## Relations`, `## Raw Concept`, `## Narrative`, `## Snippets` within one file
- Richest metadata per entry
- Weakness: complex schema, high learning curve for skill authors

### Finding: For markdown+git knowledge systems, Model A with structured sections is optimal
**Confidence:** INFERRED
**Evidence:** Model A preserves the "one file = one knowledge entry" invariant that makes grep, git log, and MCP tools simple. The horizontal-rule separator is universally understood in markdown. Adding structured sections within the compiled truth zone (headers like `## Summary`, `## Assessment`, `## Open Questions`) provides the benefits of Model C without the full complexity. The timeline section below the rule uses a simple append format.

### Finding: Five metadata fields are the minimum viable set
**Confidence:** INFERRED
**Evidence:** Cross-referencing all systems (D4 evidence), the fields that appear in 3+ systems and serve distinct purposes:

1. **date** (ISO 8601) — when the event occurred
2. **source** — provenance identifier (URL, meeting ID, file path)
3. **author** — which agent or human wrote this entry
4. **type** — entry classification (observation, correction, retraction)
5. **confidence** — epistemic state (high/medium/low or confirmed/inferred/uncertain)

### Finding: The rewrite rule must be explicit and unambiguous
**Confidence:** INFERRED
**Evidence:** GBrain's quality rules are the clearest model: "State section gets REWRITTEN, not appended to. Timeline is append-only, reverse-chronological (newest first)." The rule must be stated in the convention so skill authors don't need to infer behavior.

### Finding: Compiled truth must carry compilation metadata
**Confidence:** INFERRED
**Evidence:** To detect staleness and enable audit, compiled truth should carry: `last_compiled` timestamp, `compiled_by` agent identifier, and either a sequence number or hash linking to the most recent timeline entry incorporated. GBrain's maintain skill uses this pattern for staleness detection.

---

## Gaps / follow-ups

- No production evidence for how well the single-file model works at >1000 entries
- Timeline compaction strategy (archival, snapshots) is not well-tested in any markdown+git system
