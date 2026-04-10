---
title: "Frontmatter Schema Conventions for Agent-Readable Documentation"
description: "Cross-ecosystem analysis of YAML frontmatter fields used by documentation frameworks (Fumadocs, Mintlify, Fern, Docusaurus, Starlight), knowledge platforms (Obsidian), and agent-native patterns (Karpathy wiki). Identifies universal, convergent, and AI-specific fields to derive a minimal viable schema for an agent-native knowledge platform."
createdAt: 2026-04-05
updatedAt: 2026-04-05
subjects:
  - Fumadocs
  - Mintlify
  - Fern
  - Docusaurus
  - Obsidian
  - Starlight
  - Karpathy LLM Wiki
  - Hugo
topics:
  - frontmatter schema
  - documentation metadata
  - llms.txt generation
  - agent-native knowledge
---

# Frontmatter Schema Conventions for Agent-Readable Documentation

**Purpose:** Determine which YAML frontmatter fields an agent-native knowledge platform should support, grounded in what the documentation ecosystem actually uses. The frontmatter schema must serve four downstream consumers: index.md generation, llms.txt generation, search filtering, and MCP tool responses.

---

## Executive Summary

Across 8 documentation systems analyzed (Fumadocs, Mintlify, Fern, Docusaurus, Starlight, Obsidian, Hugo, Karpathy wiki), the frontmatter landscape reveals a clear three-tier structure: a tiny universal core, a moderate convergent set, and a long tail of platform-specific fields.

Only **title** and **description** are truly universal — present in 7 of 8 systems. The next tier of convergent fields includes **tags** (5 systems), **slug** (4), **image** (4), **draft** (3), **keywords** (3), and **icon** (3). Beyond that, 40+ fields are platform-specific. Layout modes, sidebar controls, date fields, and visibility flags all share common *concepts* but diverge completely in naming and semantics.

For AI/agent consumption specifically, the ecosystem is still nascent. Fern is the only platform with explicit agent-facing frontmatter behavior (noindex excluding from llms.txt). The Karpathy wiki pattern introduces genuinely novel fields for agent consumption — confidence, type, and sources — that no documentation framework has adopted.

The minimal viable schema for an agent-native platform is 15 fields across three categories: a universal core (title, description), documentation-convergent fields (tags, slug, icon, draft, keywords, image, aliases), and agent-native extensions (type, confidence, sources, noindex, createdAt, updatedAt).

**Key Findings:**
- **Title + description are the only universal fields:** Every system defines them (Obsidian is the lone outlier for title, using filenames instead). Description is also the primary field feeding llms.txt generation across Fumadocs, Mintlify, and Fern.
- **Tags have strong convergence but docs frameworks lag:** Present in Docusaurus, Obsidian, Hugo, Starlight, and Karpathy wiki, but absent from Fumadocs, Mintlify, and Fern core schemas.
- **Layout/display fields are deeply platform-specific:** Every framework implements layout control differently (Fumadocs: full, Mintlify: mode with 5 values, Fern: layout with 2 values, Starlight: template with 2 values). No convergence worth adopting.
- **AI-specific frontmatter is a greenfield:** Only Fern's noindex has explicit llms.txt semantics. The Karpathy wiki's confidence and type fields represent the most mature agent-specific metadata, but no framework has adopted them.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | Fumadocs frontmatter schema | P0 | Deep (OSS source) |
| D2 | Mintlify frontmatter schema | P0 | Deep (web docs) |
| D3 | Fern frontmatter schema (+ AI fields) | P0 | Deep (web docs) |
| D4 | Docusaurus frontmatter | P0 | Deep (web docs) |
| D5 | Obsidian frontmatter conventions | P0 | Deep (web docs + community) |
| D6 | Karpathy wiki frontmatter | P0 | Moderate (gist + analyses) |
| D7 | Convergence analysis | P0 | Deep (synthesis) |
| D8 | AI-specific frontmatter fields | P0 | Deep (web + synthesis) |

