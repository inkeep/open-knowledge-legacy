---
title: "Automerge as Alternative CRDT Stack: Migration Assessment for a TipTap + Hocuspocus Knowledge Editor"
description: "Deep source-code-level assessment of migrating from Yjs (TipTap + Hocuspocus + y-prosemirror) to Automerge (automerge-prosemirror + automerge-repo). Covers the ProseMirror binding internals, sync infrastructure comparison, TipTap integration path, dual-view architecture viability, void node representation, markdown serialization, agent write path, performance trade-offs, and migration effort estimate."
createdAt: 2026-04-07
updatedAt: 2026-04-07
subjects:
  - Automerge
  - automerge-prosemirror
  - automerge-repo
  - automerge-codemirror
  - Yjs
  - TipTap
  - ProseMirror
  - Hocuspocus
  - Peritext
  - CodeMirror 6
topics:
  - CRDT migration assessment
  - Peritext rich text model
  - dual-view editor architecture
  - collaborative editor infrastructure
---

# Automerge as Alternative CRDT Stack: Migration Assessment for a TipTap + Hocuspocus Knowledge Editor

**Purpose:** Determine whether migrating from Yjs v13 (TipTap + Hocuspocus + y-prosemirror) to Automerge (automerge-prosemirror + automerge-repo) is worth the cost, with a focus on whether Automerge's Peritext model solves the dual-view problem (WYSIWYG + source mode on the same CRDT). The reader cares about: technical feasibility, what each piece of the stack looks like at the source code level, and whether the migration delivers enough value to justify the effort.

---

## Executive Summary

**The migration is technically feasible but strategically inadvisable.** automerge-prosemirror (3,272 lines, v0.2.0 beta, last commit Feb 2026) is a working binding that maps Automerge's flat text + block markers + inline marks to ProseMirror's tree structure via a `SchemaAdapter` and traversal algorithm. automerge-repo (v2.5.3) provides WebSocket sync, pluggable storage, presence, and a clean `handle.change()` API for server-side writes. Both are actively maintained by the Automerge/Ink & Switch team.

However, the primary motivation -- that Automerge's Peritext model "natively solves" the dual-view problem -- is **partially incorrect**. Automerge's flat text sequence contains block marker objects (not markdown text), so CodeMirror cannot display it directly as markdown source. A translation layer between Automerge spans and markdown is still required. The dual-view problem is structurally simpler on Automerge (flat sequence to markdown is easier than tree to markdown), but it remains the same class of problem that exists on Yjs.

The migration would cost 12-20 weeks of engineering effort while losing TipTap ecosystem compatibility, Hocuspocus's mature sync infrastructure, the smaller Yjs bundle (69KB vs 1.7MB WASM), and the stability of battle-tested production libraries. What you gain -- native Peritext boundary semantics, built-in version history, and a structurally simpler span model -- does not justify this cost, especially given that the prior Peritext-on-Yjs feasibility report demonstrated the dual-view architecture is achievable on Yjs in 2-4 weeks.

**Key Findings:**

- **automerge-prosemirror is real, working, but beta.** 3,272 lines handling blocks (headings, code blocks, lists, blockquotes), inline marks (bold, italic, links), and atom/embed nodes (images). No table support. No cursor/presence plugin. Version 0.2.0.
- **The dual-view architecture does NOT get solved for free.** Automerge's block markers are objects in the CRDT sequence, not markdown text. CodeMirror sees raw splice operations, not formatted markdown. A translation layer is still needed.
- **automerge-repo is less mature than Hocuspocus.** No authentication hooks, no document lifecycle callbacks, no extension system. The sync server is a bare Express app.
- **Performance trade-offs are significant.** 1.7MB WASM bundle (vs 69KB Yjs), 4.5x larger update messages (121 vs 27 bytes per keystroke), though Automerge 3.0 dramatically improved memory usage (700MB to 1.3MB for large docs).
- **Migration is all-or-nothing.** No incremental path. Requires full cutover of editor stack, data migration, and infrastructure replacement.

**Recommendation: Do not migrate.** Build the dual-view architecture on Yjs using the approaches validated in the source-toggle-architecture and peritext-on-yjs-feasibility reports. The 2-4 week Yjs path delivers the product capability without the 12-20 week migration cost and associated risk.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | automerge-prosemirror binding: source code analysis | Deep | P0 |
| D2 | Automerge sync infrastructure (automerge-repo) | Deep | P0 |
| D3 | TipTap integration path | Deep | P0 |
| D4 | Dual-view architecture on Automerge (CM6 binding) | Deep | P0 |
| D5 | Void node representation in Automerge flat text | Deep | P0 |
| D6 | Markdown serialization path | Moderate | P0 |
| D7 | Agent write path | Deep | P0 |
| D8 | Performance comparison (Automerge vs Yjs) | Deep | P0 |
| D9 | Migration effort estimate | Deep | P0 |

