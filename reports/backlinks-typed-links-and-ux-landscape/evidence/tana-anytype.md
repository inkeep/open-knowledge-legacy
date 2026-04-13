# Evidence: Tana + Anytype — typed/structured link architectures

**Dimension:** Typed/structured links — edges with semantics
**Date:** 2026-04-12

---

## Key sources

**Tana**
- [Tana — Supertags docs](https://tana.inc/docs/supertags)
- [Tana — Intro to nodes, fields and supertags](https://tana.inc/articles/intro-to-nodes-fields-and-supertags)
- [Tana — When to use Extend in supertags](https://tana.inc/articles/when-to-use-extend-in-supertags)
- [Tana — Fields docs](https://tana.inc/docs/fields)
- [Tana — Copy, paste, and export](https://tana.inc/docs/copy-paste-and-export)

**Anytype**
- [Anytype Docs — Properties (Relations)](https://doc.anytype.io/anytype-docs/getting-started/types/relations)
- [Anytype Docs — Links / linking objects](https://doc.anytype.io/anytype-docs/getting-started/object-editor/linking-objects)
- [Anytype Docs — Sets / Queries](https://doc.anytype.io/anytype-docs/getting-started/sets)
- [Anytype Docs — Import & Export](https://doc.anytype.io/anytype-docs/advanced/data-and-security/import-export)
- [anyproto/anytype-heart (GitHub)](https://github.com/anyproto/anytype-heart)
- [DeepWiki — anytype-heart Object Types and Relations](https://deepwiki.com/anyproto/anytype-heart/3.1-object-types-and-relations)
- [anyproto/any-sync (GitHub)](https://github.com/anyproto/any-sync)
- [Anytype Community — Export relations as YAML frontmatter](https://community.anytype.io/t/export-relations-data-in-markdown-as-yaml-frontmatter/11805)

---

## Tana

### D1: Link format & representation
**Confidence:** CONFIRMED

Three syntactic primitives, all backed by a unified graph model where *everything is a node*:
- `[[Node]]` — reference, stored as edge to target node's stable internal ID
- `#supertag` — attaches a *type* (schema binding) to the node
- `@mention` — inline reference, UI convenience for picker

All three collapse to the same primitive: **a directed edge to a node ID**. `#supertag` is structurally different — it assigns class/type membership.

### D2: Link semantics / typing — **supertags + fields** (the differentiator)
**Confidence:** CONFIRMED

**Supertags define schemas.** Each supertag is itself a node declaring:
- Set of fields
- Default field values
- Pinned fields (surface-first for filter/sort)
- Content template (static nodes + search nodes auto-inserted on instance creation)
- Layouts/views

Field types: text, number, date, checkbox, options (enum), **instance-of** (typed object reference), more. An instance-type field can be constrained to a specific supertag — e.g. `Assignee` on `#task` may require `#person`.

**This is where typed links live:** edge from `#task` through its `Assignee` field is *semantically* "assigneeOf", not generic backlink.

**Multiple supertags per node** ("emergence") — union of fields surfaces.

**Inheritance via Extend:** supertags compose. `#dev-task` extends `#todo` inheriting `Assignee`/`Due date`/`Status` and adds `Github PR`, `Spec`. Inherited content cannot be deleted from child.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

- **Right panel:** incoming + outgoing references per node
- **Search Nodes:** first-class nodes embedding a live query (supertag + field filters + sort). Drop in a supertag template → every instance gets pre-built related views. E.g. `#project` templates include search for `#task where Project = self`.
- **Filtering by relation type is native** — UI understands link type because every edge carries field semantics

### D4: Transclusion
**Confidence:** CONFIRMED

- **References live by default.** `[[Node]]` is a pointer; edits propagate.
- Expanding a reference in-place reveals target's children; edits propagate to source.
- **No separate "embed" vs "reference" mode.** Every reference is expandable and editable.

### D5: Index / storage model
**Confidence:** CONFIRMED

- Proprietary cloud-hosted graph DB. Thin clients. No local-first today.
- Every node has stable internal ID. Rename = label edit. All `[[links]]`, `#supertags`, field values, search nodes continue to resolve.
- One unified graph of typed edges — supertag applications + field values + body refs are all edges in the same graph.

### D6: Markdown export fidelity
**Confidence:** CONFIRMED

- **JSON export: lossless** — full graph dump, all supertag/field structure preserved
- **Markdown export: lossy** — supertags and fields drop (no plain-markdown representation)
- **CSV export: per-supertag** (rows = instances, columns = fields)

**Structural conclusion: typed links cannot survive a markdown round-trip.**

---

## Anytype

### D1: Link format & representation
**Confidence:** CONFIRMED

Object-centric data model, middleware-driven (Go core = `anytype-heart`), Protocol Buffers serialization across gRPC boundary to clients.

Three distinct link mechanisms:
- **Block Links** (`/` → "Link to Object"): Block of type Link in object's block tree
- **Inline Mentions** (`@` or `[[` triggers picker): mention mark on text block — range within a text block carries mark of type `mention` with target object ID
- **Relations of format `object`**: relation (property) whose value is a list of target object IDs

All three store **stable Object IDs** minted by `anytype-heart` (derived from keys inside the any-sync DAG — not IPFS CIDs, which change per edit).

### D2: Link semantics / typing — **Relations as first-class objects**
**Confidence:** CONFIRMED

Relations ARE objects in the graph — openable, renameable, reusable. Each relation has:
- `key` (stable identifier)
- `name` (display label)
- `format` (value type): text, number, date, checkbox, file, url, email, phone, tag (multi-select), status (single-select), and crucially **`object`** (link to other objects)
- For `object`-format relations: optional **object-type constraints** (e.g. "Author" only accepts `Human` objects)

Relation categories: System, Internal (non-user-visible), Required (layout-mandated), User.

**Object Types** are equally first-class objects declaring which relations apply. Direct analogue of Tana supertag with fields.

**Graph is genuinely typed:** edge from `BookA` to `PersonB` via `Author` relation differs in kind from edge via `Editor` relation. Sets can filter on relation *type*, not just destination.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

- **Relations panel** on every object: all typed relations and values, editable in place
- **Auto-populated "Backlinks" relation** listing objects linking in
- **Sets**: live queries (Query by Type, Query by Relation). Persisted as their own objects.
- **Collections**: manual, hand-curated lists
- **Filtering by relation type native.** AND-only filters (OR requested by community). Views: Grid, Gallery, List, Kanban by relation.

### D4: Transclusion
**Confidence:** CONFIRMED

- **Block Link cards** render target's preview (title, icon, description). Edits to preview fields reflect on target.
- **Inline mentions** are pure references; click to navigate
- **Object relations** display as chips/cards; click to navigate
- **No Tana-style "expand subtree of reference and edit inline."** Preview-level in-place editing exists; deep inline editing does not.

### D5: Index / storage model
**Confidence:** CONFIRMED

- **Local-first, end-to-end encrypted.** Data on each device; sync peer-to-peer via **any-sync** protocol (open-source, Anytype-authored, encrypted CRDT-like DAG sync)
- Objects stored as encrypted DAGs (chats, pages, databases — each is a DAG of operations/blocks)
- **IPFS/IPLD for file (blob) storage ONLY** — not for object IDs. Anytype explicitly rejected CIDs as object IDs because CIDs change per modification.
- Object IDs minted separately, **stable across edits, renames, moves**
- Cloud backup nodes optional, self-hostable

### D6: Markdown export fidelity
**Confidence:** CONFIRMED

- **Markdown export drops relations.** Body blocks serialize to markdown, but typed relations (Author, Project, Tags, Status) dropped. Community issue filed; YAML-frontmatter relation export requested but only partial
- **Full fidelity:** protobuf/JSON (`.pb` or JSON per object, zipped)
- Community tools (`AnyBlock-To-Markdown`) synthesize YAML-frontmatter + Obsidian-style `[[wiki-links]]` to approximate relation fidelity

**Same structural conclusion as Tana: typed relations have no plain-markdown representation.**

---

## Cross-cutting takeaway

| Axis | Tana | Anytype |
|---|---|---|
| Type binding | `#supertag` on the node | `type` relation on the object |
| Schema declaration | Supertag's fields + template | Object Type's relation list |
| Typed edge | Field of type *instance* | Relation of format *object* |
| Edge-type is a node? | Yes (field nodes) | Yes (relation objects) |
| Multi-type per node | Yes (emergence) | One primary type, unlimited relations |
| Storage | Cloud graph DB | Local-first encrypted DAGs + IPFS blobs |
| Stable IDs on rename | Yes | Yes (minted object IDs, not CIDs) |
| Markdown round-trip | Lossy (fields drop) | Lossy (relations drop) |
| Lossless format | JSON export | Protobuf/JSON bundle |

**Common architectural invariant:** typed links are named edges whose type is itself a first-class node in the same graph. Plain markdown (URL + optional label, no named predicate) cannot express this. Any system preserving typed relations must either (a) synthesize frontmatter conventions, (b) export sidecar JSON/protobuf, or (c) adopt a richer text format (MDX, RDF-in-markdown, org-mode properties).

---

## Gaps / follow-ups
- Tana's internal data model is not documented externally; findings are from user-facing behavior and help docs
- Anytype any-sync protocol details are in the open-source repo but the full CRDT semantics are complex — not fully covered here
