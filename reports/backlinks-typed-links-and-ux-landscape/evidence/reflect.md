# Evidence: Reflect — ML-augmented linking

**Dimension:** Backlink/wikilink architecture — Reflect
**Date:** 2026-04-12

---

## Key sources
- [Reflect — Automatically add backlinks using AI](https://reflect.app/blog/automatically-add-backlinks-using-ai)
- [Reflect — Advanced Search and AI Chat](https://reflect.app/blog/ai-search)
- [Reflect — New backlink picker and more (April 2024)](https://reflect.app/blog/april-2024-update)
- [Reflect Academy — Import, export, backups](https://reflect.academy/import-export-backups)

⚠️ Vendor-incentive bias flag: all sources are Reflect's own marketing/blog. Product claims about AI behavior depend on their description.

---

## Findings

### D1: Link format & representation
**Confidence:** CONFIRMED

`[[Page]]` wikilink syntax in the editor. **Storage is proprietary, not plain markdown** — Reflect explicitly states notes are stored in a proprietary format for offline sync and encryption. Markdown is **export-only**, not the on-disk representation. Cloud-first with daily local backups; no folder of `.md` files users can edit directly.

Backlink picker triggered by typing `[[` with workspace auto-complete.

### D2: Link semantics / typing
**Confidence:** CONFIRMED (none)

**Untyped.** Three primitives — pages, `[[wikilinks]]`, `#tags` — no typed-reference system, no frontmatter attribute queries, no semantic categories for links. On markdown export, backlinks and tags emit as plain text without Reflect-internal IDs. This is the Obsidian/Roam model, not Notion/SilverBullet's structured-attribute model.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

Two layers:
1. **Manual wikilinks** via `[[`. Picker (revamped April 2024) ranks candidates by recency plus **incoming-backlink count**, with matched substring bolded inline.
2. **Backlinks panel per page** — standard reverse-index view.

**PageRank-lite ranking:** "incoming backlink count" in the picker surfaces hub notes during link creation, reinforcing the graph's skew.

### D4: Transclusion
**Confidence:** CONFIRMED (none)

No evidence of first-class transclusion (block-embed, header-embed) in docs, changelog, or blog. Competitive comparisons note absence vs Amplenote/Obsidian. Block-level **linking** exists (link-to-heading/block lookup), but resolves to a jump target rather than inlining content.

### D5: Index / storage model
**Confidence:** CONFIRMED

- Cloud-first, proprietary format, E2E-encrypted sync, daily local backup
- Client also builds **client-side semantic embedding index** of user's notes for "similar notes" and semantic search — derived state, rebuildable
- No user-facing file layout, no SQLite, no git-friendly round-trip

### D6: ML-augmented linking — **the key dimension**
**Confidence:** CONFIRMED

Two distinct ML features, both documented on Reflect's blog:

**1. "Decorate my writing with backlinks"** (AI palette command, GPT-4):
- **User-initiated, not automatic.** Highlight text → `cmd+j` → pick prompt → GPT-4 identifies entities (people, places, things, concepts) and rewrites the selection with `[[wikilinks]]` inlined. **Replaces the original text.**
- LLM rewrite pass, not a classifier running on every keystroke
- Nothing auto-linked in background

**2. Similar notes / semantic search** (client-side embeddings):
- Builds embedding index locally
- Surfaces "similar notes" sidebar + semantic search
- **Does NOT create links** — only surfaces related content for user to optionally link manually

**Architecture:** embeddings = **discovery** layer; GPT-4 = **on-demand authoring** layer. The graph itself remains user-authored `[[...]]` wikilinks. **ML never silently mutates the graph.**

Key design choice distinguishing Reflect from speculative "auto-linking" tools: AI is gated behind explicit user intent every time it modifies the document.

---

## Gaps / follow-ups
- All claims are Reflect's own marketing; no independent verification of how well "Decorate with backlinks" works in practice
- Whether future versions will introduce background auto-linking is open