**Stance:** Factual. Synthesis section provides a minimal viable schema derivation but avoids prescriptive recommendations.

---

## Detailed Findings

### D1: Fumadocs Frontmatter Schema

**Finding:** Fumadocs defines the most minimal schema of any framework — 4 fields, only title required.

**Evidence:** [evidence/fumadocs-frontmatter.md](evidence/fumadocs-frontmatter.md)

The core schema in `fumadocs-core/src/source/schema.ts`:

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| title | string | Yes | Page title (auto-populated from first h1 if absent) |
| description | string | No | Page description; feeds llms.txt via the llms() helper |
| icon | string | No | Icon identifier for sidebar navigation |
| full | boolean | No | Full-width layout mode (hides TOC) |

The `_openapi` field exists but is internal (for OpenAPI-generated pages). The Obsidian integration package adds `aliases` with a `.loose()` schema that passes through arbitrary fields.

The schema is extensible via Zod — users override `pageSchema` with their own schema in `source.config.ts`. This design philosophy is deliberate: Fumadocs provides the minimum core and lets users extend rather than shipping a large default schema.

For llms.txt generation, the `llms()` function in `fumadocs-core/src/source/loader/llms.ts` consumes only `title` and `description` from page data. No other frontmatter fields affect the llms.txt output.

**Implications:** A platform building on Fumadocs infrastructure must define its own extended schema. Fumadocs will not provide tags, slug, draft, or any AI-specific fields out of the box.

### D2: Mintlify Frontmatter Schema

**Finding:** Mintlify supports 17+ named fields with a focus on display control and access management, but lacks tags, draft, and explicit date fields.

**Evidence:** [evidence/mintlify-frontmatter.md](evidence/mintlify-frontmatter.md)

