---
name: prior-research-pointer
description: Pointer to the existing landscape research report on frontmatter editing UX patterns; consolidates which findings flow into this spec and which are out of scope for MVP.
type: spec-evidence
sources:
  - reports/frontmatter-editing-ux-patterns/REPORT.md
  - reports/frontmatter-editing-ux-patterns/evidence/collaborative-realtime.md
  - reports/frontmatter-editing-ux-patterns/evidence/field-type-affordances.md
  - reports/frontmatter-editing-ux-patterns/evidence/schema-vs-freeform.md
  - reports/frontmatter-editing-ux-patterns/evidence/top-of-document-property-table.md
date: 2026-04-24
---

# Prior research pointer

Authoritative source: [`reports/frontmatter-editing-ux-patterns/REPORT.md`](../../../reports/frontmatter-editing-ux-patterns/REPORT.md). Six evidence files. Audited (10 findings, all resolved).

## What this spec inherits

| Finding | Flows into spec as |
|---|---|
| Top-of-document property table is the best-fit pattern for markdown-native, writing-first editors | D1 (DIRECTED) |
| Per-key Y.Map decomposition gives field-level CRDT merge; single-string gives doc-level LWW | D2 (LOCKED) |
| Obsidian Properties (v1.4+) is the closest reference implementation | UX inspiration; not a copy-paste target |
| YAML-clean type set: text, number, boolean, date, list | D5 (DIRECTED) |
| "Suggest, don't enforce" hybrid model is the sweet spot at scale | NG1 (deferred — registry out of MVP) |

## What is explicitly out of scope here

The research report mapped a wider design space than MVP needs. The following dimensions are research-supported but out of MVP per user-directed scope cut (D4):

- All-Properties governance panel (research §1, NG1)
- Cross-doc autocomplete (NG2)
- Vault-wide rename / merge / retype (NG3)
- Schema-first validation alternative (NG4)
- Notion-style relations / rollups (NG5 — also infeasible with YAML-on-disk)
- Rich text in property values (NG6)
- Type inference across the vault (NG10)

## What still needs spec-local investigation

The research report covered product-landscape questions. The following are codebase-internal questions the report did not answer and this spec must:

- Per-key Y.Map schema for the OK codebase specifically (Q8)
- Migration path for existing in-flight Y.Docs and on-disk YAML (Q9)
- Observer A / B contract changes (Q10–Q11)
- MCP write path retargeting (Q12)
- File-watcher path retargeting (Q13)
- TipTap rendering pattern for the form (Q14)
- Attribution / origin discipline for form-driven writes (Q15)
- YAML round-trip fidelity for unsupported constructs (Q16–Q17)
