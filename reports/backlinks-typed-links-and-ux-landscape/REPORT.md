---
title: "Backlinks, Typed Links, and UX Patterns: Landscape Across 9 Tools"
description: "Factual landscape of how backlinks and wikilinks are architected, surfaced, and represented across 9 tools not fully covered by the existing wiki-links-backlinks-architecture report: Roam, Org-roam, TiddlyWiki, Tana, Anytype, Notion (deeper), Heptabase, Reflect, SilverBullet. Focused on four angles: typed/structured links, transclusion-as-primitive, UX patterns for navigation and backlinks, and ML-augmented linking. Orthogonal companion to the prior architecture report."
createdAt: 2026-04-12
updatedAt: 2026-04-12
subjects:
  - Roam Research
  - Org-roam
  - TiddlyWiki
  - Tana
  - Anytype
  - Notion
  - Heptabase
  - Reflect
  - SilverBullet
  - BlockSuite
  - Datomic
  - Datascript
topics:
  - typed links
  - transclusion
  - backlink UX
  - link semantics
  - knowledge graph
---

# Backlinks, Typed Links, and UX Patterns: Landscape Across 9 Tools

**Purpose:** The existing `wiki-links-backlinks-architecture` report covered link *format syntax*, *index architecture*, and *editor integration* deeply across Obsidian, Logseq, Outline, AFFiNE, Foam, Dendron, and Marksman. This report is the orthogonal companion — what's *new* here: four angles the prior report didn't emphasize, across 9 additional tools chosen specifically because each one exhibits a different architectural choice.

The four angles:
1. **Typed/structured links** — links as named edges vs. untyped hyperlinks
2. **Transclusion as primitive** — embedding content inline with varying editability
3. **UX patterns** — backlink panels, graph views, hover vs story-river, filters
4. **ML-augmented linking** — auto-suggestion, semantic discovery, AI rewrites

Tools covered: Roam Research, Org-roam, TiddlyWiki, Tana, Anytype, Notion (beyond the brief prior-report coverage), Heptabase, Reflect, SilverBullet.

---

## Executive Summary

The landscape splits cleanly along three architectural axes. Any given tool's answer to "how do backlinks work?" is largely determined by where it sits on these three axes:

**Axis 1 — Link identity: title-based vs. ID-based.** Title-based tools (TiddlyWiki, Obsidian, Dendron) resolve links at display time and require rewrite-on-rename machinery (Relink plugin, prosemirror-markdown serializer, etc.). ID-based tools (Roam, Notion, Tana, Anytype, Org-roam, Heptabase) store the UUID / stable-ID and treat title as a mutable display property — rename is free. **Everyone we'd consider "architecturally serious" is ID-based.**

**Axis 2 — Link typing: untyped wikilinks vs. typed edges.** Most wiki-link-flavored tools (Obsidian, Roam, TiddlyWiki, Reflect, Foam, Dendron, Org-roam) treat links as untyped — `[[foo]]` just means "references foo." Three tools have first-class typed edges: **Notion** (database relations with enforced inverse), **Tana** (fields of type instance, typed by supertag), **Anytype** (relations of format object, constrained by object type). All three give links *semantic category*, not just existence. SilverBullet is the "lightweight typed" option — untyped `[[links]]` but typed *attributes* (frontmatter + tag-as-class + LIQ queries) that produce a queryable graph without a full schema system.

**Axis 3 — Transclusion: absent / add-on / first-class.** TiddlyWiki and Heptabase make transclusion the *default* — every tiddler is a transclusion target, every card-on-a-whiteboard is a CardInstance placement. Roam has two distinct mechanisms (read-only block-ref vs. editable block-embed). Notion has synced blocks as opt-in shared identity. Tana's references are always expandable and editable. Org-roam delegates to a separate `org-transclusion` package. Obsidian's `![[embed]]` is static. SilverBullet generalizes transclusion into *live queries*.

**Key findings:**

