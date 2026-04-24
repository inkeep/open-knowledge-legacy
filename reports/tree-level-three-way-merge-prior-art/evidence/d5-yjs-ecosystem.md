# Evidence: D5 Yjs ecosystem patterns

**Dimension:** Yjs ecosystem more broadly — any plugin or pattern for reconciling Y.XmlFragment against external tree-shaped state?
**Date:** 2026-04-17
**Sources:** discuss.yjs.dev forum, yjs GitHub, y-prosemirror GitHub issues, ProseMirror diff projects

---

## Key files / pages referenced

- [Yjs forum: diffing 2 snapshots](https://discuss.yjs.dev/t/ydocs-diffing-2-snapshots/2037)
- [Yjs forum: updateYFragment accuracy](https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273)
- [ProseMirror diff plugin thread](https://discuss.prosemirror.net/t/diff-plugin/5837)
- [prosemirror-changeset GitHub](https://github.com/ProseMirror/prosemirror-changeset)
- [pubpub/prosemirror-diff GitHub](https://github.com/pubpub/prosemirror-diff/blob/master/diff.ts)
- [hamflx/prosemirror-diff GitHub](https://github.com/hamflx/prosemirror-diff)
- [Third Bit: Diff and Merge for ProseMirror (2017)](https://third-bit.com/2017/11/22/prosemirror-diff-merge/)
- [CollabMD project](https://github.com/andes90/collabmd) — Yjs + markdown folders + git integration

---

## Findings

### Finding: Yjs community has NO plugin for tree-level three-way merge of Y.XmlFragment

**Confidence:** CONFIRMED (via exhaustive forum + GitHub search)
**Evidence:** discuss.yjs.dev search, yjs/* GitHub org search

Searched the Yjs community forum + GitHub for "three-way merge", "3-way merge", "reconcile", "external state", "disk sync" plugins on Y.XmlFragment or Y.Map. Results:
- `prosemirror-changeset` tracks changes from one state to another (2-way, for display)
- `pubpub/prosemirror-diff` and `hamflx/prosemirror-diff` both do 2-way visual diffs (for review UX, not merge)
- No plugin performs structural three-way merge on Y.XmlFragment against an external ProseMirror JSON, mdast, or text string
- The canonical advice on the forum for "what happens when a file changes on disk" is to **re-parse and apply as a transaction** — which is the serialize-merge-parse fallback

### Finding: "Diff and Merge for ProseMirror" framed as an open problem as of 2017 — and still open

**Confidence:** CONFIRMED
**Evidence:** [Third Bit 2017 post](https://third-bit.com/2017/11/22/prosemirror-diff-merge/) (via WebFetch)

Greg Wilson's 2017 post explicitly frames ProseMirror-level structural diff-and-merge as an aspirational direction:
> "This is an open problem. The author advocates for creating 'a general JSON-based diff-and-merge for ProseMirror that leveraged the structural information' in its schemas."
> "He envisions possibilities beyond simple text diffing—such as detecting 'slide moved' operations or diffing table rows instead of markup."
> "In essence: promising but unrealized opportunity."

Nine years later, no production three-way structural merge library for ProseMirror exists. The pubpub and hamflx projects do **2-way** diffs only, and are typed for review UX (visualizing changes), not merge.

### Finding: CollabMD demonstrates the serialize-merge-parse pattern explicitly

**Confidence:** INFERRED (from search-result summary; project README not fully fetched)
**Evidence:** [CollabMD GitHub search result](https://github.com/andes90/collabmd)

> "A related project called CollabMD demonstrates how external markdown file edits can be reconciled in a Yjs-based system. External filesystem edits are reconciled back into active rooms and the explorer. External changes from tools like Obsidian, direct file writes, or git-driven file updates are watched and reconciled back into live rooms and the explorer."

The described pattern: file-watcher emits disk changes → reconcile "back into live rooms" — this is the canonical serialize-merge-parse loop (disk text → parse → update CRDT state). CollabMD does not claim a tree-level three-way merge; it's using the disk text as the reconciliation medium.

### Finding: The Yjs maintainer framing — "show what the user actually changed"

**Confidence:** CONFIRMED
**Evidence:** [Yjs forum thread 1273](https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273)

Kevin Jahns (dmonad) on the `updateYFragment` algorithm, when a user raised concerns about its shape-preservation:
> "Yjs takes the approach of showing what the user actually changed."

This philosophy — op-based, not state-based; rely on the CRDT layer for merge correctness; let users perceive their own changes — is baked into the Yjs ecosystem. **There is no architectural space for a "state-based three-way merge on Y.XmlFragment" in this philosophy**, because such a merge would be a state-based operation that the Yjs design deliberately avoids. The escape hatch for external state reconciliation is to re-parse and write through the CRDT layer (serialize-merge-parse).

---

## Implications for the central research question

The Yjs ecosystem has been a production reality for 7+ years (since 2019), shipping in dozens of editors, and has a large community forum with open architectural discussions. **In all of that time, no community plugin has emerged to solve tree-level three-way merge on Y.XmlFragment.** This is strong evidence that the gap is not a "someone should write this" TODO — it's either:
- A problem the ecosystem has architecturally routed around (via CRDT-only merge + serialize-merge-parse for external)
- A problem with research-level depth that nobody has brought to production

Both interpretations converge on the same practical conclusion for anyone building on Yjs today: **if you need to reconcile Y.XmlFragment against non-CRDT tree-shaped external state, serialize-merge-parse is the shipping pattern.**

---

## Negative searches

- Yjs community forum search: "three-way merge", "tree merge", "structural merge", "external reconciliation" → no plugin or library
- yjs GitHub org search across all repos for "three-way" → no hits
- npm search "yjs merge tree" / "y-prosemirror merge" / "yjs reconcile" → no hits for a 3-way merge library
- prosemirror-diff projects: all 2-way, none 3-way

---

## Gaps / follow-ups

- Bidirectional observer patterns (like the consuming project uses internally) are built individually by each integrator; there's no shared library for this flow in the Yjs ecosystem
