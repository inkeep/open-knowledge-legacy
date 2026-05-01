# Evidence: Top-of-Document Property Table

**Dimension:** Top-of-document property table (Notion, Obsidian, Craft)
**Date:** 2026-04-24
**Sources:** Notion product (training data through early 2025), Obsidian v1.4+ Properties feature, Craft, Linear, Capacities, Logseq, Tana

---

## Key products referenced

- Notion — originator of the database property table pattern
- Obsidian — markdown-native implementation (v1.4+, mid-2023)
- Craft — lightweight page-level properties
- Linear — sidebar variant of the pattern
- Capacities — Notion-style properties for "objects"
- Logseq — `key:: value` syntax, per-page properties
- Tana — node-level fields via supertag system

---

## Findings

### Finding: Notion's property table is database-schema-level, not per-document
**Confidence:** CONFIRMED
**Evidence:** Notion product behavior, official documentation

Properties render as a vertical key-value table between the page title and the document body. Each row: property name (left) + value cell (right). No visible borders — rows separated by subtle horizontal lines on hover.

- "+" button below the last property row to add new properties
- Click property name label to rename, change type (with lossy conversion warning), duplicate, or delete
- ~20+ field types: Text, Number, Select, Multi-select, Status, Date, Person, Files & media, Checkbox, URL, Email, Phone, Formula, Relation, Rollup, Created time/by, Last edited time/by, Unique ID, Button
- Configurable visible/collapsed split — pages with many properties show a configurable number of "visible" properties with the rest behind a chevron ("N more properties")
- Standalone pages (not in a database) have NO property table — only database pages get it

**Implications:** The database-schema-level design means metadata is a collective concern. Adding a property to one page adds it to every page in the database. This works for structured content collections but not for heterogeneous knowledge bases.

### Finding: Obsidian Properties is the markdown-native reference implementation
**Confidence:** CONFIRMED
**Evidence:** Obsidian v1.4+ release, community documentation, Obsidian Observer analysis

Starting v1.4 (mid-2023), renders YAML frontmatter as structured "Properties" form at the top of the note, below the title, above the body. Raw `---` fences replaced by styled key-value rows.

- Field types: Text, List (tag-like chips), Number, Checkbox, Date, Date & time, Tags (merges into global tag namespace). Notably fewer than Notion: no Select, no Relation, no Formula
- Type inference from YAML values: `true`/`false` → Checkbox, arrays → List, ISO dates → Date
- Global "All Properties" sidebar: lists every property name across the vault, its type, and usage count. Governance surface for renaming, merging duplicates, setting canonical types
- Unknown properties rendered as plain text with subtle indicator — values preserved losslessly
- Three-way view toggle: Source (raw YAML) / Live Preview (form widgets) / Reading mode
- Properties are per-file (stored in each `.md`), but type assignments are vault-global (stored in `.obsidian/types.json`)

**Implications:** The "suggest, don't enforce" model with vault-wide property registry is the closest analog to what a collaborative markdown editor needs. Per-file presence + global type suggestions balances flexibility and consistency.

### Finding: Collapse behavior is essential at scale
**Confidence:** CONFIRMED
**Evidence:** Both Notion and Obsidian implementations

Both Notion and Obsidian hide properties behind a disclosure when there are many. 3-5 visible + "show more" is the standard threshold. Without collapse, the property table pushes body content below the fold, degrading the writing experience for documents with extensive metadata.

### Finding: Bidirectional projection (form ↔ raw YAML) is non-negotiable for markdown tools
**Confidence:** CONFIRMED
**Evidence:** Obsidian Properties design

Users must trust the form never corrupts their frontmatter. Obsidian's approach: render the form in Live Preview, keep raw YAML as source-of-truth in Source mode. The form is a bidirectional projection — edits in either surface persist.

---

## Cross-product comparison

| Product | Schema scope | Property types | Collapse | Source toggle |
|---------|-------------|---------------|----------|---------------|
| Notion | Per-database | ~20+ types | Yes (configurable) | N/A |
| Obsidian | Per-vault (type), per-file (presence) | 7 types | Yes | Source ↔ Properties |
| Craft | Per-page | 3 types (text, date, select) | N/A (panel-based) | N/A |
| Linear | Per-workspace | Custom per-issue type | N/A (sidebar) | N/A |
| Logseq | Per-page | Plain text + link/tag awareness | No | No |
| Tana | Per-supertag | ~8 types | No | No |

---

## Gaps / follow-ups

- Notion's property table behavior under multiplayer (concurrent property schema changes) — covered in D7
- Accessibility patterns for property table keyboard navigation — not deeply investigated
