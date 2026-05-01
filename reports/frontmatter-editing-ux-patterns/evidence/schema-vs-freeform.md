# Evidence: Schema-Driven vs Freeform Metadata

**Dimension:** Schema-driven vs freeform approaches to frontmatter editing
**Date:** 2026-04-24
**Sources:** TinaCMS, Sanity, Contentlayer, Keystatic, Obsidian (pre-v1.4 and v1.4+), Notion

---

## Findings

### Finding: Three distinct models exist — schema-first, freeform, and hybrid
**Confidence:** CONFIRMED
**Evidence:** Cross-product comparison

**Pure schema-driven (CMS tools):**
- TinaCMS: JS/TS DSL in `tina/config.ts`. Keys not in schema are silently dropped on save.
- Sanity: `defineType`/`defineField` in JS modules. Unknown keys preserved in datastore but hidden from UI.
- Contentlayer: Zod-like `defineDocumentType`. Validation at build time; unrecognized keys trigger warnings.
- Keystatic: `keystatic.config.ts` with `fields.*()`. Unknown keys preserved (pass-through) but not editable via UI.

**Pure freeform (pre-v1.4 Obsidian, raw YAML):**
- Key inconsistency: `date` vs `Date` vs `created_at` across documents
- Type confusion: `tags: AI` (string) vs `tags: [AI]` (array) vs `tags: "AI"` (quoted string)
- Typos in key names invisible — `categroy` silently creates a new property
- No discoverability of what properties exist without third-party tools

**Hybrid (Obsidian v1.4+, Notion):**
- Obsidian: vault-wide property registry inferred from usage. Autocomplete existing names. Type suggestions (not enforcement). Unknown/new properties always allowed.
- Notion: database-defined schema that can be extended per-page. Type changes propagate.

### Finding: Obsidian's "suggest, don't enforce" model is the sweet spot for knowledge bases
**Confidence:** INFERRED
**Evidence:** Obsidian Properties design, community adoption

Obsidian scans the vault and builds a property registry from usage. When adding a property:
1. Autocompletes existing property names
2. Infers types from prior values
3. Properties with inconsistent types across vault get warning icon
4. Users CAN manually set "expected type" — vault-wide suggestion, not hard constraint
5. Unknown/new properties always allowed — no gating

This model works because content types in knowledge bases evolve organically. Schema-first approaches require a code change to add a field, creating a deploy bottleneck.

### Finding: No mainstream tool supports retroactive template application
**Confidence:** CONFIRMED
**Evidence:** Cross-product comparison

- TinaCMS/Sanity/Keystatic: content types ARE templates — creating a doc pre-populates schema fields
- Obsidian: Templates plugin inserts predefined frontmatter block at creation time
- Notion: Database templates pre-fill properties AND content at row creation
- Gap: updating a template does NOT back-fill existing documents. Known pain point.

### Finding: Schema distribution is always file-based
**Confidence:** CONFIRMED
**Evidence:** All schema-driven tools surveyed

Every tool stores schemas in repo-local config files. No tool uses a central registry server for schema definitions. This means schema changes require commits and potentially deploys.

---

## Gaps / follow-ups

- Schema evolution: how tools handle adding/removing/renaming schema fields when existing content already uses the old schema
- Migration tooling: do any tools provide automated frontmatter migration when schemas change?
