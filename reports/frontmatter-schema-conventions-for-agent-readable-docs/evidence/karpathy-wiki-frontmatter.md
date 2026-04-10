# Evidence: Karpathy Wiki Frontmatter Schema

**Dimension:** D6 — Karpathy's LLM wiki frontmatter conventions
**Date:** 2026-04-05
**Sources:** https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f, https://antigravity.codes/blog/karpathy-llm-wiki-idea-file, https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an

---

## Key sources referenced

- Karpathy's LLM Wiki gist (idea file / prompt)
- Antigravity.codes deep analysis of the gist
- VentureBeat coverage
- Community implementations (Ar9av/obsidian-wiki)

---

## Findings

### Finding: Karpathy's wiki prescribes a 7-field frontmatter schema
**Confidence:** CONFIRMED (via implementations and analysis of the gist)
**Evidence:** https://antigravity.codes/blog/karpathy-llm-wiki-idea-file

Recommended schema:

```yaml
---
title: Page Title
type: concept | entity | source-summary | comparison
sources: [list of raw/ files referenced]
related: [list of wiki pages linked]
created: YYYY-MM-DD
updated: YYYY-MM-DD
confidence: high | medium | low
---
```

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| title | string | Yes | Page title |
| type | enum | Yes | Article type: concept, entity, source-summary, comparison |
| sources | string[] | Yes | Raw files that informed this page (provenance) |
| related | string[] | No | Wiki-link cross-references |
| created | date | Yes | Creation timestamp |
| updated | date | Yes | Last modification timestamp |
| confidence | enum | No | Claim certainty: high, medium, low |

### Finding: "Every wiki page MUST have YAML frontmatter"
**Confidence:** CONFIRMED
**Evidence:** The gist establishes this as a mandatory convention. Consistency enables Dataview queries and programmatic processing.

### Finding: Sources field enables provenance tracking
**Confidence:** CONFIRMED
**Evidence:** "Sources are tracked in frontmatter so every claim stays attributable." Links back to the raw/ directory of ingested materials.

### Finding: Confidence field is a knowledge-base-specific innovation
**Confidence:** CONFIRMED
**Evidence:** "Indicates certainty levels, helping identify claims needing verification or update." This is not found in any documentation framework — it's specific to knowledge bases where claims may be uncertain.

### Finding: The type field creates an article taxonomy
**Confidence:** CONFIRMED
**Evidence:** Four categories:
- `concept` — conceptual/definitional entries
- `entity` — organizational/author/project pages
- `source-summary` — summaries of ingested materials
- `comparison` — comparative analyses

### Finding: Schema is intentionally co-evolved with the LLM
**Confidence:** CONFIRMED
**Evidence:** "The schema remains deliberately flexible — 'you and the LLM co-evolve this over time'" — allowing domain-specific customization.

### Finding: Community implementation adds source_hash for change detection
**Confidence:** CONFIRMED
**Evidence:** Commenter Ss1024sS implemented "YAML frontmatter on every wiki page (source, source_hash, created, tags)" — source_hash enables detecting when raw sources change.

### Finding: index.md uses frontmatter metadata for dynamic listings
**Confidence:** CONFIRMED
**Evidence:** Index organized as "each page linked with a one-line summary, optionally metadata like date or source count" by category. Dataview generates dynamic tables from frontmatter.

---

## Gaps / follow-ups

- No `slug` or `description` field in Karpathy's schema
- No explicit `tags` in core schema (type serves a similar function; community adds tags)
- No `icon`, `layout`, or display fields (not a rendered docs framework)
- The gist is a prompt/pattern, not a rigid spec — implementations vary
