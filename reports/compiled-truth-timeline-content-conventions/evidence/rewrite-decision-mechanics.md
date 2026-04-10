# Evidence: Rewrite Decision Mechanics (D2)

**Dimension:** How does the "rewrite" decision work? When does compiled truth get rewritten vs timeline appended?
**Date:** 2026-04-07
**Sources:** GBrain spec, Karpathy gist, ByteRover paper, NIE production cycle, Wikipedia editing model

---

## Key files / pages referenced

- GBrain `skills/ingest/SKILL.md` — decision tree for entity updates
- GBrain `skills/maintain/SKILL.md` — staleness detection pattern
- Karpathy gist — ingest workflow steps
- ByteRover Section 4.1.1 — five atomic write operations

---

## Findings

### Finding: GBrain uses a deterministic decision tree for rewrites
**Confidence:** CONFIRMED
**Evidence:** From GBrain spec:

```
For each entity mentioned:
- gbrain get <slug> — does a page exist?
- If yes: Read current compiled_truth. Rewrite State section. Append to timeline.
- If no: Create page using template.
```

Quality rules are explicit: "State section gets REWRITTEN, not appended to. Timeline is append-only, reverse-chronological (newest first)."

The maintain skill adds a staleness detection trigger: "Flag pages where the State section hasn't been updated but timeline has new entries."

**Implications:** Rewrite is triggered on every ingest (immediate) AND by periodic maintenance sweeps (deferred). Two trigger mechanisms, not one.

### Finding: Karpathy uses incremental integration, not full regeneration
**Confidence:** CONFIRMED
**Evidence:** From the gist: "Updating entity pages, revising topic summaries, noting where new data contradicts old claims, strengthening or challenging the evolving synthesis."

The LLM reads the existing index, identifies which wiki articles need updating or creation, and runs targeted updates. Not full regeneration.

### Finding: ByteRover offers five atomic write operations with mandatory reasons
**Confidence:** CONFIRMED
**Evidence:** ADD, UPDATE, UPSERT, MERGE, DELETE — each with a `reason` field as audit trail. The UPSERT operation "reduces pre-check overhead" and is preferred for idempotent writes. MERGE combines two entries intelligently and deletes the source.

### Finding: Intelligence community uses supersession, not rewriting
**Confidence:** CONFIRMED
**Evidence:** NIEs are not continuously updated. A new NIE supersedes the old one entirely. When urgent updates are needed before a full new estimate, a "Memorandum to Holders" provides interim corrections. Full production cycle: months to over a year.

### Finding: Wikipedia uses continuous rewriting with deliberation gates
**Confidence:** CONFIRMED
**Evidence:** Article text is perpetually rewritable. Uncontested sourced edits stand immediately. Contested edits go through talk-page deliberation. Edit history preserves every prior state. The compiled truth (article) is always a single living document, not versioned.

---

## Gaps / follow-ups

- No data on how frequently GBrain's maintain skill runs in practice
- Unknown whether any system uses automated semantic diff to decide "is this change significant enough to trigger recompilation?"