Key fields from [Mintlify's page documentation](https://www.mintlify.com/docs/organize/pages):

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| title | string | No | Page title (auto-generated from path if absent) |
| description | string | No | SEO meta description; feeds llms.txt |
| sidebarTitle | string | No | Abbreviated sidebar label |
| icon | string | No | Visual identifier (Font Awesome, Lucide, URL) |
| tag | string | No | Badge label next to title |
| hidden | boolean | No | Remove from sidebar; auto-applies noindex |
| noindex | boolean | No | Prevent search engine indexing |
| deprecated | boolean | No | Display deprecation warning |
| mode | enum | No | Layout: default, wide, custom, frame, center |
| groups | string[] | No | Restrict access to user groups |
| keywords | string[] | No | Search discovery terms |
| api / openapi | string | No | API spec for interactive playground |

Mintlify accepts arbitrary custom YAML beyond these named fields. For [llms.txt generation](https://www.mintlify.com/docs/ai/llmstxt), description is truncated at 300 characters. Group-restricted pages are excluded. HTTP discovery headers are automatically added.

Notable absences: no tags field (uses keywords for search), no draft or unlisted state, no slug override, no date fields beyond the timestamp boolean toggle.

**Implications:** Mintlify's schema is presentation-heavy — many fields control how content looks rather than what it means.

### D3: Fern Frontmatter Schema

**Finding:** Fern has the most advanced AI-agent integration of any documentation platform, with noindex explicitly excluding pages from llms.txt and a site-level agents directive system.

**Evidence:** [evidence/fern-frontmatter.md](evidence/fern-frontmatter.md)

Core fields from [Fern's frontmatter docs](https://buildwithfern.com/learn/docs/content/frontmatter):

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| title | string | No | Browser title / search result title |
| subtitle | string | No | Rendered subtitle; fallback for description in llms.txt |
| description | string | No | Meta description; primary llms.txt page description |
| slug | string | No | Full URL path override |
| noindex | boolean | No | Exclude from search engines AND llms.txt |
| availability | enum | No | Badge: stable, generally-available, in-development, pre-release, deprecated, beta |
| layout | enum | No | overview or guide |
| edit-url | string | No | GitHub source file link |
| og:image | string | No | Social preview image |
| hide-toc | boolean | No | Hide table of contents |
| hide-feedback | boolean | No | Disable feedback widget |
| keywords | string[] | No | SEO keywords |

AI-specific mechanisms from [Fern's llms.txt documentation](https://buildwithfern.com/learn/docs/ai-features/llms-txt):

| Mechanism | Level | Purpose |
|-----------|-------|---------|
| noindex: true | Frontmatter (per-page) | Exclude from search + llms.txt |
| agents key | docs.yml (site-level) | Prepend AI directive before page body |
| llms-only tag | Content tag | Show to AI only, hide from humans |
| llms-ignore tag | Content tag | Show to humans only, hide from AI |
| ?lang=, ?excludeSpec= | URL params | Filter llms.txt output per-request |

**Implications:** Fern demonstrates the current frontier of AI-aware documentation metadata. However, their agent-specific features are split between frontmatter (noindex), site config (agents), and content tags rather than consolidated in frontmatter.

### D4: Docusaurus Frontmatter

**Finding:** Docusaurus has the largest frontmatter schema (22+ fields for docs, additional fields for blog) with the most granular sidebar and pagination control.

**Evidence:** [evidence/docusaurus-frontmatter.md](evidence/docusaurus-frontmatter.md)

Core fields from the [Docusaurus docs plugin](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs):

| Field | Type | Purpose |
|-------|------|---------|
| title | string | Page title |
| description | string | Meta description (falls back to first content line) |
| slug | string | Custom URL path |
| tags | Tag[] | Categorization tags |
| draft | boolean | Dev-only, excluded from production |
| unlisted | boolean | Available in prod but hidden + not indexed |
| keywords | string[] | Meta keywords |
| image | string | Social preview image |
| id | string | Unique document identifier |
| sidebar_label | string | Sidebar display text |
| sidebar_position | number | Auto-sidebar ordering |
| hide_title | boolean | Hide rendered title |
| hide_table_of_contents | boolean | Hide TOC |
| custom_edit_url | string | Edit page link |
| last_update | object | Override author/date metadata |

Blog-specific additions: authors, date, author (deprecated singular).

Docusaurus uniquely distinguishes draft (dev-only, completely excluded from production builds) from unlisted (available in production by URL but hidden from navigation and not indexed). This is the most nuanced visibility model in the ecosystem.

**Implications:** Docusaurus is the reference implementation for content management frontmatter. Its field set covers the most use cases.

### D5: Obsidian Frontmatter Conventions

**Finding:** Obsidian has only 3 core properties (tags, aliases, cssclasses) but a rich community convention layer and 5 additional Publish-specific properties.

**Evidence:** [evidence/obsidian-frontmatter.md](evidence/obsidian-frontmatter.md)

Core properties from [Obsidian's official documentation](https://help.obsidian.md/properties):

| Field | Type | Core/Publish | Purpose |
|-------|------|-------------|---------|
| tags | Tags/List | Core | Hierarchical categorization |
| aliases | List | Core | Alternative names for search/linking |
| cssclasses | List | Core | CSS styling classes |
| publish | Checkbox | Publish | Control Publish visibility |
| permalink | Text | Publish | Custom URL path |
| description | Text | Publish | SEO meta description |
| image | Text | Publish | Social preview image |

Obsidian supports 7 property types: Text, List, Number, Checkbox, Date, Date & Time, Tags. Property types are enforced vault-wide.

Obsidian is unique in **not having a title field** — the filename IS the title.

Community-defined properties commonly include: status, created, updated, type, source, category, author, rating, project.

**Implications:** Obsidian's approach — minimal core, community-evolved extensions, vault-wide type enforcement — is closest to the "agent-native" model where metadata should be machine-readable and consistent. The aliases field is unique and valuable for agent consumption.

### D6: Karpathy Wiki Frontmatter

**Finding:** Karpathy's LLM wiki prescribes a 7-field schema with genuinely novel agent-oriented fields (confidence, type, sources) not found in any documentation framework.

**Evidence:** [evidence/karpathy-wiki-frontmatter.md](evidence/karpathy-wiki-frontmatter.md)

Schema from [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| title | string | Yes | Page title |
| type | enum | Yes | concept, entity, source-summary, comparison |
| sources | string[] | Yes | Raw files that informed this page (provenance) |
| related | string[] | No | Wiki-link cross-references |
| created | date | Yes | Creation timestamp |
| updated | date | Yes | Last modification timestamp |
| confidence | enum | No | Claim certainty: high, medium, low |

Three fields are unique innovations for agent-native content:

1. **confidence** — Tells agents how much to trust claims on this page. Enables quality-aware retrieval.
2. **type** — Creates an article taxonomy that agents can use for routing.
3. **sources** — Provenance tracking linking wiki pages back to raw ingested materials.

**Implications:** The Karpathy schema is the only one designed from the ground up for agent consumption.

### D7: Convergence Analysis

**Finding:** The ecosystem converges on 2 universal fields, 5 strongly convergent fields, and 3 moderately convergent fields. Beyond that, divergence dominates.

**Evidence:** [evidence/convergence-analysis.md](evidence/convergence-analysis.md)

**Tier 1 — Universal (6+ of 8 systems):**

| Field | Present In | Count |
|-------|-----------|-------|
| title | Fumadocs, Mintlify, Fern, Docusaurus, Karpathy, Hugo, Starlight | 7/8 |
| description | Fumadocs, Mintlify, Fern, Docusaurus, Obsidian(pub), Hugo, Starlight | 7/8 |

**Tier 2 — Strong convergence (4-5 systems):**

| Field | Present In | Count |
|-------|-----------|-------|
| tags | Docusaurus, Obsidian, Karpathy, Hugo, Starlight | 5/8 |
| slug | Fern, Docusaurus, Hugo, Starlight | 4/8 |
| image | Docusaurus, Obsidian(pub), Hugo, Fern(og:image) | 4/8 |

**Tier 3 — Moderate convergence (3 systems):**

| Field | Present In | Count |
|-------|-----------|-------|
| draft | Docusaurus, Hugo, Starlight | 3/8 |
| keywords | Mintlify, Fern, Docusaurus | 3/8 |
| icon | Fumadocs, Mintlify, Starlight | 3/8 |

**Tier 4 — Common concept, divergent implementation:**

| Concept | Implementations |
|---------|----------------|
| Layout mode | Fumadocs: full, Mintlify: mode (5 vals), Fern: layout (2 vals), Starlight: template |
| Sidebar label | Mintlify: sidebarTitle, Docusaurus: sidebar_label, Starlight: sidebar.label |
| Date updated | Karpathy: updated, Docusaurus: last_update, Starlight: lastUpdated, Hugo: lastmod |
| Visibility | Docusaurus: unlisted, Mintlify: hidden, Starlight: sidebar.hidden |
| Search exclude | Fern: noindex, Mintlify: noindex, Starlight: pagefind |

### D8: AI-Specific Frontmatter Fields

**Finding:** The ecosystem has almost no standardized AI-specific frontmatter fields. Fern's noindex excluding from llms.txt is the only production example.

**Evidence:** [evidence/ai-specific-frontmatter.md](evidence/ai-specific-frontmatter.md)

**What exists today:**

| Field/Mechanism | Platform | Level | Purpose |
|----------------|----------|-------|---------|
| noindex: true | Fern | Frontmatter | Exclude from search + llms.txt |
| noindex: true | Mintlify | Frontmatter | Exclude from search (SEO only) |
| agents key | Fern | Site config | Prepend AI directive to pages |
| llms-only | Fern | Content tag | AI-only content sections |
| llms-ignore | Fern | Content tag | Human-only content sections |
| pagefind: false | Starlight | Frontmatter | Exclude from search index |
| confidence | Karpathy | Frontmatter | Claim certainty level |
| type | Karpathy | Frontmatter | Article taxonomy for routing |
| sources | Karpathy | Frontmatter | Provenance tracking |

**What does NOT exist yet (confirmed via negative search):**

| Proposed field | Purpose | Status |
|---------------|---------|--------|
| ai: namespace | Namespaced AI-specific metadata | Not found in any platform |
| generated / maintained-by | Flag AI-generated vs human-authored | Not found |
| agent-instructions | Per-page AI directive | Fern has site-level only |
| priority | Agent retrieval weighting | Not found |

The key insight is that **description is the most important field for AI consumption** — it is the primary field that feeds llms.txt generation across Fumadocs, Mintlify, and Fern.

---

## Minimal Viable Schema Synthesis

Based on ecosystem convergence (D7) and agent-native requirements (D8), an agent-native knowledge platform should support the following 15-field schema organized in three tiers:

### Core Fields (always populated)

| Field | Type | Required | Source | Rationale |
|-------|------|----------|--------|-----------|
| **title** | string | Yes | Universal (7/8) | Only truly required field across ecosystem. Auto-populate from h1 if absent. |
| **description** | string | Strongly encouraged | Universal (7/8) | Primary feed for llms.txt, search snippets, MCP tool responses. Single most impactful field for AI discoverability. |

### Documentation-Convergent Fields (standard ecosystem fields)

| Field | Type | Required | Source | Rationale |
|-------|------|----------|--------|-----------|
| **tags** | string[] | No | Strong (5/8) | Search filtering, index.md grouping, MCP tool filtering. |
| **slug** | string | No | Strong (4/8) | URL path override. Standard across Fern, Docusaurus, Hugo, Starlight. |
| **icon** | string | No | Moderate (3/8) | Visual identifier for navigation. |
| **draft** | boolean | No | Moderate (3/8) | Exclude from production/published state. |
| **image** | string | No | Strong (4/8) | Social preview / cover image. |
| **keywords** | string[] | No | Moderate (3/8) | SEO meta keywords; search term boost. |
| **aliases** | string[] | No | Obsidian + Fumadocs | Alternative names for search/linking. Valuable for agent fuzzy matching. |

### Agent-Native Extensions (for AI/agent consumption)

| Field | Type | Required | Source | Rationale |
|-------|------|----------|--------|-----------|
| **type** | string | No | Karpathy wiki | Article taxonomy. Enables agent routing (concept vs entity vs guide vs reference). |
| **sources** | string[] | No | Karpathy wiki | Provenance tracking. Links page to raw materials. |
| **confidence** | enum | No | Karpathy wiki | Claim certainty (high/medium/low). Enables quality-aware retrieval. |
| **noindex** | boolean | No | Fern + Mintlify | Exclude from search AND llms.txt generation (following Fern semantics). |
| **createdAt** | date | No | Karpathy + Hugo | Creation timestamp (ISO 8601). Enables recency-aware retrieval. |
| **updatedAt** | date | No | Karpathy + 4 frameworks | Last modification (ISO 8601). Most critical date field. |

### Fields Explicitly Excluded (with rationale)

| Field | Why Excluded |
|-------|-------------|
| Layout/mode/template | Deeply platform-specific (5 incompatible implementations). Handle at rendering layer. |
| Sidebar label/position | Presentation concern. Derive navigation from file structure + tags. |
| groups / access control | Platform-specific feature, not portable metadata. |
| availability / deprecated | Overlaps with draft and tags. Express as tag value. |
| cssclasses | Obsidian-specific rendering concern. |
| authors / author | Blog-specific. Add later if needed. |
| subtitle | Fern-specific. Description serves same purpose for llms.txt. |

### How Fields Map to Downstream Consumers

| Field | index.md | llms.txt | Search | MCP Tools |
|-------|----------|----------|--------|-----------|
| title | Page listing | Entry title | Result title | Response title |
| description | One-line summary | Page description (primary) | Snippet | Response summary |
| tags | Category grouping | Filtering | Faceted filter | Filter param |
| slug | Link target | Link URL | URL routing | Resource ID |
| icon | Visual nav | -- | -- | -- |
| draft | Exclude if true | Exclude if true | Exclude if true | Exclude if true |
| image | -- | -- | -- | Rich response |
| keywords | -- | -- | Search boost | -- |
| aliases | Alt listings | -- | Synonym matching | Fuzzy match |
| type | Section grouping | Category header | Type filter | Routing hint |
| sources | Attribution | -- | -- | Provenance |
| confidence | Quality indicator | -- | Rank boost | Confidence level |
| noindex | Exclude if true | Exclude if true | Exclude if true | Exclude if true |
| createdAt | Date display | -- | Date filter | Metadata |
| updatedAt | Last updated | -- | Recency sort | Staleness indicator |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Fern frontmatter source code:** The raw MDX on GitHub returned 404; inventory from web docs. Multiple sources corroborate but source code was not inspected.
- **Obsidian official properties page:** Redirect chain prevented direct scraping; reconstructed from DeepWiki and community sources.
- **Karpathy gist:** A prompt/idea file, not a rigid spec. Schema derived from implementation analyses.

### Out of Scope (per Rubric)
- Content-level AI directives (llms-only, llms-ignore)
- Site-level config (Fern agents key in docs.yml)
- Rendering-layer concerns
- Validation schema implementation (Zod, JSON Schema)

---

## References

### Evidence Files
- [evidence/fumadocs-frontmatter.md](evidence/fumadocs-frontmatter.md) — Fumadocs source code analysis
- [evidence/mintlify-frontmatter.md](evidence/mintlify-frontmatter.md) — Mintlify page frontmatter and llms.txt
- [evidence/fern-frontmatter.md](evidence/fern-frontmatter.md) — Fern frontmatter + AI features
- [evidence/docusaurus-frontmatter.md](evidence/docusaurus-frontmatter.md) — Docusaurus docs + blog frontmatter
- [evidence/obsidian-frontmatter.md](evidence/obsidian-frontmatter.md) — Obsidian core properties + community
- [evidence/karpathy-wiki-frontmatter.md](evidence/karpathy-wiki-frontmatter.md) — Karpathy wiki schema
- [evidence/convergence-analysis.md](evidence/convergence-analysis.md) — Cross-framework convergence tiers
- [evidence/ai-specific-frontmatter.md](evidence/ai-specific-frontmatter.md) — AI-specific field inventory

### External Sources
- [Mintlify Pages docs](https://www.mintlify.com/docs/organize/pages) — Frontmatter reference
- [Mintlify llms.txt docs](https://www.mintlify.com/docs/ai/llmstxt) — AI feature documentation
- [Fern Frontmatter docs](https://buildwithfern.com/learn/docs/content/frontmatter) — Page-level settings
- [Fern llms.txt docs](https://buildwithfern.com/learn/docs/ai-features/llms-txt) — AI-specific features
- [Fern AI agents guide](https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide) — llms.txt optimization
- [Docusaurus docs frontmatter](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs#markdown-front-matter) — Complete field reference
- [Docusaurus blog frontmatter](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-blog#markdown-front-matter) — Blog-specific fields
- [Obsidian Properties](https://help.obsidian.md/properties) — Official properties documentation
- [Karpathy LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Original idea file
- [Karpathy Wiki analysis](https://antigravity.codes/blog/karpathy-llm-wiki-idea-file) — Detailed gist breakdown
- [Starlight Frontmatter Reference](https://starlight.astro.build/reference/frontmatter/) — Astro Starlight fields
- [Hugo Front Matter](https://gohugo.io/content-management/front-matter/) — Hugo field reference
