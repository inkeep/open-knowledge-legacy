# D2: CRDT + Collaboration Layer Constraints on ProseMirror Schema

**Dimension:** CRDT and collaboration library constraints on ProseMirror schema design  
**Purpose:** Determine what the Y.js/y-prosemirror/Hocuspocus collaboration stack requires, forbids, and enables for a greenfield ProseMirror-based CRDT markdown editor schema  
**Date:** 2026-04-12

---

## Executive Summary

The CRDT collaboration layer (Y.js + y-prosemirror + Hocuspocus) imposes **surprisingly few hard constraints** on ProseMirror schema design but creates **significant operational constraints around schema evolution**. The key findings:

1. **y-prosemirror is fully schema-name-agnostic** — no hardcoded node/mark names. Any valid ProseMirror schema works.
2. **Schema evolution is destructive** — renaming or removing a node/mark type permanently deletes existing instances from in-flight Y.Docs. Y.js has no migration mechanism.
3. **Atom nodes work cleanly** but attributes are last-write-wins (no character-level merge for attribute values).
4. **Mark concurrency is well-handled** for non-overlapping marks (union semantics) but overlapping marks can duplicate.
5. **y-codemirror.next has zero PM-schema coupling** — the source-mode binding is purely text-based.
6. **Hocuspocus is completely schema-agnostic** — all schema awareness lives in extensions (persistence, transformer).
7. **The markdown storage layer is the natural migration path** — Y.Docs are ephemeral, markdown on disk is canonical.

---

## 1. y-prosemirror Schema-Name Handling

**Depth: Deep | Confidence: High (source-verified)**

y-prosemirror does not hardcode any ProseMirror node or mark names. It is fully name-agnostic, using runtime schema lookups throughout.

### How Names Are Used

Three critical code paths use node/mark names:

1. **`matchNodeName`** (sync-plugin.js:1305) — strict `===` comparison between `Y.XmlElement.nodeName` and `ProseMirror.Node.type.name`. No aliases, no fuzzy matching.

2. **`schema.node(el.nodeName, attrs, children)`** (sync-plugin.js:801) — Y.XmlElement's stored `nodeName` is passed to ProseMirror's schema for node construction. If the name doesn't exist in the schema, ProseMirror throws `RangeError`.

3. **`updateYFragment` name guard** (sync-plugin.js:1147-1151) — throws `Error('node name mismatch!')` if an existing Y.XmlElement's `nodeName` doesn't match the ProseMirror node being applied to it.

### Destructive Error Recovery

When `schema.node()` throws for any reason (unknown type, invalid content, bad attributes), y-prosemirror **permanently deletes the Y.XmlElement from the Y.Doc**:

```javascript
// sync-plugin.js:804-811
} catch (e) {
  el.doc.transact((transaction) => {
    el._item.delete(transaction)  // PERMANENT DELETION
  }, ySyncPluginKey)
  return null
}
```

This deletion propagates via CRDT sync to all connected clients. The data is irrecoverably lost.

### The One Reserved Name

The mark name `'ychange'` is reserved by y-prosemirror for internal change tracking (snapshot diffs). The schema must not define a mark with this name.

**Evidence:** [y-prosemirror-schema-name-handling.md](evidence/y-prosemirror-schema-name-handling.md)

### Schema Design Implications

- **Any node/mark name works** — name your types freely
- **Choose names carefully** — renaming later is destructive for in-flight Y.Docs
- **Don't use `ychange` as a mark name** — it's reserved

---

## 2. Atom Node Collaborative Editing

**Depth: Deep | Confidence: High (source-verified)**

ProseMirror atom nodes (`atom: true`) map to `Y.XmlElement` instances with no children. They work out-of-the-box in collaborative editing with no special handling.

### Concurrent Edit Semantics

| Scenario | Resolution |
|----------|-----------|
| Two users edit **different** attributes | Clean merge — independent keys |
| Two users edit **same** attribute | Last-write-wins (Lamport timestamp) |
| One edits attribute, another deletes node | Delete wins |
| Two users insert atom at same position | Both survive, ordered by client ID |

