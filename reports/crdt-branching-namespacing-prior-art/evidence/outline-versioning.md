# Evidence: Outline Version History and CRDT Architecture

**Dimension:** Outline versioning/branching model
**Date:** 2026-04-02
**Sources:** Outline docs (docs.getoutline.com), GitHub (outline/outline), API docs

---

## Key files / pages referenced

- https://github.com/outline/outline/pull/8497 -- Revision API refactor
- https://docs.getoutline.com/s/guide/doc/revision-history-AiL6p22Ssq -- Revision history docs
- https://github.com/outline/outline/discussions/3842 -- Collaboration architecture
- https://github.com/outline/rich-markdown-editor/discussions/317 -- Collaborative editing discussion

---

## Findings

### Finding: Outline stores revisions as separate database records, independent of the CRDT
**Confidence:** INFERRED
**Evidence:** GitHub PR #8497, docs.getoutline.com

Outline's revision history:
- Stores version snapshots at minimum every 5 minutes of editing
- Uses a `revisions.list` API endpoint (refactored in PR #8497, Feb 2025)
- Revisions can be viewed with diff highlighting
- Revisions can be downloaded as HTML or Markdown

Critically, restoring a version "will create another version and not rollback history to this point in time" -- a non-destructive append-only model.

**Implications:** Outline's versioning is a traditional snapshot system layered on top of the CRDT, not a CRDT-native branching mechanism. Revisions are database records containing the document content at a point in time, not Yjs snapshots or state vectors.

### Finding: Outline uses ProseMirror + Yjs for real-time collaboration
**Confidence:** CONFIRMED
**Evidence:** GitHub discussions, community forums

Outline uses:
- ProseMirror as the editor framework
- Yjs for real-time collaboration (WebSocket-based)
- A custom collaboration server (not Hocuspocus)

The collaboration is per-document -- each document is a separate Yjs room. There is no concept of loading different "versions" of a document into the Yjs layer.

### Finding: No branching concept in Outline
**Confidence:** CONFIRMED (via negative search)

Outline has no concept of document branches, forks, or alternative versions. Its model is:
- One canonical version of each document
- Linear version history (snapshots)
- Restore = create a new version with the old content

---

## Negative searches

- Searched Outline docs for "branch", "fork", "draft" -> no results
- Searched Outline GitHub issues for "branching" -> no relevant results
- Searched Outline API docs for version/branch endpoints -> only `revisions.list`, `revisions.info`

---

## Gaps / follow-ups

- How exactly does Outline handle "restoring" a version -- does it update the Yjs document or the database record?
- Outline's collaboration server implementation details are not publicly documented