**Stance:** Factual with conclusions.
**Non-goals:** Implementing the migration, designing the PM schema, general TipTap architecture (covered by existing reports).

---

## Detailed Findings

### D1: automerge-prosemirror Binding -- Source Code Analysis

**Finding: A working 3,272-line binding maps Automerge's flat text + spans to ProseMirror's tree via a SchemaAdapter and stack-based traversal algorithm. It handles blocks, marks, and atom nodes, but not tables or cursors.**

**Evidence:** [evidence/automerge-prosemirror-binding.md](evidence/automerge-prosemirror-binding.md)

The binding, published as `@automerge/prosemirror` v0.2.0 (last commit Feb 25, 2026), consists of:

| File | Lines | Role |
|------|-------|------|
| `traversal.ts` | 1,016 | Core flat-to-tree and tree-to-flat conversion |
| `schema.ts` | 314 | SchemaAdapter mapping blocks/marks between AM and PM |
| `basicSchema.ts` | 354 | Default PM schema with Automerge annotations |
| `syncPlugin.ts` | 147 | ProseMirror plugin -- syncs AM document to PM view |
| `pmToAm.ts` | ~200 | PM transaction steps to AM splice/mark operations |
| `amToPm.ts` | -- | AM patches to PM transactions |
| `types.ts` | 109 | BlockMarker, Span type definitions |

**How it works:** Automerge stores rich text as a flat sequence containing text characters, block marker objects (`{ type: "heading", parents: [], attrs: { level: 1 }, isEmbed: false }`), and inline marks (annotations on character ranges). The `SchemaAdapter` maps each Automerge block type to a ProseMirror NodeSpec and each Automerge mark name to a PM MarkSpec. The `traverseSpans()` generator walks the flat sequence and emits `openTag`, `closeTag`, `leafNode`, `text`, and `block` events. `pmDocFromSpans()` consumes these events with a stack to build the PM node tree.

The `parents` array on block markers enables arbitrary nesting: a list item inside a blockquote has `parents: ["blockquote"]`, with the block type `ordered-list-item`. This is the same model documented in the Peritext-on-Yjs feasibility report's D2 dimension.

**Block nodes supported:** paragraph, heading (with level attribute), code_block, blockquote, ordered_list/bullet_list + list_item (context-dependent mapping via `block.within`), aside, image (as embed). **Tables are absent** from the basic schema and would require custom SchemaAdapter extension.

