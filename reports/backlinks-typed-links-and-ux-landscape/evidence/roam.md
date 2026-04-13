# Evidence: Roam Research

**Dimension:** Backlink/wikilink architecture — Roam
**Date:** 2026-04-12

---

## Key sources
- [Zsolt — Deep Dive Into Roam's Data Structure](https://www.zsolt.blog/2021/01/Roam-Data-Structure-Query.html)
- [Zsolt — My Adventures with Roam.JSON](https://www.zsolt.blog/2020/12/my-adventures-with-roamjson.html)
- [David Bieber — Roam's JSON Export Format](https://davidbieber.com/snippets/2020-04-25-roam-json-export/)
- [David Bieber — Datalog Queries for Roam](https://davidbieber.com/snippets/2020-12-22-datalog-queries-for-roam-research/)
- [RoamResearch-official-help mirror — Page References](https://github.com/MatthieuBizien/RoamResearch-offical-help/blob/master/formatted/Page%20References.md)
- [Roam-Research/datalevin — Roam's OSS Datalog DB](https://github.com/Roam-Research/datalevin)
- [Discourse Graph Extension Grammar](https://oasis-lab.gitbook.io/roamresearch-discourse-graph-extension/fundamentals/the-discourse-graph-extension-grammar)
- [@roamresearch — markdown link aliasing to block UIDs](https://x.com/roamresearch/status/1226707275823206401)
- [Ness Labs — Pages, tags, attributes in Roam](https://nesslabs.com/pages-tags-attributes-roam-research)

---

## Findings

### D1: Link format & representation
**Confidence:** CONFIRMED

Three primary link syntaxes, all stored as structured datom edges (not text):
- `[[Page Name]]` — canonical page-link
- `#tag` / `#[[Multi Word Tag]]` — "Tags are just Page References" (official help)
- `((block-uid))` — block-level reference; UID is a 9-char alphanumeric string assigned at block creation and stable thereafter
- Aliases: `[display]([[Target]])` and `[display](((uid)))`

Underlying representation: the raw text stays in `:block/string` as literal `[[Alpha Beta]]`, AND a datom is asserted on `:block/refs` pointing from the block entity to the page entity. Pages are distinguished from blocks by having a `:node/title` attribute.

**Export fidelity, ranked:**
- **EDN** — highest fidelity; native Clojure format; only format preserving block-level references
- **JSON** — pages with children; refs only in literal `[[...]]`/`((...))` inside `string` fields; page UIDs not exported
- **Markdown** — lossy; block-level refs not preserved

### D2: Link semantics / typing
**Confidence:** CONFIRMED

**Attributes** are Roam's native typed-link primitive:
- Syntax: `AttributeName:: value` at block start
- The attribute name becomes a page; navigating to it shows all blocks using it
- Implementation: parsed at render/query time from `:block/string` — not a distinct datom type

**No first-class typed-edge metadata.** The community convention for "this link CONTRADICTS that link" is to encode it inline in text (`Contradicts:: [[ClaimA]] [[ClaimB]]`). Extensions like Discourse Graph layer conventions on top but are not core Roam.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

Every page has two panels:
- **Linked References** — aggregates every block whose `:block/refs` includes this page. Shows the full referring block + parent breadcrumb. Editable in place.
- **Unlinked References** — string-match the page title (and aliases) against all block text without a formal reference. One-click "Link" upgrades.

Filter chips (include/exclude on co-occurring pages/tags), collapse toggle, expand-to-children.

**Graph Overview:** 2D force-directed view, node size by word count, filter by tag inclusion/exclusion. Per-page mini-graph accessible from each page.

### D4: Transclusion
**Confidence:** CONFIRMED

Two distinct mechanisms:
- `((block-uid))` — **read-only inline render** of target block. Link that renders as content.
- `{{embed: ((block-uid))}}` — **editable in-place**, propagates bidirectionally to source AND every other embed site. This is true transclusion.
- `{{embed: [[Page]]}}` — embeds page but is NOT editable inline (acknowledged asymmetry with block embed)

### D5: Index / storage model
**Confidence:** CONFIRMED

Datomic-style EAVT (entity-attribute-value-transaction). Every block and page is an entity. Datascript (ClojureScript Datalog) exposed as `window.roamAlphaAPI`.

Key attributes: `:block/uid`, `:node/title`, `:block/string`, `:block/page`, `:block/parents`, `:block/children`, `:block/order`, `:block/refs`, `:create/time`, `:create/email`, `:edit/time`, `:edit/email`.

**`:block/refs` IS the backlink index.** Entity-id-based, O(1) lookup.

**Rename propagation:** `[[Alpha]]` stored as reference to page entity (by entity-id, not title string). Renaming is a one-datom update of `:node/title`. Every referring block auto-resolves to new title. The literal text in `:block/string` still contains `[[Old Name]]` until Roam's rewrite pass catches it, but the logical link stays intact.

### D6: ML-augmented linking
**Confidence:** CONFIRMED

**None in core.** All links are author-created. The only "recommendation" surface is Unlinked References, which is deterministic case-insensitive substring matching — no embeddings, no semantic similarity. Roam's product philosophy treats the manual act of linking as the cognitive work itself.

---

## Gaps / follow-ups
- Namespace support in Linked/Unlinked References has known gaps ([issue #323](https://github.com/Roam-Research/issues/issues/323))
- Attribute parser aggressively treats any colon-prefix as attribute ([issue #413](https://github.com/Roam-Research/issues/issues/413))
