# Evidence: D2 — Wiki Compilation / Knowledge Structure

**Dimension:** Can Mintlify represent a wiki with backlinks, categories, cross-references?
**Date:** 2026-04-02
**Sources:** Mintlify navigation docs, docs.json schema, component documentation

---

## Key pages referenced
- https://www.mintlify.com/docs/organize/navigation — Navigation model
- https://www.mintlify.com/blog/refactoring-mint-json-into-docs-json — docs.json schema
- https://www.mintlify.com/docs/components — Component library
- https://www.mintlify.com/docs/organize/settings — Global settings

---

## Findings

### Finding: Mintlify's navigation is hierarchical-only, declared in docs.json
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/organize/navigation

Navigation supports: Pages, Groups, Tabs, Anchors, Global Anchors, Dropdowns, Products, Versions, Menus. All declared in docs.json.

Nesting is deep and flexible — tabs can contain anchors containing groups containing pages. But the structure is strictly **hierarchical tree**. Every page lives in exactly one location in the navigation tree.

There is no:
- Wiki-style [[backlinks]]
- Automatic cross-reference detection
- Category/tag system for content
- Graph-based navigation
- "Related pages" auto-generation
- Bidirectional linking

Pages reference each other via standard markdown links: `[text](/path/to/page)`. These are unidirectional — there's no mechanism to discover "what pages link TO this page."

### Finding: docs.json requires explicit declaration of every page in navigation
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/organize/navigation

Every page that appears in the sidebar must be explicitly listed in docs.json's `navigation` property. The filesystem does NOT drive navigation (unlike Fumadocs where the file system IS the navigation).

This means:
- Adding a new page requires editing docs.json AND creating the MDX file
- An agent generating new wiki articles would need to modify docs.json for each one
- Batch content generation requires coordinated updates to both files and config
- $ref supports modular config splitting, which helps at scale

### Finding: No wiki-link syntax, no backlinks, no auto cross-referencing
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched across Mintlify docs, components, blog

Mintlify does NOT support:
- `[[wiki-links]]` syntax (Obsidian-style)
- Automatic backlink detection
- "Pages that link here" sidebar
- Tag/category taxonomy
- Auto-generated index pages by topic
- Knowledge graph visualization

Cross-referencing is manual: authors write standard markdown links. The Mintlify Agent (Workflows) could theoretically be prompted to add cross-references, but this would be a custom workflow, not a built-in feature.

### Finding: The Mintlify Agent cannot auto-generate wiki structure
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/agent/workflows

Workflows are designed for documentation maintenance (sync with code, audit SEO, check links). They can modify existing pages and create new ones via PR, but:
- They don't analyze content for conceptual connections
- They don't generate cross-reference indexes
- They don't create concept articles from raw sources
- They don't build category pages or tag systems
- The sandbox cannot reach external services

The agent is a documentation maintenance tool, not a knowledge compilation engine.

### Finding: Snippets provide limited content reuse, not wiki structure
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/components

Mintlify's `snippets/` directory allows reusable MDX components that can be embedded across pages. This provides some content reuse but is architecturally different from wiki cross-linking:
- Snippets are embedded fragments, not linked pages
- No bidirectional relationship between the snippet and pages using it
- No automatic index of where snippets are used

---

## Negative searches

* Searched: "Mintlify backlinks", "Mintlify wiki links", "Mintlify cross-reference" — No results
* Searched: "Mintlify tags categories taxonomy" — No tag/category system found
* Searched: "Mintlify knowledge graph" — No graph features found

---

## Gaps / follow-ups

* An external agent could build wiki structure by generating MDX files with manual cross-links and maintaining a docs.json file — but this requires building the wiki compilation logic outside Mintlify
* The docs.json $ref feature allows modular config, which could help manage large wiki-like structures
