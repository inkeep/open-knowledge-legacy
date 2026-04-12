# Evidence: Notion (deeper than prior reports)

**Dimension:** Backlink/wikilink architecture — Notion
**Date:** 2026-04-12

---

## Key sources
- [Inside Notion's Data Model (Notion Blog)](https://www.notion.com/blog/data-model-behind-notion)
- [Designing Synced Blocks (Notion Blog)](https://www.notion.com/blog/designing-synced-blocks)
- [Links & Backlinks — Notion Help](https://www.notion.com/help/create-links-and-backlinks)
- [Rich Text / Mention reference — Notion Developers](https://developers.notion.com/reference/rich-text)
- [Notion Export Is Broken — Unmarkdown](https://unmarkdown.com/blog/notion-export-broken)

---

## Findings

### D1: Link format & representation
**Confidence:** CONFIRMED

Three equivalent surface syntaxes resolving to the same underlying mention primitive:
- `@` + page name (canonical)
- `[[` + page name (added later for Roam/Obsidian users)
- `+` + page name (alternate shortcut; creates new sub-page)

All produce the same `mention` object in Notion's rich-text array. Each rich-text span is either `text` or `mention`. Page mention payload:

```json
{
  "type": "mention",
  "mention": { "type": "page", "page": { "id": "<uuid-v4>" } },
  "plain_text": "<resolved title>",
  "href": "<url>"
}
```

**Critical property:** mention stores a UUID, not a title. `plain_text` is a rendered projection of the current title at serialization time — not load-bearing.

Mention subtypes: `page`, `database`, `user`, `date`, `link_preview`, `template_mention`.

**`/link` slash menu is different:** creates a **block-level** `link_to_page` block (not an inline mention).

### D2: Link semantics / typing
**Confidence:** CONFIRMED

Three qualitatively different link primitives:

1. **Inline mentions** (untyped) — navigational hyperlinks. No schema, no inverse, no constraints.
2. **Database relations** (typed, schema-level) — a *relation property* column whose type is "pointer to rows in another database (or same one for self-relations)." Configurable as **one-way** or **two-way synced**. Cardinality `1 page` vs `No limit` → 1:1, 1:N, N:M. **This is the typed link** — schema-enforced, filterable, sortable.
3. **Rollups** — derived columns traversing a relation and aggregating. Not links themselves but consumer views.

**Synced blocks** are a different axis (see D4) — not a link, but shared identity.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

Backlinks panel at top of every page, collapsed by default:
- **Generated only from `@`-mentions** (and `[[`/`+` which compile to mentions). Database relations do NOT appear in backlinks panel — they surface in the database row's relation column on target side.
- **Permission-gated:** respects page ACLs
- **Block-level granularity:** mentions can point at sub-blocks
- **Customizable per page:** Always show / Show on hover / Off

**No interactive graph view natively** — long-requested. Third-party tools fill gap via API.

### D4: Transclusion
**Confidence:** CONFIRMED

Three distinct sharing mechanisms:
- **Synced blocks** — true transclusion. One block (or group) with stable identity, rendered in N locations. Edit anywhere → update everywhere. Colored "halo" outlines synced instances; hover reveals "N other locations" with clickable paths.
- **Page embeds** — inline rendering of another page or database view. Embed is a *window*, not a copy.
- **Linked database views** — database rendered with own filters/sorts on a host page, pointing at source database elsewhere.

**Key distinction:** synced blocks let you edit inline and propagate; classic embeds send you to source. Design intent (per Notion's blog): Ted Nelson-style transclusion with a back-path.

### D5: Index / storage model
**Confidence:** CONFIRMED

**Everything is a block** — paragraphs, images, pages, databases, toggles, columns, workspace root. Each block:
- `id` — random UUID v4
- `type` — discriminates rendering
- `properties` — type-specific payload (`title` rich-text array universal; databases add arbitrary user-defined columns)
- `content` — **ordered array of child block IDs** (the render tree)
- `parent` — upward pointer for **permission inheritance only** (not rendering)

Mentions reference target's UUID → **renaming a page propagates instantly everywhere.** No title-based resolution.

**Storage:** PostgreSQL. Transactions batched client-side, serialized to JSON, POSTed to `/saveTransactions`, validated with before/after snapshots. Real-time sync: WebSocket → MessageStore fan-out. Block table was sharded ("herd of elephants" migration) past single-Postgres capacity.

Parent pointer solves permission ambiguity for synced blocks: content arrays may reference block from multiple locations, but exactly one parent governs ACL.

### D6: Markdown export fidelity
**Confidence:** CONFIRMED — **deeply lossy by design**

- **Synced blocks:** silently dropped
- **Database relations:** gone; databases export as CSV with relations flattened to comma-separated title list (no IDs, no inverse)
- **Rollups:** gone (computed values only, as text)
- **Filtered/grouped views:** gone (CSV is raw rows)
- **Toggles:** raw HTML `<details>/<summary>` (not standard Markdown)
- **Embeds / colors / callout styling:** dropped or approximated
- **Page mentions:** plain Markdown links; **UUID stability lost** once outside Notion

**Round-trip Notion → MD → Notion destroys the relational graph.** Export is for archival text only; Notion's import cannot reconstitute databases, relations, or synced blocks from Markdown.

---

## Gaps / follow-ups
- Notion's internal block schema is not publicly documented beyond the developer API surface; some details inferred from behavior
