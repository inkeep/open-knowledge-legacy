---
title: "Frontmatter Editing UX Patterns in WYSIWYG Editors"
description: "Landscape survey of established UX/UI patterns for editing frontmatter and document metadata in WYSIWYG markdown editors. Covers four interaction patterns, field type affordances, schema vs freeform approaches, and CRDT collaboration considerations across 20+ products."
createdAt: 2026-04-24
updatedAt: 2026-04-24
subjects:
  - Notion
  - Obsidian
  - TinaCMS
  - Sanity
  - MDXEditor
  - Front Matter CMS
  - WordPress Gutenberg
  - Ghost
  - Keystatic
topics:
  - frontmatter editing
  - metadata UX patterns
  - WYSIWYG editor design
  - CRDT collaboration
---

# Frontmatter Editing UX Patterns in WYSIWYG Editors

**Purpose:** Survey the established UX/UI patterns for editing frontmatter (document metadata) in WYSIWYG markdown editors. The reader cares about which patterns exist, what trade-offs govern each, and which design decisions matter for a collaborative, markdown-native editor.

---

## Executive Summary

Four distinct UX patterns have emerged for frontmatter editing, each optimized for a different user profile and content model:

1. **Top-of-document property table** (Notion, Obsidian) — typed key-value rows inline above the body. The dominant pattern for note-taking and knowledge tools.
2. **Sidebar/panel form** (TinaCMS, Sanity, WordPress) — schema-driven form decoupled from the canvas. Dominant in CMS tools with predefined content types.
3. **Inline frontmatter block** (MDXEditor, Typora) — raw YAML rendered as a styled block inside the editor. Developer-oriented.
4. **Settings modal/dialog** (GitBook, Ghost, Hashnode) — metadata behind a gear icon or drawer. Content-first, metadata-second.

Among the surveyed products, the closest analog for a collaborative markdown editor is the **Obsidian Properties model**: a top-of-document property form that infers types from existing YAML, suggests but doesn't enforce a schema, and maintains a workspace-wide property registry for consistency. It combines the discoverability of inline properties with the flexibility of freeform YAML.

**Key Findings:**
- **Obsidian v1.4+ Properties is the reference implementation** for markdown-native frontmatter editing — it solves the form ↔ YAML bidirectional projection problem while keeping raw YAML as source of truth.
- **The "suggest, don't enforce" hybrid model** (infer types from existing data, autocomplete from workspace-wide usage, allow unknown keys) is the sweet spot between schema rigidity and freeform chaos.
- **Decomposing metadata to per-key Y.Map entries would give field-level merge** — concurrent edits to different properties would merge automatically, unlike character-level CRDT merges on raw YAML text which can produce invalid syntax. (Note: storing frontmatter as a single string, as many systems do today, gives only document-level last-write-wins.)
- **Among surveyed products, colored tag pills and date ranges are Notion-exclusive** — other editors and CMS tools render tags as plain text chips and dates without range support.
- **Metadata visibility drives completeness** — CMS practitioner experience suggests optional fields in separate panels may have materially lower completion rates than inline fields, though no controlled study is cited.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | Top-of-document property table | Deep | P0 |
| 2 | Sidebar/panel form | Deep | P0 |
| 3 | Inline frontmatter block | Moderate | P1 |
| 4 | Settings modal/dialog | Moderate | P1 |
| 5 | Field type affordances & type inference | Deep | P0 |
| 6 | Schema-driven vs freeform | Moderate | P0 |
| 7 | Collaborative & real-time considerations | Moderate | P1 |

**Stance:** Factual (landscape survey with pattern-fit observations). **Non-goals:** Implementation specifics, accessibility audits, mobile/responsive UX.

---

## Detailed Findings

### 1. Top-of-Document Property Table

**Finding:** Two distinct implementations dominate — Notion (database-schema-level) and Obsidian (per-file with global type registry) — and the choice between them depends on whether content is homogeneous or heterogeneous.

**Evidence:** [evidence/top-of-document-property-table.md](evidence/top-of-document-property-table.md)

Notion renders properties as a vertical key-value table between the page title and body. ~20+ field types, configurable visible/collapsed split, and crucially — properties are database-schema-level. Adding a property to one page adds it to every page in that database. Standalone pages (not in a database) have no property table at all.

