# Evidence: SilverBullet — structured attributes on markdown

**Dimension:** Backlink/wikilink architecture — SilverBullet
**Date:** 2026-04-12

---

## Key sources
- [SilverBullet — Frontmatter](https://silverbullet.md/Frontmatter)
- [SilverBullet — Space Lua](https://silverbullet.md/Space%20Lua)
- [DeepWiki — SilverBullet Object System and Indexing](https://deepwiki.com/silverbulletmd/silverbullet/6.2-object-system-and-indexing)
- [DeepWiki — SilverBullet Queries and Templates](https://deepwiki.com/silverbulletmd/silverbullet/7.4-queries-and-templates)
- [github.com/silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet)

---

## Findings

### D1: Link format & representation
**Confidence:** CONFIRMED

Plain markdown files on disk (one `.md` per page, folder-based "Space"). `[[Page]]` wikilinks + standard CommonMark.

Additional first-class syntax layered on top (all valid markdown — other tools can read the files):
- `#tag` hashtags
- YAML frontmatter blocks
- Fenced code blocks of type `data` or `` ```#people `` for declarative object records
- `space-lua` fenced blocks for workspace-wide scripts
- `${luaExpression}` live-preview expressions inline
- Query code blocks (`query[[ ... ]]` via Lua Integrated Query)

### D2: Link semantics / typing
**Confidence:** CONFIRMED — **most structured link-and-attribute model of mainstream markdown tools**

- **Frontmatter attributes** indexed per page (custom keys including dot-notation like `attribute.subAttribute`); reserved: `displayName`, `aliases`, `tags`
- **Tags as types.** Any `#tag` becomes queryable type; fenced `` ```#people `` blocks declare tagged objects with attributes. Tag is effectively a lightweight class.
- **Inherited tags (ilinks).** `updateITags()` merges direct tags with tags inherited through backlinks → transitive tag inheritance. A page linked from `#project` can inherit project-ness for query purposes.
- **Lua Integrated Query (LIQ)** filters/aggregates objects by attributes: `from f = tags.feature where f.tag == 'page' order by f.awesomeness desc`. Closer to Notion database model than Obsidian untyped hashtags.

Links themselves remain `[[Page]]` (untyped), but because pages carry typed attributes and tag-classes, the link graph becomes queryable as structured data.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

Backlinks are one category of indexed object. Indexing pipeline captures link/ilink objects keyed by `[indexKey, type, ...key, page]`. Backlinks surface through:
- Standard backlinks panel per page
- **Live queries** — authored query blocks filtering `tags.link where target == "CurrentPage"` render backlinks inline, re-executing on every space change. No separate "backlinks view" needed; user composes it.

Same mechanism powers any indexed-object view — tasks, headers, data blocks, custom tags all are queries over the object index.

### D4: Transclusion
**Confidence:** CONFIRMED

**No classical transclusion** (no "embed page X here"). Instead generalizes transclusion into **live queries with `render` templates**:

```
#query page where type = "plug" render [[template/plug]]
```

Query runs against IndexedDB object index, passes each result through a Handlebars template page, inlines rendered markdown in live preview. `${luaExpression}` same for single expressions.

More powerful than static block-embed because the "source" is a query, not a fixed block reference. **Query output is live-rendered only; never written back into markdown file** — truth stays in source markdown + frontmatter/tags.

### D5: Index / storage model
**Confidence:** CONFIRMED

- **Authoritative store:** markdown files (filesystem on server mode, or bucket/object store)
- **Index store:** **IndexedDB in the client** (not SQLite). Indexing runs client-side per upstream docs and DeepWiki architecture writeup. (The `.silverbullet.db*` files may be a deployment-specific artifact or older server-side variant.)
- **Indexing pipeline:** `page:index` event fans out to parallel extractors (tag, header, data-block, paragraph, frontmatter, link). Each object write emits main index key `["idx", tag, cleanedRef, pageName]` + reverse page key `["ridx", pageName, tag, cleanedRef]` for fast per-page invalidation. Batch size 3 pages per message since v2.4.0 (~2× throughput).
- **Regenerability:** index derived from markdown; deleting/rebuilding routine. Stated design principle: "Truth remains in markdown — all indexed data has a representation in markdown text."

### D6: ML-augmented linking
**Confidence:** CONFIRMED (none)

None in core. No embeddings, no LLM link suggestion, no semantic search upstream. Community plugs could add LLM features, but core is deliberately ML-free — "intelligence" comes from Space Lua scripting and structured queries.

---

## Gaps / follow-ups
- The `.silverbullet.db*` file artifacts mentioned in prior reports may be from older SilverBullet versions; current upstream is IndexedDB-only. Discrepancy not fully resolved.
- Space Lua performance at scale not tested