- **Typed links structurally cannot round-trip to plain markdown.** Tana supertags, Anytype relations, Notion database relations all drop on markdown export. Any file-backed system that wants typed relations must either synthesize frontmatter conventions, export sidecar JSON, or adopt a richer text format.
- **Rename-resilience correlates with having stable IDs.** Tools that store title in link syntax require rewrite-on-rename plugins (Relink in TW); tools with stable IDs treat rename as a one-field update.
- **The "story river" UX pattern (TiddlyWiki) sidesteps the hover-preview problem** — instead of peeking at the target, the user stacks tiddlers in a vertical column, reading many simultaneously. Everyone else defaults to some combination of hover preview + click-to-navigate.
- **ML-augmented linking is rare and deliberately gated.** Only Reflect implements it, with two distinct layers: discovery (client-side embeddings → "similar notes" sidebar, never auto-creates links) and on-demand authoring (GPT-4 "Decorate my writing with backlinks" command, user-invoked). Nothing runs silently in the background mutating the link graph. Roam's product philosophy explicitly rejects ML-suggested links as anti-pattern.
- **SilverBullet is the most structured-data markdown tool.** Frontmatter attributes, tags-as-classes, inherited tags via backlinks (ilinks), and a Lua query language over the object index — it gets much of Notion's database experience from plain markdown files.
- **Heptabase's `CardInstance` model is the cleanest transclusion implementation.** Separating content identity (`Card`) from spatial placement (`CardInstance`) structurally means every card dropped on a whiteboard is already a "synced block" — no opt-in gesture required.

---

## Research Rubric

| # | Dimension | Depth |
|---|---|---|
| D1 | Link format & markdown representation | Moderate |
| D2 | Link semantics / typing | **Deep** (core new angle) |
| D3 | Backlink UX patterns | Deep |
| D4 | Transclusion as primitive | Deep |
| D5 | Index / storage model, rename resilience | Moderate |
| D6 | ML-augmented linking | Moderate (core new angle where applicable) |

**Tools:** Roam Research, Org-roam, TiddlyWiki, Tana, Anytype, Notion (deeper), Heptabase, Reflect, SilverBullet.

**Non-goals:**
- Re-covering Obsidian, Logseq, AFFiNE, Outline, Foam, Dendron, Marksman, remark-wiki-link — covered in `wiki-links-backlinks-architecture/`
- Source-code depth on index implementations (covered in prior report for the tools it covered)
- Implementation recommendations for Open Knowledge (factual stance)

---

## Cross-Cutting Comparison

### D1 + D5: Link identity and rename resilience

| Tool | Link syntax | Stored as | Rename resilience | Authoritative storage |
|---|---|---|---|---|
| **Roam** | `[[Page]]`, `((uid))`, `#tag` | Entity-id edge on `:block/refs` | Rename = one datom update; auto-resolves | Datomic-style graph DB; EDN export lossless |
| **Org-roam** | `[[id:UUID][Display]]` | UUID in `.org` property drawer | Rename = free; ID stable | `.org` files + SQLite cache |
| **TiddlyWiki** | `[[Tiddler Title]]` | **Title string** | Relink plugin rewrites all refs | In-memory store (single HTML file or per-tiddler files) |
| **Tana** | `[[Node]]`, `#supertag`, `@mention` | Edge to internal node ID | Rename = label edit; free | Proprietary cloud graph DB |
| **Anytype** | Block Link / `@mention` / relation value | Stable Object ID (not IPFS CID) | Rename = free | Local-first encrypted DAGs + any-sync |
| **Notion** | `@mention`, `[[page]]`, `+page` | UUID-based mention in rich text | Rename = free; title is derived | PostgreSQL, sharded blocks table |
| **Heptabase** | `@mention` + whiteboard arrow (`Connection`) | Stable card/whiteboard IDs | Rename = free | Local-first + cloud sync; JSON rich text |
| **Reflect** | `[[Page]]` | Proprietary format; IDs internal | Rename = free | Cloud-first, E2E-encrypted proprietary |
| **SilverBullet** | `[[Page]]` + `#tag` | Plain markdown text | Title-based; handled in query layer | Markdown files + client IndexedDB index |

**Pattern:** every "architecturally serious" tool has moved to ID-based linking. Title-based tools (TiddlyWiki, SilverBullet) rely on external rewrite-on-rename or accept the brittleness.

### D2: Link semantics / typing spectrum

