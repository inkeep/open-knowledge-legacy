# Evidence: D4 Loro — LoroTree and movable-tree CRDT

**Dimension:** Loro — does LoroTree/LoroDoc support three-way merge against external non-CRDT tree state?
**Date:** 2026-04-17
**Sources:** loro.dev docs, docs.rs/loro, Loro blog on movable-tree CRDT, loro-dev/loro GitHub

---

## Key files / pages referenced

- [Loro Tree docs](https://www.loro.dev/docs/tutorial/tree) — tutorial on the Tree type
- [Loro movable-tree blog post](https://loro.dev/blog/movable-tree) — design rationale for the tree CRDT
- [docs.rs/loro](https://docs.rs/loro/) — Rust API reference
- [Loro 1.0 blog](https://loro.dev/blog/v1.0) — production readiness claim
- [DeepWiki Loro CRDT Algorithms](https://deepwiki.com/loro-dev/loro/6.1-crdt-algorithms) — third-party summary of CRDT algorithms

---

## Findings

### Finding: Loro's tree CRDT is based on Kleppmann et al.'s movable-tree algorithm — op-based, conflict-free by construction

**Confidence:** CONFIRMED
**Evidence:** [Loro movable-tree blog](https://loro.dev/blog/movable-tree)

> "Loro implements the concept of a movable tree CRDT, based on the algorithm created by Kleppmann et al. in 'A highly-available move operation for replicated trees.'"
> "The paper unifies the three operations used in trees (creating, deleting, and moving nodes) into a move operation. Loro solves this by combining the three tree operations (create, delete, move) into a single move operation represented as a 4-tuple (Move t p m c), and Loro solves this using undo-replay to handle conflicts with global invariants."
> "Loro further employs Fractional Index to sort each child node, ensuring that sibling nodes maintain an orderly sequence."

This is a **CRDT-native** algorithm — convergence is guaranteed by construction when combining op-logs from multiple Loro replicas. **It is not a three-way merge of tree states; it is an op-based merge of tree operations.**

### Finding: Loro provides fork/merge/checkout primitives — but exclusively between Loro versions

**Confidence:** CONFIRMED
**Evidence:** [Loro 1.0 blog](https://loro.dev/blog/v1.0), [docs.rs/loro](https://docs.rs/loro/)

From the Loro 1.0 announcement:
> "Loro supports primitives that allow users to switch between different versions, fork new branches, edit on new branches, and merge branches. Based on this operation primitive, applications can build various Git-like capabilities: You can merge multiple versions without needing to manually resolve conflicts."

From docs.rs investigation:
> "LoroDoc is the main entry point for almost all Loro functionality... Version Control: Track document history, checkout versions, and manage branches"

Loro's version-control primitives operate on **Loro document versions** — internal CRDT states identified by version vectors. `fork()`/`merge()`/`checkout()` all assume the data is Loro-format. There is no API to reconcile a Loro tree state against an external, non-Loro tree (e.g., an mdast tree parsed from a markdown file, a DOM tree, or a JSON blob).

### Finding: Loro has no API for three-way merge against external non-CRDT state

**Confidence:** CONFIRMED
**Evidence:** [docs.rs/loro](https://docs.rs/loro/) (via WebFetch investigation)

Direct investigation of the Rust API docs:
> "Loro does not expose any API for three-way merge against external non-CRDT state. The merge approach is entirely CRDT-operation-history based."
> "The documented sync mechanism involves: Exporting incremental updates via `export(ExportMode::updates(&vv))`, Importing those updates with `import`, Time travel capabilities using `checkout` to specific versions."
> "There is no mention of APIs supporting three-way merge scenarios that would reconcile a base state, a Loro document state, and an external non-CRDT tree. Loro's merging is confined to combining operation logs from multiple Loro replicas themselves."

### Finding: Loro's tree can be associated with a Map per node for arbitrary data — but this doesn't change the merge semantics

**Confidence:** CONFIRMED
**Evidence:** [Loro movable-tree blog](https://loro.dev/blog/movable-tree)

> "Loro associates a Map with each tree node, serving as a data container for the node, allowing you to nest any data structure supported by Loro."

Each node's Map is itself a Loro CRDT — so nested data merges are also CRDT-op-based. This expands the data model's expressiveness but does not add any external-state-reconciliation primitive.

---

## Implications for the central research question

Loro — the most capable tree CRDT currently shipping to production (v1.0, 2024-2026) — provides excellent **CRDT-internal** branching and merging:
- Movable-tree operations with proven convergence
- Git-like fork/merge/checkout across Loro versions
- Fractional indices for ordered children

But it does **not** solve the tree-level three-way merge problem against external non-CRDT state. Applications that need to reconcile a LoroTree against, say, a filesystem state or a mdast parse of an external file must:
1. Accept the external state as authoritative and re-seed the Loro doc (losing local concurrent edits), or
2. Serialize Loro to a canonical format, run three-way text/line-diff3 at that layer, re-parse → import into Loro (the serialize-merge-parse fallback)

This matches the pattern seen in Automerge (D2) and the Yjs ecosystem (D3).

---

## Negative searches

- Searched loro.dev docs for "external", "disk", "non-CRDT", "reconcile", "file watcher" → no authoritative pattern
- Searched loro-dev/loro GitHub issues for "3-way merge with non-CRDT" → no hits
- No Loro plugin or binding (e.g., loro-prosemirror, loro-codemirror) exposes an external-state-reconciliation primitive

---

## Gaps / follow-ups

- Loro's MovableList vs LoroTree for different tree-shaped data is an internal distinction; both converge via op-based CRDT
- loro-prosemirror is at v0.4.x (pre-1.0); its binding is 2-way just like y-prosemirror's (no evidence of 3-way extension)