Obsidian v1.4+ renders YAML frontmatter as a structured form at the top of each note. 7 field types (text, list, number, checkbox, date, datetime, tags). Properties are per-file in content but vault-global in type assignments (stored in `.obsidian/types.json`). The "All Properties" sidebar provides governance: rename properties vault-wide, merge duplicates, set canonical types.

Both implementations address property-count scalability, but differently. Notion shows a configurable number of visible properties with a "N more properties" chevron for the rest. Obsidian collapses the entire Properties section as a unit (all visible or all hidden). Obsidian preserves raw YAML as source of truth with a bidirectional form projection (form in Live Preview, YAML in Source mode). Notion uses a proprietary database model with no user-facing serialization format.

**Decision triggers:**
- If content lives in structured collections with shared schemas → Notion's database-level approach
- If content is heterogeneous with organically evolving metadata → Obsidian's per-file + global type registry
- If the property table has >5 fields → collapse behavior is essential to prevent body content from being pushed below the fold

**Remaining uncertainty:**
- Accessibility patterns for property table keyboard navigation are not well-documented across implementations

---

### 2. Sidebar/Panel Form

**Finding:** The sidebar pattern separates metadata from the writing canvas, with a spectrum from "always visible" (TinaCMS) to "on-demand drawer" (Ghost). The separation is natural for CMS workflows with predefined schemas but adds context-switching cost.

**Evidence:** [evidence/sidebar-panel-form.md](evidence/sidebar-panel-form.md)

Five implementations span the design space:

| Product | Visibility | Schema | Body/metadata relation |
|---------|-----------|--------|----------------------|
| TinaCMS | Always visible sidebar | `tina/config.ts` | Separated (`isBody` split) |
| Sanity | Always visible (inline) | JS schema modules | Peers (body is one field) |
| Front Matter CMS | Always visible panel | `frontmatter.json` | Separated (VS Code split) |
| WordPress | Toggleable sidebar (default on) | PHP + JS plugin API | Separated (Block/Post tabs) |
| Ghost | On-demand drawer | Hardcoded | Separated (overlay) |

TinaCMS's architecture is the most composable: the `isBody: true` field renders as the canvas; all other fields render as sidebar controls. `ui.component` allows swapping any field's renderer. `wrapFieldsWithMeta` provides consistent chrome for custom field components.

Sanity's "everything is a form field" approach is the outlier — body content has no privileged position. Powerful for structured content editing but antithetical to a writing-first editor.

**Decision triggers:**
- If metadata is schema-defined and stable → sidebar form (TinaCMS model) provides the best structured editing
- If writing is the primary activity → on-demand drawer (Ghost model) keeps the canvas clean
- If the sidebar needs extensibility for plugins/custom fields → WordPress's SlotFill / TinaCMS's `ui.component` patterns

---

### 3. Inline Frontmatter Block

**Finding:** Inline frontmatter blocks render raw YAML inside the editor canvas. The pattern is developer-oriented and suffers from poor discoverability for non-technical users.

**Evidence:** [evidence/inline-block-and-modal.md](evidence/inline-block-and-modal.md)

MDXEditor implements frontmatter as a Lexical `DecoratorNode` — a styled region with direct YAML text editing (no form fields). Collapsible to a single-line indicator. Typora renders frontmatter as a labeled collapsible code fence — collapsed by default, expanded shows syntax-highlighted YAML with parse-error validation on blur. Zettlr shows styled YAML with semantic highlighting but no collapse.

No inline-block implementation provides structured form fields — all expose raw YAML. The tension is fundamental: structured fields require knowing the schema, but inline blocks are valued precisely because they're schema-free.