| Tool | Typing level | Mechanism |
|---|---|---|
| **Roam** | Minimal | `AttributeName:: value` parsed at render time; no distinct datom type |
| **Org-roam** | Minimal | Untyped `id:` links + tags + `ROAM_REFS` |
| **TiddlyWiki** | Conventional | Untyped `[[links]]`, but arbitrary custom fields + filter language approximate typed relations (`[field:prerequisite-of[X]]`) |
| **Tana** | **Typed (full schema)** | `#supertag` defines fields with types; instance-type field constrained to specific supertag → named edges |
| **Anytype** | **Typed (full schema)** | Relations are first-class objects with format + type constraints; Object Type declares required relations |
| **Notion** | **Typed (schema-level)** | Database relations with configurable inverse, cardinality, rollups |
| **Heptabase** | Minimal | Untyped `@mentions` + `Connection` records with line style/color as informal typing |
| **Reflect** | None | Untyped `[[]]` + `#tags` only |
| **SilverBullet** | **Structured attributes on untyped links** | Untyped `[[]]` but frontmatter attributes, tags-as-classes, inherited tags (ilinks), Lua Integrated Query over object index |

**Pattern:** three distinct strategies for typed relations:
1. **Schema-first (Tana, Anytype, Notion)** — relation types declared in schema objects; the graph is natively typed
2. **Convention-via-query (TiddlyWiki, SilverBullet)** — untyped links, typed *attributes*, filter/query language makes edges queryable by type
3. **Untyped (Roam, Org-roam, Reflect, Heptabase, Obsidian, Logseq, Foam, Dendron)** — links exist, type is implicit/manual

Schema-first strategy is **mutually exclusive** with plain-markdown round-trip. Convention-via-query can coexist with markdown (SilverBullet proves this).

### D3: Backlink UX patterns

| Tool | Primary surface | Panel format | Graph view | Navigation model |
|---|---|---|---|---|
| **Roam** | Linked + Unlinked References panels per page | Full referring block + parent breadcrumb; editable in place | 2D force-directed, node size by word count | Click-to-navigate |
| **Org-roam** | `*org-roam-buffer*` with magit-section | Three sections: Backlinks / Reference links / Unlinked references | None native | "Jump, don't peek" (Emacs buffer-switch) |
| **TiddlyWiki** | Backlinks tab on info panel + filter operator `backlinks[]` | Tab on info panel | None native | **Story River** — append tiddlers to vertical column, read many simultaneously |
| **Tana** | Right panel: incoming + outgoing references; Search Nodes in templates | Section-based; filter by relation type native | None native (graph concept diffused into Search Nodes) | Expand-in-place (default) + click-to-navigate |
| **Anytype** | Relations panel; auto-populated Backlinks relation; Sets (live queries) | Relation chips in properties panel; Sets as Grid/Gallery/List/Kanban | None native | Click-to-navigate; preview cards |
| **Notion** | Backlinks panel at top of page (collapsed by default) | Generated only from `@`-mentions; permission-gated | None native (long-requested) | Click-to-navigate; hover to expand |
| **Heptabase** | Info panel: mentions + whiteboards containing card + arrows | Spatial — backlinks surface from Text, Mindmap nodes, Arrows, Sections | **Whiteboard itself IS the graph view** (hand-curated) | Open-in-whiteboard + deep links |
| **Reflect** | Backlinks panel + backlink picker ranked by incoming-count | PageRank-lite ranking during link creation | None native | Click-to-navigate |
| **SilverBullet** | Query-composed (`tags.link where target == "CurrentPage"`) | User-authored live queries inline anywhere | None native | Click-to-navigate |

**Distinctive UX patterns worth noting:**

- **TiddlyWiki's Story River** — fundamentally different from "backlink panel": instead of peeking at targets, you read *all* of them in a stacked column
- **Tana's Search Nodes in supertag templates** — every instance of `#project` automatically gets a pre-built "related tasks" view; filtering by relation type is native
- **Heptabase's whiteboard-as-graph** — no separate force-directed visualization; the whiteboard IS the interactive graph
- **SilverBullet's "compose your own backlinks"** — no dedicated panel; the user writes a query that renders backlinks inline with any formatting/filtering

### D4: Transclusion

| Tool | Transclusion status | Primary mechanism | Editable in place? |
|---|---|---|---|
| **Roam** | First-class, two modes | `((uid))` read-only inline; `{{embed: ((uid))}}` editable both directions | Block embed: yes; block ref: no; page embed: no (asymmetry) |
| **Org-roam** | Add-on | Separate `org-transclusion` package (`#+transclude:`) | Depends on package |
| **TiddlyWiki** | **Core primitive** | `{{Tiddler}}`, `{{!!field}}`, `{{{ [filter] }}}` — filter transclusion renders live query results | Body: click-through to source (story river); fields: yes with EditTextWidget |
| **Tana** | Default behavior | References are always expandable; expanded view is editable | Yes, always |
| **Anytype** | Preview-only | Block Link renders target's preview (title, icon, description); inline mentions are pure refs | Preview-level yes; body-level no |
| **Notion** | Synced blocks (opt-in) | `⌥+drag` creates shared-identity block; colored halo shows all locations | Yes (bidirectional across all copies) |
| **Heptabase** | **Default via CardInstance** | `Card` owns content; `CardInstance` is placement. Every card-on-whiteboard is already a "synced" instance | Yes (edits propagate to all instances instantly) |
| **Reflect** | None | Block-level linking exists but resolves to jump target, not inlined content | N/A |
| **SilverBullet** | **Generalized to live queries** | `#query ... render [[template]]` — query result inlined via Handlebars template | Query output is read-only; truth stays in markdown |

