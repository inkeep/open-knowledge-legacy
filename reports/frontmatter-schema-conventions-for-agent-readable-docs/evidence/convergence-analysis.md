# Evidence: Convergence Analysis

**Dimension:** D7 — Cross-framework field convergence
**Date:** 2026-04-05
**Sources:** Synthesis of D1-D6 evidence, plus Hugo and Starlight for additional triangulation

---

## Methodology

Compared frontmatter fields across 8 systems: Fumadocs, Mintlify, Fern, Docusaurus, Obsidian, Karpathy Wiki, Hugo (bonus), Starlight/Astro (bonus). A field is counted if the framework has it as a named, documented field — not just because arbitrary YAML is accepted.

---

## Findings

### Finding: title and description are the only truly universal fields
**Confidence:** CONFIRMED

| Field | Fumadocs | Mintlify | Fern | Docusaurus | Obsidian | Karpathy | Hugo | Starlight | Count |
|-------|----------|---------|------|------------|----------|----------|------|-----------|-------|
| **title** | YES (req) | YES | YES | YES | no* | YES (req) | YES | YES (req) | 7/8 |
| **description** | YES | YES | YES | YES | YES (pub) | no | YES | YES | 7/8 |

*Obsidian uses filename as title; description is Publish-only.

### Finding: 7 fields appear in 3+ frameworks (convergent fields)
**Confidence:** CONFIRMED

| Field | Frameworks Present | Count |
|-------|-------------------|-------|
| title | Fumadocs, Mintlify, Fern, Docusaurus, Karpathy, Hugo, Starlight | 7 |
| description | Fumadocs, Mintlify, Fern, Docusaurus, Obsidian(pub), Hugo, Starlight | 7 |
| icon | Fumadocs, Mintlify, Starlight (via sidebar.badge) | 3 |
| tags | Docusaurus, Obsidian, Karpathy, Hugo, Starlight (not in Fumadocs/Mintlify/Fern) | 5 |
| slug | Fern, Docusaurus, Hugo, Starlight | 4 |
| draft | Docusaurus, Hugo, Starlight | 3 |
| keywords | Mintlify, Fern, Docusaurus | 3 |
| image | Docusaurus, Obsidian(pub), Hugo, Fern(og:image) | 4 |

### Finding: Layout/display fields are common but highly platform-specific
**Confidence:** CONFIRMED

| Field | Fumadocs | Mintlify | Fern | Docusaurus | Starlight |
|-------|----------|---------|------|------------|-----------|
| Layout mode | full | mode (5 vals) | layout (2 vals) | — | template (2 vals) |
| Hide TOC | — | via mode | hide-toc | hide_table_of_contents | tableOfContents |
| Hide title | — | — | — | hide_title | — |
| Sidebar label | — | sidebarTitle | — | sidebar_label | sidebar.label |
| Sidebar order | — | — | — | sidebar_position | sidebar.order |

Every framework implements layout control differently. No convergence on field names or value types.

### Finding: Date/timestamp fields are present but inconsistently named
**Confidence:** CONFIRMED

| Framework | Created | Updated | Format |
|-----------|---------|---------|--------|
| Karpathy | created | updated | YYYY-MM-DD |
| Hugo | date | lastmod | YYYY-MM-DD |
| Docusaurus | — | last_update | object |
| Starlight | — | lastUpdated | Date |
| Mintlify | — | timestamp (toggle) | boolean |

No convergence on field names. The concept is common but the implementation varies.

### Finding: Visibility/indexing controls are common (4+ frameworks)
**Confidence:** CONFIRMED

| Framework | Draft/Dev-only | Hidden/Unlisted | Search exclude |
|-----------|---------------|-----------------|----------------|
| Docusaurus | draft | unlisted | (via unlisted) |
| Mintlify | — | hidden | noindex |
| Fern | — | — | noindex |
| Hugo | draft | — | — |
| Starlight | draft | sidebar.hidden | pagefind: false |
| Obsidian | — | — | publish: false |

### Finding: Fields that are platform-specific (1-2 frameworks only)
**Confidence:** CONFIRMED

| Field | Only in | Purpose |
|-------|---------|---------|
| full | Fumadocs | Full-width layout |
| _openapi | Fumadocs | OpenAPI data injection |
| iconType | Mintlify | Font Awesome variant |
| tag (badge) | Mintlify | Label next to title |
| deprecated | Mintlify, Fern | Deprecation warning |
| groups | Mintlify | Access control |
| availability | Fern | Status badge (6 values) |
| hide-feedback | Fern | Disable feedback widget |
| edit-url | Fern | GitHub edit link |
| subtitle | Fern | Rendered subtitle + llms.txt fallback |
| og:image | Fern | Social preview |
| id | Docusaurus | Unique document ID |
| sidebar_custom_props | Docusaurus | Arbitrary sidebar data |
| displayed_sidebar | Docusaurus | Force sidebar selection |
| aliases | Obsidian, Fumadocs(obsidian) | Alternative names |
| cssclasses | Obsidian | Styling classes |
| type | Karpathy | Article taxonomy |
| sources | Karpathy | Provenance tracking |
| related | Karpathy | Cross-references |
| confidence | Karpathy | Claim certainty |
| weight | Hugo | Sort ordering |
| categories | Hugo | Taxonomy |
| hero | Starlight | Hero component config |
| banner | Starlight | Announcement banner |
| pagefind | Starlight | Search index control |

---

## Convergence tiers

**Tier 1 — Universal (6+ frameworks):**
- title, description

**Tier 2 — Strong convergence (4-5 frameworks):**
- tags, slug, image

**Tier 3 — Moderate convergence (3 frameworks):**
- draft, keywords, icon

**Tier 4 — Common concept, divergent implementation:**
- Layout/display mode, sidebar label/order, date/timestamp, visibility/indexing, edit URL

**Tier 5 — Platform-specific:**
- Everything else (40+ fields)
