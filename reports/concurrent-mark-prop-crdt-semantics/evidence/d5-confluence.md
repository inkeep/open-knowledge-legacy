# Evidence: D5 — Confluence / Atlassian editor Synchrony, ProseMirror

**Dimension:** D5
**Date:** 2026-04-17
**Sources:** Atlassian developer docs, Confluence admin docs, Atlassian Data Center docs

---

## Key pages referenced

- https://developer.atlassian.com/cloud/confluence/collaborative-editing/
- https://confluence.atlassian.com/display/DOC/Administering+Collaborative+Editing
- https://confluence.atlassian.com/confkb/collaborative-editing-and-synchrony-troubleshooting-858584399.html

---

## Findings

### Finding: Confluence collaborative editing is powered by a dedicated microservice called Synchrony

**Confidence:** CONFIRMED
**Evidence:** Atlassian Data Center docs:

> "Every real-time interaction on a Confluence page is powered by the Synchrony service"

> "Synchrony is a service that allows the synchronisation of arbitrary data models in real time, and it supports special synchronisation for HTML WYSIWYG editors, including telepointers"

### Finding: Synchrony uses a graph of changes, merging clients into a single source of truth — NOT a published CRDT algorithm

**Confidence:** CONFIRMED (existence); UNCERTAIN (exact algorithm — CRDT vs OT)
**Evidence:** Atlassian docs:

> "Synchrony maintains a 'graph' of all the changes, ensuring that every user contribution is merged into a single source of truth before the page is ever published."

No public paper or talk specifies whether this graph is a CRDT, an OT-ordered sequence, or a hybrid. Atlaskit's editor (Atlassian's ProseMirror-based editor framework) is public, but the Synchrony merge algorithm is not.

### Finding: Editor is ProseMirror-based (Atlaskit) — tree-structured document, not char-RGA on markdown

**Confidence:** CONFIRMED
**Evidence:** Atlassian's Atlaskit editor (https://atlaskit.atlassian.com/packages/editor/) is ProseMirror-backed. Stored document is the ProseMirror-JSON / ADF (Atlassian Document Format) tree, not serialized markdown.

### Finding: Concurrent editing capped at 12 users per page — suggests central-server coordination, not pure CRDT

**Confidence:** CONFIRMED
**Evidence:** Atlassian admin docs:

> "Up to 12 people can edit the same page at the same time"

Pure CRDTs don't typically impose such small limits; this cap reads as a Synchrony-side coordination constraint.

---

## Implications

- Confluence's real-time merge uses a central Synchrony service with per-page coordination.
- Document is a ProseMirror tree (ADF), so marks are schema mark nodes — not sequence characters.
- No evidence of char-RGA-on-markdown approach.
- Exact OT vs CRDT is opaque; given the editor is ProseMirror + a central coordinator, this is the standard "OT over rich-text tree" pattern that predates Yjs adoption in the ProseMirror ecosystem.

---

## Gaps / follow-ups

- Has Atlassian migrated Synchrony to Yjs or kept OT? No public statement found.
- Internal semantics of Synchrony merge algorithm for concurrent bold on overlapping span are not published.
