# Evidence: Obsidian Frontmatter Conventions

**Dimension:** D5 — Obsidian frontmatter conventions
**Date:** 2026-04-05
**Sources:** https://help.obsidian.md/properties, https://deepwiki.com/obsidianmd/obsidian-help/4.3-properties-and-metadata, community forums

---

## Key pages referenced

- https://help.obsidian.md/properties — Official properties documentation
- https://deepwiki.com/obsidianmd/obsidian-help/4.3-properties-and-metadata — DeepWiki synthesis
- https://forum.obsidian.md/t/how-do-you-put-yaml-to-use-in-your-system/18987 — Community conventions

---

## Findings

### Finding: Obsidian has 3 core properties + Publish-specific properties
**Confidence:** CONFIRMED
**Evidence:** Official docs, DeepWiki synthesis

**Core properties (recognized by Obsidian):**

| Field | Type | Purpose |
|-------|------|---------|
| tags | Tags/List | Hierarchical categorization; equivalent to inline #tags |
| aliases | List | Alternative names for link suggestions and search |
| cssclasses | List | CSS class names for note-specific styling |

**Publish-specific properties:**

| Field | Type | Purpose |
|-------|------|---------|
| publish | Checkbox | Controls note visibility on Obsidian Publish sites |
| permalink | Text | Custom URL path for published content |
| description | Text | Meta description for SEO and social previews |
| image | Text | Social media preview image (URL or vault path) |
| cover | Text | Alias for image |

### Finding: Obsidian supports 7 property types
**Confidence:** CONFIRMED
**Evidence:** DeepWiki synthesis

1. **Text** — single-line strings
2. **List** — multiple values
3. **Number** — integers or decimals
4. **Checkbox** — boolean (true/false/null)
5. **Date** — ISO 8601 (YYYY-MM-DD)
6. **Date & Time** — ISO 8601 with time
7. **Tags** — hierarchical tags with forward-slash notation

### Finding: Vault-wide type enforcement — property types are global
**Confidence:** CONFIRMED
**Evidence:** "Once a property name is assigned a type in any file, all properties with that name across the entire vault use the same type"

### Finding: Singular forms deprecated in v1.4, removed in v1.9
**Confidence:** CONFIRMED
**Evidence:** `tag`, `alias`, `cssclass` (singular) deprecated. Use `tags`, `aliases`, `cssclasses` (plural).

### Finding: Community uses extensive custom properties beyond core
**Confidence:** CONFIRMED
**Evidence:** Forum thread on community conventions

Common community-defined properties:
- `status` (draft, published, review, etc.)
- `created` / `date` (creation date)
- `updated` / `modified` (last modified)
- `type` (note type: concept, project, person, etc.)
- `source` (URL or file reference)
- `category` / `categories`
- `author`
- `rating` (numeric rating)
- `project` (project association)

### Finding: Properties are explicitly not Markdown — designed for machine-readability
**Confidence:** CONFIRMED
**Evidence:** "Properties intentionally exclude formatting for machine-readability"

---

## Gaps / follow-ups

- No official `title` property (Obsidian uses filename as title)
- No official `slug` property
- No AI-specific properties in core
- Obsidian is unique in having NO title field — the note filename IS the title