**Pattern:** TiddlyWiki and Heptabase are the "transclusion-native" tools — structurally, transclusion is the primary act of composition, not a special mechanism. Roam's block embed achieves the same effect via opt-in syntax. Everyone else treats it as secondary.

**SilverBullet's innovation** — treating transclusion as *live query output* rather than static block embedding — decouples "where to show content" from "which specific block/page to embed." The source of the transclusion is a query, so new matching content appears automatically.

### D6: ML-augmented linking

Only two tools in this set have any form:

**Reflect** — two explicit layers:
1. **Discovery (client-side embeddings)** — "similar notes" sidebar; never creates links
2. **On-demand authoring (GPT-4 "Decorate my writing with backlinks" command)** — user-invoked, replaces selected text with wikilink-inlined version

Everything else runs manually. ML never silently mutates the graph.

**SilverBullet** — none in core; Space Lua could enable community plugs but upstream is deliberately ML-free.

**Pattern:** even the one tool that does ML-augmented linking (Reflect) gates it behind explicit user intent. Background auto-linking is not an accepted pattern in the mainstream PKM space as of 2026-04-12. Roam's product team has articulated this as a philosophical stance: manual linking is the cognitive work.

---

## Detailed Findings

Brief per-tool synthesis; full evidence in per-tool files.

### Roam Research
Datomic-style EAVT graph database with Datascript/Datalog queries. `:block/refs` IS the backlink index — O(1) entity-id lookups. Block UIDs are stable 9-char identifiers. Attributes (`Name:: value`) are the native typed-link primitive but implemented as parse-time convention over `:block/string`, not a distinct datom type. Two transclusion modes: read-only block ref (`((uid))`) and editable block embed (`{{embed: ((uid))}}`). No ML.
**Evidence:** [evidence/roam.md](evidence/roam.md)

### Org-roam
Emacs Org-mode ID links (`[[id:UUID][Display]]`) with file-level `:ID:` property drawers. SQLite cache for indexing; `.org` files are source of truth. No native typed edges — ROAM_REFS + tags + properties approximate. Transclusion is an add-on package. Backlinks via `*org-roam-buffer*` magit-section widget with three panes: Backlinks / Reference links / Unlinked references.
**Evidence:** [evidence/org-roam.md](evidence/org-roam.md)

### TiddlyWiki
Title-based linking with the Relink plugin for rename propagation. Arbitrary custom fields + filter language approximate typed relations. **Transclusion is core** — `{{Tiddler}}`, `{{!!field}}`, `{{{ [filter] }}}` — filter transclusion renders live query results inline. The Story River UX stacks opened tiddlers in a vertical column rather than navigating away.
**Evidence:** [evidence/tiddlywiki.md](evidence/tiddlywiki.md)

### Tana
Unified graph model where everything is a node. Three link syntaxes (`[[]]`, `#supertag`, `@mention`) collapse to edges targeting node IDs. **Supertags define schemas** with typed fields — a field of type *instance* constrained to a specific supertag IS a typed edge. Multiple supertags per node ("emergence"). References are always expandable and editable. Markdown export drops supertags/fields.
**Evidence:** [evidence/tana-anytype.md](evidence/tana-anytype.md)

### Anytype
Objects + Relations as first-class objects in the graph. Relations have a *format* (text/number/date/object/etc.) and for object-format relations can be type-constrained. Object Types declare which relations apply. Local-first with any-sync (CRDT-like DAG sync) + IPFS blobs. Stable Object IDs minted by `anytype-heart` (not IPFS CIDs). Markdown export drops relations.
**Evidence:** [evidence/tana-anytype.md](evidence/tana-anytype.md)

