# Evidence: Fork/Merge for Drafts (Branching Semantics)

**Dimension:** D4 — Fork/merge API, conflict resolution, interleaving behavior
**Date:** 2026-04-07
**Sources:** loro.dev/llms-full.txt, github.com/loro-dev/loro, prior report evidence, HN discussion

---

## Key files / pages referenced

- https://www.loro.dev/llms-full.txt — Full API documentation
- https://github.com/loro-dev/loro — Core library
- /Users/edwingomezcuellar/reports/crdt-branching-namespacing-prior-art/evidence/loro-branching-api.md — Prior research
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567 — Yjs community comparison

---

## Findings

### Finding: Loro provides purpose-built fork/merge APIs that map to git semantics
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt, prior report evidence

```javascript
// Fork: create independent branch from current state
const branch = doc.fork();           // = git clone from HEAD

// Fork at a specific version
const branch = doc.forkAt(frontiers); // = git checkout <commit> -b branch

// Checkout: time-travel to a specific version (read-only detached mode)
doc.checkout(frontiers);

// Return to HEAD
doc.checkoutToLatest();

// Merge via import/export (the merge mechanism)
const updates = branch.export({ mode: "update", from: mainDoc.version() });
mainDoc.import(updates);

// Batch import for efficiency
mainDoc.importBatch([updates1, updates2]);  // single diff calculation
```

After `checkout()`, the document enters "detached" mode (read-only by default). `checkoutToLatest()` returns to editing mode.

### Finding: Merge uses Fugue algorithm — maximal non-interleaving
**Confidence:** CONFIRMED
**Evidence:** loro.dev docs, Yjs comparison discussion, crdt-richtext repo

Loro uses the Fugue algorithm for text, which achieves "maximal non-interleaving." This means:

**Scenario:** Two branches both edit the same paragraph.
- Branch A: inserts "Hello " at position 0
- Branch B: inserts "World" at position 0

**Yjs result:** Interleaved characters (e.g., "HWeolrlold" — characters from both insertions mixed together). This is because Yjs resolves concurrent inserts at the same position using only leftOrigin, which can produce interleaving when two users type at the same position independently.

**Loro result:** Non-interleaved (e.g., "Hello World" or "WorldHello" — one insertion placed entirely before or after the other). Fugue uses both leftOrigin and rightOrigin to resolve ambiguity, achieving "maximal non-interleaving."

This is the critical distinction the prior CRDT branching research (TQ13) warned about. Loro's Fugue-based merge avoids the character-level interleaving that makes Yjs branch merging unusable for diverged text editing.

### Finding: Merge is at the CRDT operation level, not three-way diff
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt, Eg-walker documentation

Loro merge is NOT a three-way text diff like git. It replays divergent operations from both branches through the Fugue CRDT algorithm. The Eg-walker approach "replays only the divergent history when merging" — it identifies the common ancestor (frontier) and applies only the operations that diverged.

Merge semantics by data type:
- **Text/List**: Both concurrent edits are preserved (non-interleaving via Fugue)
- **Map**: Last-Write-Wins (LWW) comparing Lamport timestamps
- **Tree**: Move operations use the "Moving Elements in List CRDTs" algorithm
- **Container overwrites**: Parallel child container initialization can cause data loss — best practice is initializing containers at root level

### Finding: Fork creates a true independent document
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

`fork()` creates a new LoroDoc that shares the same operation history up to the fork point but can be edited independently. The forked document has its own peer ID and generates its own operations. This is semantically equivalent to `git branch` — a lightweight operation that creates a new line of development.

`forkAt(frontiers)` creates a fork at any arbitrary point in history, equivalent to `git checkout <commit> -b <branch>`.

### Finding: Import/export enables delta sync between branches
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

```javascript
// Export only changes since a known version (delta)
const delta = branch.export({ mode: "update", from: mainDoc.version() });

// Import returns status information
const status = mainDoc.import(delta);

// Batch import for multiple branches (faster — single diff calculation)
mainDoc.importBatch([deltaFromBranch1, deltaFromBranch2]);
```

Export modes:
- `"update"` — all operations (or delta from a version)
- `"snapshot"` — complete document state
- `"shallow-snapshot"` — compact snapshot without full history
- `"updates-in-range"` — operations within a specific version range

### Finding: Conflict handling is automatic but semantic conflicts need application-level resolution
**Confidence:** INFERRED
**Evidence:** loro.dev docs, CRDT semantics

CRDT merge is deterministic — the same operations always produce the same result regardless of order. But "conflict-free" at the CRDT level doesn't mean "conflict-free" at the application level. Two branches that both rewrite the same paragraph will merge both versions into the text (non-interleaved, but both present). The application needs to detect this and present a human-reviewable merge.

This is analogous to git's automatic merge — no syntactic conflicts, but the result may not be semantically correct. Unlike git, Loro cannot produce merge conflicts that require manual resolution at the CRDT level.

### Finding: The prior report's concern about interleaving is addressed by Loro
**Confidence:** CONFIRMED
**Evidence:** Prior report (crdt-branching-namespacing-prior-art), Loro Fugue documentation

The prior report stated: "Yjs cannot merge branches at the CRDT level. Merging two independently-edited Y.Docs produces interleaved text." and "Loro uses eg-walker-inspired merge that avoids Yjs interleaving problem."

This is confirmed. Loro's Fugue algorithm specifically solves the interleaving problem that makes Yjs branch merging unusable. If two branches diverge and both edit the same text region, Loro produces a sensible merge where each edit is preserved as a contiguous block, not character-by-character interleaving.

---

## Gaps / follow-ups

- No firsthand testing of merge behavior on complex rich text documents with overlapping formatting
- Application-level conflict detection (when both branches edit the same paragraph) is not built into Loro — needs application logic
- No documentation on merge visualization or diff generation between branches
- Performance of merging very large divergent branches not benchmarked
