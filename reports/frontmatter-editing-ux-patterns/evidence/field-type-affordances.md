# Evidence: Field Type Affordances & Type Inference

**Dimension:** Field types, rendering patterns, and type inference mechanisms
**Date:** 2026-04-24
**Sources:** Notion, Obsidian Properties, TinaCMS, Sanity, Keystatic, Front Matter CMS, Contentlayer, Anytype

---

## Findings

### Finding: Field type inventories vary from 7 types (Obsidian) to 25+ (Notion)
**Confidence:** CONFIRMED
**Evidence:** Product documentation for each tool

| Field Type | Notion | Obsidian | TinaCMS | Sanity | Keystatic | Front Matter CMS |
|---|---|---|---|---|---|---|
| Text/String | Yes | Yes | `string` | `string` | `text` | Yes |
| Number | Yes | Yes | `number` | `number` | `integer`, `number` | Yes |
| Boolean | Yes | Yes | `boolean` | `boolean` | `checkbox` | Yes |
| Date | Yes | Yes (ISO 8601) | `datetime` | `date`, `datetime` | `date`, `datetime` | Yes |
| Select | Yes | No | `string` + `options` | `string` + `options` | `select` | Choice field |
| Multi-select | Yes | No (list of text) | `string[]` + `options` | `array` of strings | `multiselect` | Tags field |
| Relation | Yes (bidirectional) | No native | `reference` | `reference` | `relationship` | No |
| Image/File | Yes | No (text path) | `image` | `image`, `file` | `image`, `file` | Image picker |
| Formula/Computed | Yes | No (Dataview plugin) | No | No | No | No |
| Object/Nested | No | No | `object` | `object` | `object` | No |
| Slug | No | No | No | `slug` | `slug` | `slug` |

### Finding: Type inference is unique to Obsidian — all CMS tools are schema-first
**Confidence:** CONFIRMED
**Evidence:** Cross-product comparison

- **Obsidian Properties (v1.4+):** Infers from YAML values. String → Text, array `[a, b]` → List, `true`/`false` → Checkbox, ISO date → Date/DateTime. Heuristic is value-shape-based, not key-name-based. Type assigned vault-wide; once set, all documents with that property name get the same type.
- **Correction flow:** User opens Settings > Properties, finds property, changes type. Vault-wide change. No per-document type override.
- **Pain point:** YAML-ambiguous values (`yes`, `no`, `null`) get misinterpreted by the YAML parser before Obsidian's type inference even runs.
- **All CMS tools:** Schema-first. Developer declares types. TinaCMS cannot even parse MDX without a complete field schema.

**Implications:** For a collaborative markdown editor, inference-from-content (Obsidian model) is more appropriate than schema-first (CMS model) because content types evolve organically.

### Finding: Relation/reference fields cannot round-trip through markdown
**Confidence:** CONFIRMED
**Evidence:** Cross-product behavior

Every tool that supports typed references (Notion, Sanity, Keystatic, TinaCMS) serializes them differently in markdown/YAML:
- Notion: flattened to comma-separated title text on CSV export (lossy)
- TinaCMS: collection-scoped string identifier in YAML
- Keystatic: three flavors — `relationship`, `multiRelationship`, `pathReference` (all string-based)
- Sanity: `reference` with type constraints, supports weak references

**Implications:** For a markdown-native system, relations should be represented as wiki-links or relative paths in YAML, not opaque IDs.

### Finding: Only Notion does colored tag pills natively
**Confidence:** CONFIRMED
**Evidence:** Cross-product comparison

- **Notion:** Multi-select renders as inline colored pills, ~10 color palette, auto-assigned, manually changeable. Autocomplete from database column values.
- **Obsidian:** Plain text chips, no color. Autocomplete vault-wide.
- **CMS tools:** Plain text or checkboxes, no color coding. Options predefined in schema.
- **Front Matter CMS:** Removable pills, no color. Autocomplete project-wide.

### Finding: Date range support is Notion-only
**Confidence:** CONFIRMED
**Evidence:** Cross-product comparison

Only Notion supports date ranges natively (start + optional end date with toggle). All other tools model ranges as two separate date fields. Timezone handling: Notion follows workspace setting; Obsidian stores naive datetime; Sanity stores ISO 8601 with timezone offset.

### Finding: Rich text in metadata is only feasible with non-YAML storage
**Confidence:** CONFIRMED
**Evidence:** Cross-product comparison

- **Notion:** "Title" and "Text" property types support inline rich text (bold, italic, links, code, color, mentions). Stored as rich text array format.
- **Sanity:** `block` (Portable Text) fields can be metadata. Serialized as PT JSON.
- **All YAML-based tools:** No. YAML scalars are plain strings. No standard way to represent rich text in YAML values. Markdown-in-YAML-string is technically possible but no tool parses it.

**Implications:** A YAML-backed frontmatter editor should not attempt rich text in metadata values. Keep metadata values as plain strings, numbers, dates, and arrays of strings.

### Finding: Vault-wide / collection-wide autocomplete for tags is expected
**Confidence:** CONFIRMED
**Evidence:** Universal presence across all tools surveyed

Every tool with tag/select fields provides autocomplete from existing values. Scope varies: vault-wide (Obsidian), database-column-wide (Notion), collection-wide (CMS tools), project-wide (Front Matter CMS).

---

## Gaps / follow-ups

- Computed/formula fields — only Notion and Contentlayer support natively; Obsidian uses Dataview plugin as workaround
- Field ordering/grouping UI — how products let users reorder or group properties visually