### The Attribute Granularity Problem

Atom node attributes are stored as **atomic values** in Y.js. A single attribute (e.g., `rawHtml: "<div>...</div>"`) is replaced entirely — there is no character-level CRDT merge within an attribute value.

This means:
- Simple attributes (string, number, boolean) → fine for concurrent edits
- Complex content stored as a single attribute → concurrent edits cause data loss (last-write-wins)

### Workaround: Nested Y.Text for Collaborative Content

For atom nodes that need character-level collaborative editing of content (e.g., code block content), the recommended pattern is to store a `Y.Text` as an attribute value. However, y-prosemirror's `createNodeFromYElement` calls `el.getAttributes()` which returns the Y.Text type reference, not a string — custom handling would be needed.

**Evidence:** [atom-node-collaborative-editing.md](evidence/atom-node-collaborative-editing.md)

### Schema Design Implications

- **Prefer multiple small attributes** over one large attribute for atom nodes
- **Design attributes for independent editing** — each attribute is a separate CRDT merge unit
- **Content-heavy atom nodes** (e.g., JSX components with editable body text) should consider nested Y.Text for collaborative content, but this requires custom y-prosemirror integration

---

## 3. Y.js Schema Evolution

**Depth: Deep | Confidence: High (source-verified + community-confirmed)**

Y.js has **no built-in schema versioning, migration, or compatibility mechanism**. The `nodeName` is an opaque string stored in the binary format with zero validation.

### Schema Change Impact Matrix

| Operation | Y.js Layer | y-prosemirror Layer | Data Safety |
|-----------|-----------|---------------------|-------------|
| Add new node type | No effect | No effect | **Safe** |
| Remove node type | Old `nodeName` persists | Elements **deleted** | **DATA LOSS** |
| Rename node type | Old `nodeName` persists | Elements **deleted** | **DATA LOSS** |
| Add attribute | No effect | Missing attrs get defaults | **Safe** |
| Remove attribute | Old attr stays in CRDT | Old attr ignored | **Safe** |
| Change content model | No effect | `schema.node()` may throw → **deletion** | **RISKY** |
| Add new mark type | No effect | Old text lacks mark | **Safe** |
| Remove mark type | Old format keys persist | `schema.mark()` throws → **text deleted** | **DATA LOSS** |

### Community Consensus