### Notion
Everything is a block with UUID v4 and parent/content pointers. Three mention primitives (`@`, `[[`, `+`) compile to the same rich-text mention object keyed on UUID. Database relations are the typed-link primitive (one-way vs. two-way synced; 1:1, 1:N, N:M). Synced blocks = opt-in shared identity with colored halo showing N other locations. Markdown export deeply lossy — synced blocks, relations, rollups, filtered views all drop.
**Evidence:** [evidence/notion.md](evidence/notion.md)

### Heptabase
Split-modality linking: semantic via @-mentions in card text; spatial via whiteboard arrows as `Connection` records. `CardInstance` separates content identity from placement → every card on a whiteboard is already a transclusion. Backlinks surface from every object type (text elements, mindmap nodes, arrows, sections). The whiteboard itself is the interactive graph view — no separate force-directed visualization.
**Evidence:** [evidence/heptabase.md](evidence/heptabase.md)

### Reflect
Proprietary cloud-first storage with `[[Page]]` wikilinks in the editor. Untyped links. Two ML layers: client-side embeddings for "similar notes" discovery (no link creation); GPT-4 "Decorate with backlinks" command user-invoked via `cmd+j`. Backlink picker ranks candidates by incoming-count (PageRank-lite).
**Evidence:** [evidence/reflect.md](evidence/reflect.md)

### SilverBullet
Plain markdown + most structured attribute model of mainstream markdown tools. Frontmatter attributes indexed; `#tag` as class; inherited tags (ilinks) via backlinks; Lua Integrated Query over object index. Transclusion via live queries with `render` templates — query output is always live-rendered, never written to disk. Client-side IndexedDB index, regenerable from markdown.
**Evidence:** [evidence/silverbullet.md](evidence/silverbullet.md)

---

## Limitations & Open Questions

### Dimensions not fully covered
- **Block-level granularity across all tools** — some tools (Roam, Notion) support linking to a specific block; others (Obsidian, TiddlyWiki body text) only to a page/heading. Coverage inconsistent across the per-tool evidence.
- **Permission models on backlinks** — Notion gates backlinks by ACL; most others don't have a permission model at all. Not explored in depth.
- **Mobile/offline UX for backlinks** — all evidence is desktop/web focused.

### Out of scope (per rubric)
- Tools covered in the prior report (Obsidian, Logseq, Outline, AFFiNE, Foam, Dendron, Marksman, remark-wiki-link)
- Implementation recommendations for Open Knowledge
- Source-code depth on index implementations

### Confidence caveats
- **Reflect** findings are entirely from vendor marketing/blog — no independent verification of ML behavior in practice
- **Tana** internals are not externally documented; findings from user-facing behavior and official help docs
- **Notion** internal block schema is documented only via developer API surface; storage details inferred from Notion's "Data Model" blog post

---

## References

### Evidence Files
- [evidence/roam.md](evidence/roam.md) — Roam Datomic-style EAVT model, attributes as typed links, block embed transclusion
- [evidence/org-roam.md](evidence/org-roam.md) — Emacs Org-mode + SQLite cache, `:ID:` property drawers
- [evidence/tiddlywiki.md](evidence/tiddlywiki.md) — Filter-transclusion as first-class, Story River UX, Relink plugin
- [evidence/tana-anytype.md](evidence/tana-anytype.md) — Typed links via supertag fields (Tana) + relation-as-object (Anytype)
- [evidence/notion.md](evidence/notion.md) — UUID-based everything-is-a-block, database relations, synced blocks
- [evidence/heptabase.md](evidence/heptabase.md) — CardInstance transclusion, whiteboard-as-graph, arrows as Connection records
- [evidence/reflect.md](evidence/reflect.md) — AI decorate-with-backlinks command, client-side embeddings, PageRank picker
- [evidence/silverbullet.md](evidence/silverbullet.md) — Structured attributes on markdown, Lua Integrated Query, live-query transclusion

### Related Research

- [`wiki-links-backlinks-architecture/`](../wiki-links-backlinks-architecture/REPORT.md) — The prior report this one complements. Covers Obsidian, Logseq, Outline, AFFiNE, Foam, Dendron, Marksman, remark-wiki-link with source-code depth on index architecture.
- [`openknowledge-competitive-landscape/`](../openknowledge-competitive-landscape/REPORT.md) — Broader competitive landscape including many of these tools but from a business/positioning angle.
- [`obsidian-karpathy-workflow-deep-dive/`](../obsidian-karpathy-workflow-deep-dive/REPORT.md) — Obsidian-specific capability deep-dive.
