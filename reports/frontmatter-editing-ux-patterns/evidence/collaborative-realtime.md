# Evidence: Collaborative & Real-Time Considerations

**Dimension:** How metadata editing behaves under CRDT/multiplayer
**Date:** 2026-04-24
**Sources:** Notion multiplayer behavior, Craft collaboration, Y.js documentation, Ink & Switch local-first research, Martin Kleppmann JSON CRDT research

---

## Findings

### Finding: Notion uses per-property last-write-wins for metadata
**Confidence:** CONFIRMED
**Evidence:** Notion multiplayer product behavior

- Two users editing different properties: changes merge cleanly, no conflict
- Two users editing the same property: last save wins silently, no merge UI
- Select/multi-select mutations (adding an option): serialized server-side
- Property renames and type changes: database-level operations that lock briefly and propagate

### Finding: Y.Map gives field-level conflict resolution automatically — superior to text-based YAML merge
**Confidence:** CONFIRMED
**Evidence:** Y.js documentation, CRDT theory

**Y.Map with per-key entries (ideal):** Each frontmatter key becomes a Y.Map entry. Concurrent edits to different keys merge automatically. Per-key last-writer-wins with causal ordering.

**Y.Map with single-string storage (common):** Frontmatter stored as a single YAML string in a Y.Map entry gives only document-level LWW for the entire frontmatter block. Any concurrent edit to any field conflicts.

**Y.Text (metadata as raw YAML in text buffer):** Character-level CRDT merge on the same YAML line can produce syntactically invalid YAML. Example: concurrent `title: Foo` and `title: Bar` → potential merge artifact `title: FooBar`. Strictly worse for structured data.

**Implications:** Systems storing frontmatter as a single string would benefit from decomposition to per-key Y.Map entries for field-level merge semantics.

### Finding: Nested values (arrays, objects) need Y.Array/Y.Map for proper merge
**Confidence:** INFERRED
**Evidence:** Y.js CRDT semantics

For `tags: [a, b, c]`: using `Y.Array` nested inside the map preserves per-element merge semantics. Storing the array as a JSON string in a Y.Map entry degrades to LWW for the whole array — concurrent tag additions would conflict.

### Finding: Concurrent property type changes are a hard problem
**Confidence:** INFERRED
**Evidence:** CRDT theory, cross-product behavior

If User A changes a property from `string` to `date` while User B types a string value, the result depends on operation ordering. Practical approaches:
1. Type metadata as separate Y.Map entry with LWW — type change "wins," UI re-renders value with new type widget, potentially showing parse error
2. Optimistic local-first — apply both and show validation warning

No mainstream product handles this gracefully. Notion sidesteps it by making type changes database-level operations with brief locks.

### Finding: No product shows field-level presence cursors for metadata
**Confidence:** CONFIRMED
**Evidence:** Cross-product survey (Notion, Craft, Google Docs)

The state of the art is document-level presence (avatar in doc header or sidebar). Field-level awareness (showing who is editing which property) would require mapping `awareness.localState` to specific Y.Map keys — technically straightforward with Y.js awareness but no product ships it. The cost is visual clutter for low-frequency metadata edits.

### Finding: Ink & Switch research validates map-based CRDTs for metadata
**Confidence:** CONFIRMED
**Evidence:** Ink & Switch local-first software research, Martin Kleppmann's JSON CRDT work (Automerge)

Structured data benefits from operation-based CRDTs (like Y.Map) over sequence CRDTs (like Y.Text). Map structures with per-key LWW and nested arrays/maps give the best trade-off between merge quality and implementation complexity for metadata-shaped data.

---

## Gaps / follow-ups

- Performance implications of decomposing frontmatter string to per-key Y.Map entries (migration cost, observer bridge impact)
- Undo semantics for metadata edits in a collaborative context
