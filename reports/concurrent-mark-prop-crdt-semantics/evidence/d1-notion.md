# Evidence: D1 — Notion mark composition and block attribute merging

**Dimension:** D1
**Date:** 2026-04-17
**Sources:** Notion's own data-model post, Notion Backups operational guide, HN discussion thread

---

## Key pages referenced

- https://www.notion.com/blog/data-model-behind-notion — Notion's own description of block schema
- https://news.ycombinator.com/item?id=27200177 — HN discussion with Notion engineer comments
- https://notionbackups.com/guides/notion-offline-mode — Operational description of offline-merge behavior (3P source)

---

## Findings

### Finding: Notion blocks are JSON objects with a block-scoped `Properties` map, identified by UUIDv4

**Confidence:** CONFIRMED
**Evidence:** https://www.notion.com/blog/data-model-behind-notion

Each Notion block is a JSON record keyed by UUIDv4, with a `type` field determining rendering and a `properties` map (the most common property is `title` which holds rich text). Blocks also carry `content` (ordered list of child block IDs) and `parent` references. The text inside `title` is itself a rich-text array of `[text, annotations]` tuples — NOT a character-level CRDT.

### Finding: Notion's sync is OT-leaning, centralized-server-ordered — CRDT is only a small part, and only for text

**Confidence:** INFERRED (third-party description + Notion HN comments, 2021)
**Evidence:** https://notionbackups.com/guides/notion-offline-mode ("Notion's CRDT (Conflict-free Replicated Data Type) system handles text merge conflicts well... but non-text properties (select fields, dates, relations) don't merge — only one version survives.")

> "text changes merge automatically thanks to Notion's CRDT system, but non-text properties (select fields, dates, relations) don't merge — only one version survives."

This confirms that **Notion does not unify marks + text + attributes into a single CRDT**. The text body of a paragraph merges via text-level CRDT; non-text properties resolve via last-writer-wins.

### Finding: Annotations (Notion's equivalent of "marks") are per-span, stored structurally — not as inline markdown chars

**Confidence:** CONFIRMED
**Evidence:** https://www.notion.com/blog/data-model-behind-notion; Notion API reference uses `rich_text` array of objects with `annotations: {bold, italic, strikethrough, ...}`.

The `rich_text` shape in the Notion API is an array of spans: `[{text:{content:"The "}, annotations:{}}, {text:{content:"fox"}, annotations:{bold:true}}, ...]`. Bold is an attribute on a SPAN OBJECT, not a pair of `**` chars in a shared text string.

### Finding: Non-text block attrs (callout color, toggle state, page icon) resolve LWW

**Confidence:** INFERRED (from Notion backup 3P docs; verifiable via offline-edit probes)
**Evidence:** https://notionbackups.com/guides/notion-offline-mode

"Only one version survives" — classic last-writer-wins for structured attrs.

---

## Implications

- Char-RGA mark composition is NOT shipped in Notion.
- Marks are per-span structured annotations, not sequence characters.
- Block attributes are LWW registers, not char-merged.

---

## Gaps / follow-ups

- Notion's exact wire protocol and merge code are not open-source; the OT-leaning description comes from a mix of HN engineer comments and reverse-engineering.
- No public reproducer for concurrent Notion bold+italic toggle behavior beyond operational observation.
