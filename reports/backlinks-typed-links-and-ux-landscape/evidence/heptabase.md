# Evidence: Heptabase — spatial canvas + cards

**Dimension:** Backlink/wikilink architecture — Heptabase (canvas-centric)
**Date:** 2026-04-12

---

## Key sources
- [Fundamental Elements — Heptabase Wiki](https://wiki.heptabase.com/fundamental-elements)
- [User Interface Logic — Heptabase Wiki](https://wiki.heptabase.com/user-interface-logic)
- [Heptabase Newsletter: Backlinks from Everything (2024-03-23)](https://wiki.heptabase.com/newsletters/2024-03-23)
- [Heptabase Newsletter: Deep Links (2025-05-07)](https://wiki.heptabase.com/newsletters/2025-05-07)
- [Export sustainability — Heptabase Help Center](https://support.heptabase.com/en/articles/10364279-how-sustainable-is-heptabase-can-i-easily-export-my-data-and-move-on)
- [heptabase-mcp data model spec (community)](https://github.com/LarryStanley/heptabase-mcp/blob/main/SPECIFICATION.md)

---

## Findings

### D1: Link format & representation
**Confidence:** CONFIRMED

Two distinct link modalities:

**Semantic links (inside card content):** `@` opens mention picker for another card, date, or whiteboard. Card-ID-backed inline references. Produce block-level backlinks.

**Spatial/visual links (on whiteboard):** **Arrows** drawn between objects. First-class `Connection` record with own ID, endpoints, direction, color, line style.

Community MCP spec (reflects real export schema):

```ts
Card { id, title?, content (JSON rich text), spaceId, isTrashed }
Whiteboard { id, name, spaceId, isTrashed }
CardInstance { id, cardId, whiteboardId, x, y, width, height, color }
Connection {
  id, whiteboardId,
  beginId, beginObjectType,
  endId, endObjectType,
  color, lineStyle, type
}
```

**Links are split by modality:** semantic in card content (like Notion mentions, ID-based); spatial as typed `Connection` records scoped to a specific whiteboard.

### D2: Link semantics / typing
**Confidence:** CONFIRMED

- **Card-to-card mentions in text:** untyped (like Notion inline mentions). Create backlinks.
- **Whiteboard arrows:** mildly typed — `Connection` has `type`, `lineStyle`, `beginObjectType`/`endObjectType`. Semantically still "connects to" — no schema-enforced relation types. Users layer meaning via color/style conventions.
- **Tags:** secondary classification, not a link type
- **Sections:** organizational containers on whiteboards; can have backlinks, be link endpoints

**No analog to Notion database relations** (no typed schema-level many-to-many with guaranteed inverse). Knowledge graph emergent from @-mentions + visual arrows rather than schema-defined.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

Info panel per card surfaces:
- **Mentions (semantic backlinks)** with surrounding context
- **Whiteboards containing this card** (via `CardInstance` records)
- **Arrows pointing to or from this card** — spatial graph as first-class backlink channel

March 2024 update: backlinks surface from Text Properties, Text Elements, Mindmap Text Nodes, Arrows, and Sections.

**Spatial proximity as semi-link:** card position via `CardInstance.x/y` is meaningful and recoverable. Same card on multiple whiteboards can have different positions — the `CardInstance` records "this card appears here at (x, y)".

**Journal auto-linking:** journals are a card type with date-anchored backlinks; `@`-mentioning a date surfaces on that journal.

**Deep links (May 2025):** to any whiteboard, card, block, tab, or section.

**The whiteboard itself IS the interactive graph view.** No separate "global graph" like Obsidian's force-directed visualization. Product philosophy: hand-curate spatial graphs.

### D4: Transclusion
**Confidence:** CONFIRMED — **CardInstance model IS transclusion, cleanly implemented**

- `Card` owns content (one source of truth in library)
- `CardInstance` is a *placement* on a specific whiteboard — positional metadata only (`cardId`, `whiteboardId`, `x`, `y`, `width`, `height`, `color`)
- Same card can have N instances across N whiteboards simultaneously
- Editing card updates every instance instantly
- Deleting instance removes placement; card remains in library

**Cleaner than Notion's synced blocks:** Heptabase separates content identity (Card) from spatial placement (CardInstance) structurally → transclusion is the default rather than opt-in gesture (`⌥+drag`). Every card dropped on a whiteboard is already a "synced block" equivalent.

### D5: Index / storage model
**Confidence:** CONFIRMED

- **IDs:** every Card, Whiteboard, CardInstance, Connection has stable string ID. Titles mutable and non-load-bearing.
- **Storage:** local-first app with cloud sync. Cards' content stored as **JSON string of rich text** (not Markdown at rest). Whiteboard state = `CardInstance` + `Connection` records bound by `whiteboardId`.
- **Rename stability:** links reference IDs → rename propagates.
- **Spaces:** `spaceId` scopes to workspace. `isTrashed` for soft deletion.
- **Shared card database across all Apps** (Whiteboards, Journal, Tag View, etc.) — library is single index; each "App" is a different query/projection.

### D6: Markdown export fidelity
**Confidence:** CONFIRMED

Native Markdown export (Settings → Backup & Sync → Export Now):
- All cards as `.md` files
- Whiteboards and mindmaps
- Highlights, tags, card properties
- Assets (PDFs, images, audio, video) as separate files

**Fidelity better than Notion for prose content** (cards map cleanly to Markdown). But **Markdown cannot represent spatial layout** — whiteboard geometry, arrows, colors, and CardInstance positions are lost, serialized to sidecar, or exportable as Obsidian Canvas (via community tools).

Company explicitly markets export sustainability: "you can easily export your data and move on" — positioning against lock-in.

---

## Gaps / follow-ups
- Heptabase's internal storage format (rich-text JSON schema) is not documented in detail externally; findings from community MCP spec
- Roadmap mentions PDF, HTML, Docx, Latex, image export but timelines not confirmed