From [Y.js discussion forum](https://discuss.yjs.dev/t/what-is-the-correct-way-to-apply-document-migrations/2321):
> "Migrations are...the biggest glaring flaw with Yjs, and pretty much every local-first solution."

Kevin Jahns (Y.js maintainer) on [handling unknown nodes](https://discuss.yjs.dev/t/handling-unknown-nodes-marks-in-prosemirror-schema/3683): An "unknown" passthrough node type is "currently not planned" in y-prosemirror.

### Mitigation Strategies

1. **Pre-migration Y.Doc walk:** Walk all persisted Y.Docs server-side and rename Y.XmlElement `nodeName` values before deploying new schema. Must happen before any client loads new schema.

2. **Version gating:** Store schema version in `Y.Map('meta')`. Clients detect mismatch and force reload. [Recommended by Kevin Jahns](https://discuss.yjs.dev/t/handling-unknown-nodes-marks-in-prosemirror-schema/3683).

3. **Markdown escape hatch (this project):** Y.Docs are ephemeral session state rebuilt from markdown on disk. Schema changes are safe as long as the parser handles both old and new formats. The `onLoadDocument` persistence hook re-parses markdown into the current schema on every document load.

**Evidence:** [yjs-schema-evolution.md](evidence/yjs-schema-evolution.md)

### Schema Design Implications

- **Get node/mark names right from the start** — renaming is destructive
- **Adding types is always safe; removing/renaming is not**
- **The markdown storage layer is your migration lever** — canonical markdown survives schema changes, and Y.Docs are rebuilt from it
- **For pure-CRDT systems without text storage, schema evolution is a hard problem**

---

## 4. y-codemirror.next: Zero PM-Schema Coupling

**Depth: Deep | Confidence: High (source-verified)**

y-codemirror.next binds Y.Text to CodeMirror 6 with **zero awareness of ProseMirror**. No imports, no references, no coupling.

### Binding Architecture

```
Y.Text ←→ y-codemirror.next (delta ↔ ChangeSpec translation) ←→ CodeMirror 6
             │
             │  No ProseMirror dependency
             │
Y.XmlFragment ←→ y-prosemirror (tree sync) ←→ ProseMirror
```

The source-mode editor operates on raw markdown text via Y.Text. It does not parse or understand ProseMirror node types. The PM schema is consulted only when the bidirectional observers (Observer A/B) sync between Y.XmlFragment and Y.Text.

### Loop Prevention

Uses CodeMirror annotations (analogous to PM transaction metadata) with origin checking to prevent echo loops — the same pattern y-prosemirror uses with `ySyncPluginKey`.

**Evidence:** [y-codemirror-next-analysis.md](evidence/y-codemirror-next-analysis.md)

### Schema Design Implications

- **Source-mode editing is completely schema-independent**
- **Schema changes don't affect the CodeMirror binding** — only the observer bridge needs updating
- **Y.Text serves as a schema-agnostic intermediary** between source mode and WYSIWYG mode
- **This architecture naturally supports schema migration** — change the schema, and Y.Text content is re-parsed into the new structure

---

## 5. Hocuspocus Extension Patterns

**Depth: Moderate | Confidence: High (source-verified)**

Hocuspocus is a **generic Y.Doc relay** with zero schema awareness. All schema-specific logic lives in extensions.

### Extension Hook Lifecycle

```
Document Creation:  onCreateDocument → onLoadDocument → afterLoadDocument
Client Updates:     beforeHandleMessage → onChange → onStoreDocument → afterStoreDocument
HTTP Requests:      onRequest
Awareness:          onAwarenessUpdate
Cleanup:            onDisconnect → beforeUnloadDocument → afterUnloadDocument
```

Extensions compose sequentially by priority. `SkipFurtherHooksError` halts the chain.

### Schema Coupling Points

| Layer | Schema Awareness |
|-------|-----------------|
| Hocuspocus Server | None |
| `@hocuspocus/extension-database` | None |
| `@hocuspocus/extension-logger` | None |
| `@hocuspocus/transformer` | **Yes** — imports y-prosemirror |
| Project persistence extension | **Yes** — uses `getSchema(sharedExtensions)` |
| Project API extension | None (delegates to persistence) |

### No Server-Side Schema Validation

Hocuspocus broadcasts all Y.Doc updates without validation. A client sending an update that creates an invalid Y.XmlElement will have it broadcast to all peers. Schema enforcement is client-side only.

**Evidence:** [hocuspocus-extension-patterns.md](evidence/hocuspocus-extension-patterns.md)

### Schema Design Implications

- **Hocuspocus imposes zero constraints on schema design**
- **Schema changes don't require server updates** — only persistence extension and client code
- **The persistence extension is the single schema-coupling point** on the server side
- **Server-side schema validation is possible** via a custom `onChange` hook extension but is not built in

---

## 6. @tiptap/y-tiptap vs Direct y-prosemirror

**Depth: Moderate | Confidence: High (source-verified)**

@tiptap/y-tiptap is a **1:1 fork** of y-prosemirror, not a wrapper. It contains a complete independent copy of the codebase with 100% API compatibility.

### Comparison

| Aspect | @tiptap/y-tiptap | y-prosemirror |
|--------|-----------------|---------------|
| Version | 3.0.3 | 1.3.7 |
| Relationship | Fork | Upstream |
| API | Identical | Identical |
| Source | `dist/` only | `src/` + `dist/` |
| Maintenance | TipTap team | Kevin Jahns |
| Additional constraints | None | N/A |

They are drop-in replacements for each other. The TipTap wrapper (`@tiptap/extension-collaboration`) adds only TipTap Extension API scaffolding around `ySyncPlugin()`.

**Evidence:** [tiptap-y-tiptap-vs-y-prosemirror.md](evidence/tiptap-y-tiptap-vs-y-prosemirror.md)

### Schema Design Implications

- **Zero schema constraint difference** between the two packages
- **Switching from TipTap to raw ProseMirror** doesn't change CRDT behavior — y-prosemirror is the same code
- **For greenfield, either works** — the choice is organizational (TipTap ecosystem vs independent), not technical

---

## 7. Concurrent Mark Operations

**Depth: Moderate | Confidence: High (source-verified)**

y-prosemirror classifies marks into two categories with different concurrent semantics:

### Non-Overlapping Marks (self-excluding)

Examples: bold, italic, code, strikethrough

- Stored as plain keys: `"bold": {}`
- Concurrent application: **union of ranges** (additive)
- Concurrent attribute change: **last-write-wins** (same key)
- Suitable for: delimiter attributes (`{ delimiter: '_' }`) — cosmetic, LWW is acceptable

### Overlapping Marks (non-self-excluding)

Examples: link, comment, annotation

- Stored as hashed keys: `"link--8aB9c2x": {href: "..."}`
- Hash = SHA-256 of `mark.toJSON()`, convolved to 6 bytes, base64
- Concurrent creation with different attrs: **both coexist** (different hashes)
- Risk: Two users independently linking the same text → two link marks coexist

### The Delimiter-Attribute Scenario

For fidelity-preserving markdown editors that store delimiter choice (`*` vs `_`) as a mark attribute:

```javascript
{ type: 'italic', attrs: { delimiter: '_' } }
```

Since italic is non-overlapping, concurrent delimiter changes are **last-write-wins**. This is acceptable — delimiter choice is cosmetic, and a valid delimiter always wins.

**Evidence:** [concurrent-mark-operations.md](evidence/concurrent-mark-operations.md)

### Schema Design Implications

- **Mark `excludes` configuration matters for CRDT behavior** — it determines overlapping vs non-overlapping storage
- **Fidelity mark attributes (delimiters, heading levels) are safe** — LWW produces valid results
- **Overlapping marks need application-level deduplication** if the schema allows the same mark type to coexist on the same range
- **The `ychange` mark name is reserved** — don't define a mark named `ychange`

---

## 8. Y.XmlFragment Internals

**Depth: Moderate | Confidence: High (source-verified)**

### ProseMirror → Y.js Type Mapping

| ProseMirror | Y.js Type | Storage |
|-------------|-----------|---------|
| `doc` node | `Y.XmlFragment` | Root container, no name, no attrs |
| Block node | `Y.XmlElement(nodeName)` | Named element with attributes |
| Inline text | `Y.XmlText` | Text content + format markers |
| Node attributes | `typeMapSet()` on XmlElement | Per-key Items in `_map` |
| Marks | ContentFormat on XmlText | Key-value format markers in linked list |

### Attribute Type Support

Y.XmlElement attributes support all JS types, but **collaborative semantics differ dramatically**:

| Type | CRDT Merge | Recommendation |
|------|-----------|----------------|
| `string`, `number`, `boolean` | Last-write-wins (atomic) | **Use for simple attrs** |
| Plain object | Last-write-wins (**whole object**) | **Avoid for concurrent editing** |
| Plain array | Last-write-wins (**whole array**) | **Avoid for concurrent editing** |
| `Y.Map` | Fine-grained per-key merge | **Use for structured data needing concurrent edits** |
| `Y.Text` | Character-level merge | **Use for collaborative text within attrs** |

### Children: Doubly-Linked List

Children are stored as Items in a doubly-linked list (not an array). Traversal is via `type._start` → `item.right` → `item.right` → `null`. Deleted items remain as tombstones with `deleted: true`. This provides:
- O(1) insert at any position
- Deterministic ordering across clients (by client ID + Lamport clock)
- Automatic conflict resolution for concurrent insertions at the same position

**Evidence:** [y-xmlfragment-internals.md](evidence/y-xmlfragment-internals.md)

### Schema Design Implications

- **Keep node attributes simple** (string, number, boolean) for reliable collaborative behavior
- **Use Y.Map for complex structured attributes** if concurrent editing of individual properties is needed
- **Plain objects in attributes are replaced atomically** — no deep merge
- **Y.XmlFragment is the natural root** — maps cleanly to ProseMirror's `doc` node
- **Tombstone accumulation** is mitigated by Y.js garbage collection, but very large documents with heavy concurrent editing will accumulate CRDT metadata

---

## Consolidated Schema Design Constraints from CRDT Layer

### Hard Constraints

| # | Constraint | Source |
|---|-----------|--------|
| C1 | Don't name any mark type `ychange` | y-prosemirror reserves it for change tracking |
| C2 | Node/mark names are permanent — renaming deletes existing instances | y-prosemirror destructive catch block |
| C3 | `Y.XmlFragment` must be root (maps to PM `doc` node) | y-prosemirror `ySyncPlugin` binding |

### Strong Recommendations

| # | Recommendation | Reason |
|---|---------------|--------|
| R1 | Use simple types (string, number, boolean) for node attributes | Objects are replaced atomically (no deep merge) |
| R2 | Decompose complex atom nodes into multiple small attributes | Each attribute is an independent CRDT merge unit |
| R3 | Choose node/mark names with care for long-term stability | No migration path for renames in Y.Doc |
| R4 | Use markdown-on-disk as canonical storage, not Y.Doc binary | Y.Docs rebuilt from markdown on load — natural schema evolution path |
| R5 | Test mark `excludes` behavior with concurrent editing scenarios | Overlapping vs non-overlapping marks have very different concurrent semantics |
| R6 | Design fidelity attributes (delimiter, heading-style) as non-overlapping mark attrs | Last-write-wins is acceptable for cosmetic attributes |

### Non-Constraints (Things That Don't Matter)

| # | Non-Constraint | Why |
|---|---------------|-----|
| N1 | Node/mark name choice | y-prosemirror is fully name-agnostic |
| N2 | TipTap vs raw ProseMirror | @tiptap/y-tiptap and y-prosemirror are 1:1 forks |
| N3 | Source-mode editor (CodeMirror) | y-codemirror.next has zero PM-schema coupling |
| N4 | Hocuspocus server configuration | Server is completely schema-agnostic |
| N5 | Adding new node/mark types to existing schema | Always safe, existing Y.Docs unaffected |

---

## Evidence Index

| File | Dimension |
|------|-----------|
| [y-prosemirror-schema-name-handling.md](evidence/y-prosemirror-schema-name-handling.md) | D1: Schema name assumptions |
| [atom-node-collaborative-editing.md](evidence/atom-node-collaborative-editing.md) | D2: Atom node support |
| [yjs-schema-evolution.md](evidence/yjs-schema-evolution.md) | D3: Schema evolution |
| [y-codemirror-next-analysis.md](evidence/y-codemirror-next-analysis.md) | D4: y-codemirror.next |
| [hocuspocus-extension-patterns.md](evidence/hocuspocus-extension-patterns.md) | D5: Hocuspocus extensions |
| [tiptap-y-tiptap-vs-y-prosemirror.md](evidence/tiptap-y-tiptap-vs-y-prosemirror.md) | D6: @tiptap/y-tiptap vs y-prosemirror |
| [concurrent-mark-operations.md](evidence/concurrent-mark-operations.md) | D7: Concurrent marks |
| [y-xmlfragment-internals.md](evidence/y-xmlfragment-internals.md) | D8: Y.XmlFragment internals |
