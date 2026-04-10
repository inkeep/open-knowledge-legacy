# Evidence: Void Node Representation in Y.Text

**Dimension:** D6 — Void node representation in Y.Text
**Date:** 2026-04-07
**Sources:** Yjs ContentEmbed source, y-quill embed handling, Automerge block markers

---

## Key files referenced

- `yjs/src/structs/ContentEmbed.js` — embedded object type
- `y-quill/src/y-quill.js` lines 291-299 — embed insertion pattern
- Automerge rich text schema — block markers and embeds

---

## Findings

### Finding: Y.Text supports two embed mechanisms for void nodes
**Confidence:** CONFIRMED
**Evidence:** Yjs source code

**Mechanism 1: ContentEmbed** — insert an arbitrary JSON object occupying 1 position:
```javascript
ytext.insertEmbed(index, { type: 'jsx-component', content: '...' })
```
Stored as `ContentEmbed({ type: 'jsx-component', content: '...' })` with `getLength() = 1` and `isCountable() = true`.

**Mechanism 2: ContentType (Y.XmlElement inside Y.Text)** — insert a sub-CRDT:
```javascript
const embed = new Y.XmlElement('jsx-component')
ytext.insertEmbed(index, embed)
```
This is what y-quill uses for rich embeds. The Y.XmlElement can have its own attributes and children, all collaborative.

For JSX void nodes (atom/void nodes with a `content` string attribute), Mechanism 1 (ContentEmbed with JSON) is sufficient. Mechanism 2 (Y.XmlElement) would be needed if the void node's internal state should be collaboratively editable.

### Finding: Automerge uses block markers (special objects in the sequence) for both blocks and embeds
**Confidence:** CONFIRMED
**Evidence:** Automerge rich text schema

```
{ type: "image", parents: [], attrs: { src: "...", alt: "..." }, isEmbed: true }
```

Block markers with `isEmbed: true` represent void/atom nodes. They occupy one position in the flat sequence and are rendered as leaf nodes in ProseMirror.

### Finding: In CodeMirror view, void nodes would render as fenced syntax
**Confidence:** INFERRED
**Evidence:** Architectural analysis

In a source view (CodeMirror), a void node stored as a ContentEmbed in Y.Text would need to be rendered as its markdown/source representation (e.g., fenced code block, custom syntax). The CodeMirror binding would need a serializer that maps embeds to their text representation. This is analogous to how images appear as `![alt](url)` in markdown source.

---

## Gaps / follow-ups

* The exact ProseMirror NodeSpec for void nodes (atom: true, inline vs block) affects how they appear in the delta. Block-level void nodes (full-width JSX components) behave differently from inline void nodes (inline mentions, etc.).
* ContentEmbed stores a static JSON snapshot. If a void node's content changes, the entire embed must be replaced (delete + reinsert). This is fine for opaque atoms but problematic for live-updating embeds.
