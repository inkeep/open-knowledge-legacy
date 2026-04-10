# Evidence: Timeline Metadata Schema (D4)

**Dimension:** What metadata should timeline entries carry?
**Date:** 2026-04-07
**Sources:** GBrain spec, ByteRover paper, Karpathy gist, ICD 203, Keep a Changelog, event sourcing literature

---

## Findings

### Finding: GBrain defines the most explicit timeline entry schema
**Confidence:** CONFIRMED
**Evidence:** GBrain timeline entries in markdown:

```markdown
- **YYYY-MM-DD** | source — Summary text. Detail continues here.
```

Parsed by regex: `/^- \*\*(\d{4}-\d{2}-\d{2})\*\*\s*\|\s*([^—]+)—\s*(.+)$/gm`

Structured `timeline_entries` table fields:
| Field | Type | Description |
|-------|------|-------------|
| date | TEXT (ISO 8601) | Date of the event |
| source | TEXT | Provenance: "meeting", "email", "manual" |
| summary | TEXT | One-line summary |
| detail | TEXT | Full markdown detail |
| created_at | TEXT (ISO 8601) | When written to DB |

Dual representation: markdown timeline column is source of truth for round-trip export; structured table provides query access.

### Finding: ByteRover uses the richest metadata per entry
**Confidence:** CONFIRMED
**Evidence:** ByteRover Raw Concept section contains: task context, changes made, source files, timestamp, author identifier. YAML frontmatter adds: importance score (0-100), maturity tier (draft/validated/core), recency decay value, access count, update count, creation/update timestamps. The Adaptive Knowledge Lifecycle (AKL) tracks: importance += 3 per access, += 5 per update, daily decay *= 0.995^dt.

### Finding: Karpathy uses minimal metadata — date, operation type, subject
**Confidence:** CONFIRMED
**Evidence:** Log entry format: `## [YYYY-MM-DD] ingest | Article Title`. Three-part structure: date, operation verb (ingest/query/lint), subject. Parseable with grep. YAML frontmatter on wiki pages adds: sources (list of raw/ files), related (wikilinks), confidence (high/medium/low), last_compiled date.

### Finding: Intelligence community requires confidence levels and source quality per judgment
**Confidence:** CONFIRMED
**Evidence:** ICD 203 mandates: confidence level (High/Moderate/Low) per Key Judgment, source summary statements describing collection strengths/weaknesses, explicit separation of intelligence vs assumptions vs judgments.

### Finding: Event sourcing and changelog patterns provide additional metadata conventions
**Confidence:** CONFIRMED
**Evidence:** Event sourcing: monotonically increasing sequence number, event type, timestamp, aggregate ID. Keep a Changelog: version anchor, entry type (Added/Changed/Deprecated/Removed/Fixed/Security), date. Common Changelog adds: author attribution, external ticket references.

### Finding: Cross-system metadata consensus converges on five fields
**Confidence:** INFERRED
**Evidence:** Across all systems surveyed, the metadata that appears in 3+ systems:
1. **Date/timestamp** — universal (all systems)
2. **Source/provenance** — GBrain, ByteRover, Karpathy, IC, Wikipedia
3. **Author/agent** — ByteRover, IC, Wikipedia, event sourcing
4. **Confidence/maturity** — GBrain (implicit), ByteRover, Karpathy, IC
5. **Entry type/operation** — Karpathy, event sourcing, changelog

---

## Gaps / follow-ups

- No system tracks "which compiled truth version this entry was incorporated into" — this would enable orphan detection