**Decision triggers:**
- If the audience is developers who think in YAML → inline block is natural
- If non-technical users need to edit metadata → inline YAML is a barrier; structured fields (top-of-doc or sidebar) are required
- If the editor already has a source/WYSIWYG toggle → inline block in source mode + structured form in WYSIWYG mode covers both audiences (Obsidian's approach)

---

### 4. Settings Modal/Dialog

**Finding:** Modals and drawers hide metadata behind an interaction, creating a clean writing surface but reducing metadata completeness. Optional metadata in separate panels has materially lower completion rates than inline fields.

**Evidence:** [evidence/inline-block-and-modal.md](evidence/inline-block-and-modal.md)

GitBook uses a right-side drawer (not a true modal) with limited fields: page title, description, slug, visibility, cover image. Ghost uses a gear-icon-triggered drawer with more fields (tags, authors, SEO metadata, social card overrides) but demands focus — the editor dims. Blog platforms (Hashnode, Medium) use pre-publish modals that create a natural checkpoint but produce lower-quality metadata because authors rush through them.

CMS practitioner experience suggests optional fields in separate panels may have materially lower completion rates than fields visible inline alongside content (one practitioner estimate puts the gap at 30-50%, though no controlled study is cited).

**Decision triggers:**
- If metadata is edited infrequently and correctness matters more than completeness → modal/drawer works (e.g., SEO metadata reviewed before publish)
- If metadata completeness matters → inline visibility (top-of-doc or sidebar) is materially better
- A hybrid "summary strip + expandable form" bridges the gap: show 2-3 key fields inline, expand to full form on click

---

### 5. Field Type Affordances & Type Inference

**Finding:** Field type inventories range from 7 types (Obsidian) to 25+ (Notion). Among the surveyed products, type inference from existing YAML data is unique to Obsidian — all CMS tools require explicit schema definitions. Rich text in metadata values is only feasible with non-YAML storage.

**Evidence:** [evidence/field-type-affordances.md](evidence/field-type-affordances.md)

A practical type set for a markdown-native editor covers: **text** (string), **number**, **boolean** (toggle/checkbox), **date** (with optional time), **list** (array of strings, rendered as chips), **tags** (list with workspace-wide autocomplete), and **select/multi-select** (list with predefined options). This covers the usage patterns of Obsidian, TinaCMS, and Front Matter CMS.

Relation/reference fields are supported by Notion, TinaCMS, Sanity, and Keystatic, but they cannot round-trip losslessly through markdown. For markdown-native systems, wiki-links (`[[Page Title]]`) or relative paths in YAML are the natural representation.

Obsidian's type inference works from YAML value shapes: arrays → List, booleans → Checkbox, ISO dates → Date. The vault-wide property registry then tracks the "expected type" for each property name, flagging inconsistencies. YAML-ambiguous values (`yes`, `no`, `null`) are a known pain point — the YAML parser resolves them before inference can run.

**Decision triggers:**
- If the editor needs maximum type richness → Notion's model, but requires non-YAML storage for some types
- If YAML round-trip fidelity is required → limit to types that serialize cleanly: string, number, boolean, date (ISO 8601), arrays of strings
- If both technical and non-technical users share the workspace → inference-from-content + manual type correction (Obsidian model) avoids the schema bottleneck

---

### 6. Schema-Driven vs Freeform

**Finding:** Three models exist — schema-first (CMS tools), pure freeform (raw YAML), and hybrid "suggest, don't enforce" (Obsidian v1.4+). The hybrid model is the sweet spot for knowledge bases where content types evolve organically.

**Evidence:** [evidence/schema-vs-freeform.md](evidence/schema-vs-freeform.md)

Schema-first tools (TinaCMS, Sanity, Keystatic) guarantee type consistency and enable rich form UIs, but adding a field requires a code change — a deploy bottleneck. Pure freeform YAML produces key inconsistencies (`date` vs `Date` vs `created_at`), type confusion, and invisible typos. No discoverability of what properties exist across documents.

Obsidian v1.4+ introduced the hybrid: scan the vault, build a property registry from usage, autocomplete existing property names when adding new ones, infer types from values, flag inconsistencies — but never gate the user. Unknown/new properties are always allowed. This model works because content types in knowledge bases evolve organically — an editorial team discovering a need for `reviewedBy` shouldn't need to modify a schema config file.

No mainstream tool supports retroactive template application. Updating a template does not back-fill existing documents. Content types defined in CMS schemas or Notion database templates apply at creation time only.

**Decision triggers:**
- If content types are well-known and stable → schema-first provides the best editing experience and validation
- If content types evolve organically → hybrid model avoids schema bottleneck while providing consistency guardrails
- If the workspace has 100+ documents → the "All Properties" governance view (Obsidian's model) is essential to prevent property sprawl

---

### 7. Collaborative & Real-Time Considerations

**Finding:** Decomposing metadata to per-key Y.Map entries gives field-level merge semantics, which is superior to character-level CRDT merges on raw YAML text. Storing frontmatter as a single string (common today) gives only document-level LWW. No mainstream product shows field-level presence indicators for metadata.

**Evidence:** [evidence/collaborative-realtime.md](evidence/collaborative-realtime.md)

Notion uses per-property last-write-wins: concurrent edits to different properties merge cleanly; concurrent edits to the same property resolve by last-write-wins silently. Property renames and type changes are database-level operations with brief locks.

For a Y.js-based system, `Y.Map` gives per-key conflict resolution automatically. Storing frontmatter as a raw YAML string in a single Y.Map entry degrades to document-level LWW for the entire frontmatter block. Decomposing to per-key entries enables field-level merge. For nested values (arrays like tags), `Y.Array` nested inside the map preserves per-element merge semantics — concurrent tag additions by different users merge cleanly instead of conflicting.

Concurrent property type changes (User A changes type while User B edits value) are unresolved across all products. Notion sidesteps with database-level locks. The practical approach is LWW on type metadata with a validation warning on type/value mismatch.

Field-level presence indicators (showing who is editing which property) are technically straightforward with Y.js awareness but no product ships them. Document-level presence (avatar in header) is the state of the art.

**Decision triggers:**
- If metadata is stored as a single YAML string in a Y.Map entry → concurrent edits to any field conflict at the document level
- If metadata is decomposed to per-key Y.Map entries → field-level merge comes for free, but requires migration from string-based storage
- If tag arrays are stored as JSON strings → concurrent tag additions conflict; Y.Array nesting resolves this

---

## Pattern Selection Matrix

| Factor | Top-of-Doc Table | Sidebar Form | Inline Block | Modal/Drawer |
|--------|-----------------|-------------|-------------|-------------|
| Audience | General | CMS authors | Developers | General |
| Metadata completeness | High (visible) | High (visible) | Medium | Low (hidden) |
| Writing distraction | Medium | Low | Low-Medium (depends on collapse) | None |
| Schema flexibility | Hybrid possible | Schema-required | Maximum (raw YAML) | Usually fixed |
| Type safety | Form widgets | Form widgets | None (raw YAML) | Form widgets |
| Collaborative fit | Per-field merge | Per-field merge | Text-level merge | Per-field merge |
| Implementation complexity | Medium | High (schema DSL) | Low | Low-Medium |
| Best example | Obsidian Properties | TinaCMS | MDXEditor | Ghost |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Accessibility:** Keyboard navigation, screen reader behavior, and ARIA patterns for property editors are not well-documented across the surveyed products. No product publishes accessibility guidelines for their metadata editing UX.
- **Mobile/responsive:** How property tables and sidebar forms adapt on small screens was explicitly out of scope but matters for a cross-platform editor.

### Out of Scope (per Rubric)
- Implementation specifics for Open Knowledge (downstream design work)
- Detailed accessibility audit of specific products
- Mobile/responsive frontmatter editing UX

---

## References

### Evidence Files
- [evidence/top-of-document-property-table.md](evidence/top-of-document-property-table.md) — Notion, Obsidian, Craft, and 4 other products' property table implementations
- [evidence/sidebar-panel-form.md](evidence/sidebar-panel-form.md) — TinaCMS, Sanity, Front Matter CMS, WordPress, Ghost sidebar/panel patterns
- [evidence/inline-block-and-modal.md](evidence/inline-block-and-modal.md) — MDXEditor, Typora, Zettlr inline blocks + GitBook, Hashnode, Medium modals
- [evidence/field-type-affordances.md](evidence/field-type-affordances.md) — Cross-product field type inventory, inference mechanisms, rendering patterns
- [evidence/schema-vs-freeform.md](evidence/schema-vs-freeform.md) — Schema-first vs freeform vs hybrid approaches
- [evidence/collaborative-realtime.md](evidence/collaborative-realtime.md) — CRDT merge semantics, multiplayer behavior, presence patterns

### External Sources
- [Obsidian Properties announcement](https://medium.com/obsidian-observer/obsidians-new-properties-feature-brings-a-notion-like-experience-to-metadata-1436e57de373) — Obsidian Observer analysis of v1.4 Properties
- [MDXEditor frontmatter docs](https://mdxeditor.dev/editor/docs/front-matter) — MDXEditor frontmatter plugin documentation
- [TinaCMS custom fields](https://tina.io/docs/extending-tina/custom-field-components) — TinaCMS field extensibility documentation
- [Front Matter CMS panel docs](https://frontmatter.codes/docs/panel) — Front Matter CMS sidebar panel documentation
- [Obsidian Properties sidebar discussion](https://forum.obsidian.md/t/properties-panel-in-right-sidebar/71078) — Community discussion on the All Properties sidebar
