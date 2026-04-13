# Evidence: TiddlyWiki

**Dimension:** Backlink/wikilink architecture — TiddlyWiki (transclusion-first)
**Date:** 2026-04-12

---

## Key sources
- [tiddlywiki.com — Introduction](https://tiddlywiki.com/static/TiddlyWiki.html)
- [tiddlywiki.com — Tiddlers](https://tiddlywiki.com/static/Tiddlers.html)
- [tiddlywiki.com — Tiddler Fields](https://tiddlywiki.com/static/TiddlerFields.html)
- [tiddlywiki.com — Tiddler Files](https://tiddlywiki.com/static/TiddlerFiles.html)
- [tiddlywiki.com — Linking in WikiText](https://tiddlywiki.com/static/Linking%20in%20WikiText.html)
- [tiddlywiki.com — Transclusion](https://tiddlywiki.com/static/Transclusion.html)
- [tiddlywiki.com — Story River](https://tiddlywiki.com/static/Story%20River.html)

---

## Findings

### D1: Link format & representation
**Confidence:** CONFIRMED

Wiki-text syntax:
- `[[Tiddler Title]]` — plain link
- `[[Displayed|Target]]` — aliased display
- `CamelCase` auto-links; `~Camel` suppresses
- External: `[[TW5|https://tiddlywiki.com/]]`, `[ext[Open|index.html]]`

**Dual storage mode:**
- **Single-file HTML** (classic): all tiddlers serialized into one self-contained HTML, embedded as JSON in `<script>` tag
- **Node.js mode**: individual text files on disk — `.tid`, `.meta`, `.tiddler`, or `.json` formats

A tiddler is "a list of uniquely named values called fields"; only required field is `title`.

### D2: Link semantics / typing
**Confidence:** CONFIRMED

Standard fields: `title`, `text`, `modified`, `modifier`, `created`, `creator`, `tags`, `type`, `list`, `caption`.

**Arbitrary custom fields are first-class** (post-v5.2.0). User-defined metadata sits alongside standard fields.

**No dedicated typed-link primitive.** But custom fields + filter language approximate typed relations:
- Set `prerequisite-of: Some Tiddler` on a tiddler
- Query `[field:prerequisite-of[Some Tiddler]]` retrieves the edge
- **The filter language, not the link syntax, carries the type**

Tags also form a typed-ish relation via `[tag[mechanism]]`.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

**Backlinks tab** on tiddler info panel — tiddlers linking to this one. Filter operator `backlinks[]`.

**Story River** (distinctive): "the sequence of tiddlers in the main column of the display." Opening a link *appends* the target to the story river rather than navigating away. Users see a vertical stack of open tiddlers simultaneously. Hover previews are less critical — the real affordance is "open it next to the current one."

### D4: Transclusion
**Confidence:** CONFIRMED — **core primitive, not add-on**

Central to TiddlyWiki's design. Syntax:
- `{{TiddlerTitle}}` — transclude body
- `{{TiddlerTitle!!field}}` — transclude single field
- `{{!!field}}` — transclude field of current tiddler
- `{{TiddlerTitle||TemplateTitle}}` — transclude through template
- `{{{ [filter] }}}` — **filter transclusion**: transclude every matching tiddler

Filter form is the headline feature. `{{{ [tag[mechanism]] }}}` emits a `$list` widget — the transclusion is a **live query**. Any tiddler added later that matches the filter automatically appears in rendered output.

Updates reactively: source tiddler change → every transclusion re-renders.

Contrast with Obsidian's `![[embed]]`: Obsidian's embed is title-addressed and static; TiddlyWiki's `{{{...}}}` is a query across the whole wiki.

**Editable in place:** `{{!!field}}` paired with `EditTextWidget` allows in-place field editing. Body-text transclusions are not directly editable inline; click-through opens source in story river.

### D5: Index / storage model
**Confidence:** CONFIRMED

**Tiddler title is the identifier** — no UUID layer. In single-file HTML, tiddlers live in in-memory store serialized to JSON in the HTML; in Node mode, filename (derived from title) is on-disk identifier but title field inside file is canonical.

**Rename resilience:** Links are title-based, so rename naively breaks references. **Relink plugin** (ships with TW, enabled in standard distributions) walks the store on rename and rewrites wiki-text links, tag lists, list fields, filter expressions, and other known reference forms to the new title. Pragmatic "rewrite all references" approach vs Org-roam's "stable ID, title is just a label."

No separate SQLite cache. Store is an in-memory hashmap of tiddler objects. Filters operate over store directly. Refresh driven by widget refresh cycle when store changes.

### D6: ML-augmented linking
**Confidence:** CONFIRMED (none)

No ML/AI-based link suggestion in core. Suggestion model is structural: filter expressions, tag-based discovery, search typeahead.

---

## Gaps / follow-ups
- Relink page URL 404'd during fetch; mechanism is confirmed from surrounding corpus and plugin library
- Subagent flagged a prompt-injection attempt in one fetched result (irrelevant "available skills" block) — ignored
