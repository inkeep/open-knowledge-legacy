# Evidence: D2 Automerge merge semantics

**Dimension:** Automerge — CRDT op-history merge vs three-way merge against external non-CRDT state
**Date:** 2026-04-17
**Sources:** automerge.org official docs, Ink & Switch Patchwork/Upwelling, Tiny Essay Editor GitHub

---

## Key files / pages referenced

- [Automerge Merge Rules docs](https://automerge.org/docs/reference/under-the-hood/merge-rules/) — authoritative statement of merge semantics
- [Automerge main site](https://automerge.org/) — product framing
- [Document Data Model](https://automerge.org/docs/reference/documents/) — types + merge
- [Ink & Switch Upwelling](https://www.inkandswitch.com/upwelling/) — drafts-as-branches research prototype
- [Ink & Switch Patchwork Simple Branching](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/06/) — follow-up research
- [Tiny Essay Editor GitHub](https://github.com/inkandswitch/tiny-essay-editor) — production-adjacent markdown editor on Automerge

---

## Findings

### Finding: Automerge merge is strictly CRDT-op-history — history-carrying documents combine via common-ancestor change sets

**Confidence:** CONFIRMED
**Evidence:** [Automerge Merge Rules](https://automerge.org/docs/reference/under-the-hood/merge-rules/)

> "Automerge documents always carry their history with them, so the way to think about two concurrent versions of a document is as the set of changes since some common ancestor."

Merge combines **op-histories** (CRDT operation logs) from two replicas since their last-known common point. Example conflict-resolution rule cited in the docs: concurrent edits to the same key "arbitrarily choose one value" while ensuring all nodes agree on the selection.

### Finding: Automerge provides no API for three-way merge against non-CRDT external state

**Confidence:** CONFIRMED
**Evidence:** [Automerge Merge Rules](https://automerge.org/docs/reference/under-the-hood/merge-rules/) (via WebFetch investigation)

Direct investigation of the merge-rules page: "The provided documentation does not describe any built-in mechanism for reconciling Automerge documents against plain markdown or text files edited outside the system. The merge rules detailed focus exclusively on combining changes between Automerge replicas, not integrating non-CRDT external content."

This is a fundamental shape of the Automerge API: "to merge" means "to combine two Automerge documents that share a common root." It does NOT mean "to reconcile an Automerge document against an arbitrary external string."

### Finding: Tiny Essay Editor (Ink & Switch's production-ish markdown editor on Automerge) has no external-state reconciliation

**Confidence:** CONFIRMED
**Evidence:** [tiny-essay-editor README](https://github.com/inkandswitch/tiny-essay-editor) (via WebFetch investigation)

From the README investigation:
> "the documentation does **not** describe reconciliation mechanisms between Automerge document state and external markdown files."
> "The page mentions that users can 'Save out .md file with a Download button,' indicating export capability. However, there is no discussion of importing external markdown changes or reconciling against non-CRDT state."
> "Regarding persistence, the documentation states the editor 'Stores data to local device.' The architecture relies on Automerge and automerge-repo for 'CRDT-based storage and sync,' but specific details about the persistence model... are not provided."

### Finding: Upwelling and Patchwork do branching ON Automerge, but branches are themselves Automerge documents

**Confidence:** CONFIRMED
**Evidence:** [Upwelling page](https://www.inkandswitch.com/upwelling/), [Patchwork branching notebook](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/06/)

Upwelling describes drafts as "a form of lightweight branching, granting creative privacy to authors on multi-author documents." Patchwork's branching is "a variation of a document that can be edited independently."

Both are **CRDT-to-CRDT branching** — branch and main are both Automerge documents sharing common history. When a branch is merged, Automerge's CRDT merge combines op-histories. There is no reconciliation against a non-CRDT representation; the markdown serialization that users see is a **projection** of the Automerge state, not a coequal authority.

---

## Implications for the central research question

Automerge is the closest production-adjacent system that frames itself as "version control for documents." It explicitly:
- Does CRDT-op-history merge (solved by construction, uses common-ancestor in the op-graph sense, not in the text-state sense)
- Does NOT handle external-state reconciliation

For a system that needs to reconcile against a markdown file on disk (edited externally, in git, by a different app), **Automerge offers no native path**. The application must either:
1. Treat the external edit as opaque and force-override the Automerge state (discarding concurrent local edits)
2. Serialize Automerge to markdown, run line-level diff3 at the text layer, re-parse into Automerge (serialize-merge-parse fallback)

---

## Negative searches

- Searched automerge.org docs for "file", "disk", "external", "reconcile" → no hits on external-state reconciliation
- Searched tiny-essay-editor code for file-watcher / reconciliation logic → README explicitly scoped to "primarily for internal use at Ink & Switch"
- Searched for "Automerge three-way merge with plain text" → only returns the CRDT-op-history sense of "three-way" (two replicas with common history)

---

## Gaps / follow-ups

- Patchwork's source code may show deeper branching internals but the top-level architectural claim (CRDT-to-CRDT branches) is clear from docs
- automerge-repo's sync protocol is peer-to-peer CRDT-aware; it does not have a "reconcile this text file with my doc" primitive