**Inline marks supported:** bold (`strong`), italic (`em`), links (with JSON-encoded href/title). The SchemaAdapter handles Peritext expand semantics via the `inclusive` flag on PM MarkSpecs -- `inclusive: false` maps to `expand: "none"` (links don't extend when typing at boundaries), `inclusive: true` maps to `expand: "both"`.

**Atom/embed nodes:** Handled via the `isEmbed: true` flag on block markers. The traversal emits a `leafNode` event instead of `openTag`/`closeTag`, producing an inline or block-level atom node in PM.

**What's missing:** No table support. No cursor/presence decorations (the binding handles document content only). No undo/redo integration. The API is beta (v0.2.0) and subject to change.

**ProseMirror compatibility:** Requires prosemirror-model ^1.25.2, prosemirror-state ^1.4.3, prosemirror-view ^1.40.1 -- compatible with current TipTap versions. Requires `@automerge/automerge ^3.1`.

**Decision triggers:**
- If table support is P0 for the editor, this binding requires extension before being usable
- If cursor/presence is P0, custom implementation is needed (~1-2 weeks additional)

---

### D2: Automerge Sync Infrastructure

**Finding: automerge-repo provides WebSocket sync, pluggable storage, presence, and server-side writes -- but it is substantially less featured than Hocuspocus.**

**Evidence:** [evidence/automerge-sync-infrastructure.md](evidence/automerge-sync-infrastructure.md)

[automerge-repo](https://github.com/automerge/automerge-repo) (7,982 lines in core, v2.5.3) is the "batteries-included" toolkit for Automerge. It provides:

- **WebSocket sync:** `@automerge/automerge-repo-network-websocket` (579 lines) with `WebSocketClientAdapter` and `WebSocketServerAdapter`. Works in browser and Node.js.
- **Persistence:** Pluggable `StorageAdapter` interface with implementations for IndexedDB (browser) and Node.js filesystem.
- **Document lifecycle:** `DocHandle` wraps an xstate state machine with states: `idle -> loading -> requesting -> ready`, plus `unavailable`, `unloaded`, `deleted`.
- **Presence:** The `Presence` class (287 lines) provides ephemeral state broadcast via `handle.broadcast()`. Supports typed state channels, heartbeats, peer tracking, and automatic peer pruning. Structurally equivalent to Yjs awareness protocol.
- **Server-side writes:** `handle.change(doc => { ... })` on a server-side `Repo` instance. Changes automatically propagate to connected peers.

**The [sync server](https://github.com/automerge/automerge-repo-sync-server) is a minimal Express app** configured with `PORT` and `DATA_DIR` environment variables. It uses `automerge-repo-storage-nodefs` for persistence.

| Feature | Hocuspocus | automerge-repo + sync-server |
|---------|-----------|------------------------------|
| WebSocket sync | Yes | Yes |
| Persistence hooks | `onStoreDocument`, `onLoadDocument` | Automatic via StorageAdapter |
| Authentication | `onAuthenticate` extension | Not built-in |
| Document lifecycle callbacks | Load/unload/destroy hooks | xstate machine + events |
| Server-side writes | DirectConnection | `handle.change()` |
| Presence/awareness | Yjs awareness protocol | Presence class (ephemeral) |
| Rate limiting | Built-in | Not built-in |
| Extension system | Rich plugin architecture | Network/Storage adapter interfaces |
| Maturity | Production (v3.4.4) | Production-ish (v2.5.3) |

**Key difference:** Hocuspocus provides rich lifecycle hooks (`onStoreDocument` triggers the markdown conversion pipeline). automerge-repo has no equivalent hook -- you'd listen to `handle.on("change", ...)` events and implement custom persistence logic. This is architecturally different and would require rethinking the persistence pipeline.

**Implications:**
- The sync infrastructure works but requires building features that Hocuspocus provides out of the box
- Authentication, rate limiting, and document access control would be custom implementations
- The persistence pipeline architecture needs to change from hook-based to event-based

---

### D3: TipTap Integration Path

**Finding: automerge-prosemirror returns a raw ProseMirror plugin. Integration with TipTap requires either a thin extension wrapper (recommended) or bypassing TipTap's collaboration extension entirely. Both approaches require replacing undo/redo and cursor plugins.**

**Evidence:** [evidence/tiptap-integration-path.md](evidence/tiptap-integration-path.md)

TipTap's `@tiptap/extension-collaboration` depends on `@tiptap/y-tiptap`, which wraps three y-prosemirror plugins: ySyncPlugin, yUndoPlugin, yCursorPlugin. Replacing it with Automerge means replacing all three:

1. **Sync:** Direct replacement -- `syncPlugin` from `@automerge/prosemirror`
2. **Undo:** No Automerge ProseMirror undo plugin exists. Automerge has built-in undo/redo at the document level (`A.changeAt()` with historical heads), but no ProseMirror integration. Custom implementation needed (~1-2 weeks).
3. **Cursors:** No automerge-prosemirror cursor plugin exists. Custom implementation needed using automerge-repo Presence API + PM decorations (~1-2 weeks).

**The schema ownership problem:** automerge-prosemirror's `init()` function builds the PM schema from the `SchemaAdapter`, while TipTap builds its schema by merging all extensions' NodeSpecs and MarkSpecs. These two schema-building processes conflict. Resolution: build the schema via SchemaAdapter with Automerge annotations, then ensure TipTap extensions produce compatible specs. This means every TipTap extension used (heading, codeBlock, list, link, bold, italic, etc.) needs an Automerge-annotated version.

**Recommended approach:** Create `@tiptap/extension-collaboration-automerge` (~50-80 lines) that wraps the ProseMirror sync plugin, plus separate extensions for undo and cursors. But every content extension also needs Automerge schema annotations -- this is the largest integration cost.

---

### D4: Dual-View Architecture on Automerge

**Finding: The dual-view problem (WYSIWYG + source mode on the same CRDT) is NOT solved natively by Automerge's Peritext model. Block markers are objects in the CRDT sequence, not markdown text. A translation layer is still required.**

**Evidence:** [evidence/dual-view-architecture.md](evidence/dual-view-architecture.md)

[automerge-codemirror](https://github.com/automerge/automerge-codemirror) exists as a first-party binding (242 lines, v0.2.0, last commit July 2025). It binds CodeMirror to plain text via `A.splice()`. It does NOT understand block markers, marks, or rich text structure.

If both ProseMirror and CodeMirror bind to the same Automerge text field:
- ProseMirror reads via `A.spans()` which returns structured data: block markers, text spans with marks
- CodeMirror reads via plain text indexing -- it would see block marker objects as opaque characters, not markdown

**The CRDT sequence is NOT "flat text that CodeMirror can read."** It is a sequence containing both text characters AND block marker objects (`{ type: "heading", parents: [], attrs: { level: 1 } }`). This is different from what markdown source looks like.

To achieve WYSIWYG + markdown source, you still need a bidirectional translation layer:
1. Automerge spans -> markdown string (for CodeMirror display)
2. Markdown string edits -> Automerge span operations (for CodeMirror input)

This is structurally the same problem as on Yjs (Options A/B/I from the source-toggle-architecture report). **The advantage of Automerge is that the translation is simpler** -- the flat span model is closer to what a markdown parser produces than Y.XmlFragment's tree -- but it remains a translation problem, not a zero-cost binding.

The serialize-on-toggle approach (Option I) works identically on Automerge: serialize spans to markdown on toggle-to-source, parse markdown back to spans on toggle-to-WYSIWYG.

**Remaining uncertainty:**
- Building a custom CodeMirror binding that understands Automerge rich text spans (~500-800 lines estimated) could provide a tighter integration than serialize-on-toggle. But this binding does not exist and would need to solve the same round-trip fidelity challenges documented in the source-toggle report.

---

### D5: Void Node Representation

**Finding: Void/atom nodes (like jsxComponent) map directly to Automerge block markers with `isEmbed: true`. The representation is structurally equivalent to Yjs Y.XmlElement.**

**Evidence:** [evidence/void-node-representation.md](evidence/void-node-representation.md)

In Automerge's rich text model, a void/atom node is a block marker occupying 1 position in the sequence with `isEmbed: true`. Attributes are stored in the `attrs` object. The image node in `basicSchema.ts` demonstrates this pattern with custom `attrParsers` for `fromAutomerge` and `fromProsemirror` directions.

A jsxComponent would follow the same pattern with `block: "jsx-component"`, `isEmbed: true`, and a `jsx` attribute storing the raw JSX string. Migration of existing void nodes is straightforward: Yjs `Y.XmlElement` with attributes maps 1:1 to Automerge block marker with `isEmbed: true`.

---

### D6: Markdown Serialization Path

**Finding: The same @tiptap/markdown serializer works regardless of CRDT backend. The PM schema needs Automerge annotations but downstream markdown conversion is unaffected.**

**Evidence:** [evidence/markdown-serialization.md](evidence/markdown-serialization.md)

Current pipeline: `Y.Doc -> Y.XmlFragment -> PM Node -> @tiptap/markdown -> markdown`

Automerge pipeline: `AM doc -> A.spans() -> pmDocFromSpans() -> PM Node -> @tiptap/markdown -> markdown`

Both pipelines converge at the PM Node. `@tiptap/markdown` operates on ProseMirror document structure, which is CRDT-backend-agnostic. The internal tracking attributes (`isAmgBlock`, `unknownAttrs`) added by the SchemaAdapter are invisible to markdown serializers.

A direct Automerge-to-markdown serializer (bypassing PM, ~300-500 lines) is also feasible because the flat span model maps naturally to linear markdown output.

---

### D7: Agent Write Path

**Finding: `handle.change()` on a server-side Repo is the direct equivalent of Hocuspocus DirectConnection. The API is clean and changes propagate automatically to connected clients.**

**Evidence:** [evidence/agent-write-path.md](evidence/agent-write-path.md)

The Automerge agent write API:
```typescript
const handle = repo.find(documentUrl)
handle.change(doc => {
  am.splice(doc, ["content"], insertionPoint, 0, "Agent text")
})
```

This is comparable in simplicity to Hocuspocus DirectConnection. Changes propagate automatically via the Repo's NetworkSubsystem. For structured rich text writes, the agent would use `A.updateSpans()` or convert PM nodes via `pmNodeToSpans()`.

**Key difference:** The agent needs Automerge document URLs (opaque identifiers) rather than human-readable document names. A mapping layer would be needed.

---

### D8: Performance Comparison

**Finding: Automerge 3.0 dramatically improved memory (538x for large documents) but still has a 24x larger bundle, 4.5x larger update messages, and full operation history growth.**

**Evidence:** [evidence/performance-comparison.md](evidence/performance-comparison.md)

| Metric | Yjs 13.6.x | Automerge 3.0 |
|--------|-----------|---------------|
| Bundle size | 69 KB (20 KB gzip) | ~1.7 MB (604 KB gzip) |
| Avg update size | 27 bytes | ~121 bytes |
| Encoded doc size | 6,031 bytes | ~3,992 bytes (smaller) |
| Memory (Moby Dick) | ~10 MB | 1.3 MB (improved) |
| History storage | Discardable (GC) | Full DAG (always) |

Automerge 3.0 (July 2025) closed the memory gap. The WASM bundle (600KB gzipped) and update size (4.5x larger per keystroke) remain the practical concerns for a browser-based knowledge editor.

---

### D9: Migration Effort Estimate

**Finding: Full migration to feature parity requires 12-20 weeks (3-5 engineer-months). The migration is all-or-nothing with no incremental path.**

**Evidence:** [evidence/migration-effort.md](evidence/migration-effort.md)

| Component | Effort |
|-----------|--------|
| SchemaAdapter for all TipTap extensions | 2-3 weeks |
| TipTap extension wrapper | 1 week |
| Cursor/presence plugin | 1-2 weeks |
| Undo/redo integration | 1-2 weeks |
| Sync server (replace Hocuspocus) | 1-2 weeks |
| Agent write path migration | 1 week |
| Markdown serialization pipeline | 1 week |
| Data migration (Y.Docs to Automerge) | 1-2 weeks |
| Source toggle (dual-view) | 2-3 weeks |
| Testing + edge cases | 2 weeks |
| **Total** | **12-20 weeks** |

**The source toggle problem -- the primary migration motivation -- is NOT solved by the migration.** The same translation layer between CRDT representation and markdown is needed on both Yjs and Automerge.

---

## Limitations & Open Questions

### Not Fully Confirmed
- Automerge 3.0's real-world performance with rich text editing (benchmarks are for plain text)
- Whether automerge-prosemirror's beta API will change significantly before 1.0
- Whether Automerge's full history growth is manageable for long-lived knowledge documents
- Table support feasibility via custom SchemaAdapter extension

### Out of Scope
- Implementing the migration
- Designing the ProseMirror schema for the product
- General TipTap/Hocuspocus architecture (covered by source-toggle-architecture report)
- Yjs 14 unified YType evaluation (covered by peritext-on-yjs-feasibility report)

---

## References

### Evidence Files
- [evidence/automerge-prosemirror-binding.md](evidence/automerge-prosemirror-binding.md) -- Source code analysis of the 3,272-line binding
- [evidence/automerge-sync-infrastructure.md](evidence/automerge-sync-infrastructure.md) -- automerge-repo architecture and Hocuspocus comparison
- [evidence/tiptap-integration-path.md](evidence/tiptap-integration-path.md) -- TipTap extension wrapper and schema ownership
- [evidence/dual-view-architecture.md](evidence/dual-view-architecture.md) -- Why dual-view is not free on Automerge
- [evidence/void-node-representation.md](evidence/void-node-representation.md) -- isEmbed block marker pattern
- [evidence/markdown-serialization.md](evidence/markdown-serialization.md) -- Serialization pipeline comparison
- [evidence/agent-write-path.md](evidence/agent-write-path.md) -- handle.change() vs DirectConnection
- [evidence/performance-comparison.md](evidence/performance-comparison.md) -- Benchmarks and bundle size
- [evidence/migration-effort.md](evidence/migration-effort.md) -- Component-by-component effort estimate

### External Sources
- [automerge-prosemirror GitHub](https://github.com/automerge/automerge-prosemirror) -- Official ProseMirror binding
- [automerge-codemirror GitHub](https://github.com/automerge/automerge-codemirror) -- Official CodeMirror 6 binding
- [automerge-repo GitHub](https://github.com/automerge/automerge-repo) -- Batteries-included toolkit
- [automerge-repo-sync-server GitHub](https://github.com/automerge/automerge-repo-sync-server) -- Reference sync server
- [@automerge/prosemirror npm](https://www.npmjs.com/package/@automerge/prosemirror) -- npm package
- [Automerge 3.0 blog post](https://automerge.org/blog/automerge-3/) -- Performance improvements
- [Automerge Rich Text Schema](https://automerge.org/docs/reference/under-the-hood/rich-text-schema/) -- Official rich text documentation
- [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks) -- Performance comparison suite

### Related Research
- [peritext-on-yjs-feasibility](../peritext-on-yjs-feasibility/) -- Peritext model on Yjs: 3 architectures from 2-10 weeks
- [source-toggle-architecture](../source-toggle-architecture/) -- 9 architectures for WYSIWYG/source toggle
