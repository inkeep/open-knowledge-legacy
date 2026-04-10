# Evidence: Hybrid Option — CM6 Source + TipTap WYSIWYG, Shared Y.Text

**Dimension:** D11 — Hybrid architecture using Y.Text as canonical with both CM6 and TipTap views
**Date:** 2026-04-07
**Sources:** y-prosemirror docs, y-codemirror.next docs, Yjs shared type documentation, Gravity UI editor, Peritext paper, Loro rich text CRDT

---

## Key files / pages referenced

- https://github.com/yjs/y-prosemirror — y-prosemirror binding (Y.XmlFragment to ProseMirror)
- https://github.com/yjs/y-codemirror.next — y-codemirror.next binding (Y.Text to CM6)
- https://docs.yjs.dev/api/shared-types/y.text — Y.Text API
- https://docs.yjs.dev/api/shared-types/y.xmlfragment — Y.XmlFragment API
- https://www.inkandswitch.com/peritext/ — Peritext: rich text CRDT for collaborative editing
- https://loro.dev/blog/loro-richtext — Loro's Peritext implementation for rich text
- https://github.com/gravity-ui/markdown-editor — Gravity UI dual-mode editor (ProseMirror + CodeMirror)
- https://github.com/yjs/y-prosemirror/pull/64 — PR for modularizing Y.XmlText/Y.XmlElement conversion

---

## Findings

### Finding: y-prosemirror binds to Y.XmlFragment, y-codemirror.next binds to Y.Text — they use fundamentally different CRDT types
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror README, y-codemirror.next README, Yjs docs

y-prosemirror: `ySyncPlugin(yXmlFragment)` — binds to Y.XmlFragment (tree structure)
y-codemirror.next: `yCollab(yText, awareness)` — binds to Y.Text (flat string)

These are different Yjs shared types stored in the same Y.Doc but at different keys:
```javascript
const ytext = ydoc.getText('content')        // For CM6
const yxml = ydoc.getXmlFragment('content')  // For ProseMirror
// CANNOT use the same key for both — they're different types
```

**Implications:** The naive hybrid (CM6 on Y.Text + TipTap on Y.XmlFragment, same content) doesn't work out of the box. You'd need a synchronization layer between Y.Text and Y.XmlFragment within the same Y.Doc, or a custom binding.

### Finding: A Y.Text-to-ProseMirror binding would require custom markdown-to-ProseMirror conversion on every change
**Confidence:** INFERRED
**Evidence:** Gravity UI editor architecture, y-prosemirror internals

The hybrid architecture would need:
1. Y.Text as the canonical CRDT (CM6 binds directly)
2. When WYSIWYG mode is active: parse Y.Text content (markdown) into ProseMirror document structure
3. When user edits in WYSIWYG: convert ProseMirror changes back to Y.Text operations
4. Conflict resolution when both editors are conceptually "open" (collaboration)

This is essentially what Gravity UI does, minus the CRDT layer:
- Markdown → ProseMirror (via markdown-it parser)
- ProseMirror → Markdown (via custom serializer)
- Each element needs: ProseMirror spec, fromMd, toMd

**Implications:** This is the same bidirectional conversion problem the WYSIWYG approach has, except:
- It happens at mode-switch time rather than at file-load time
- Y.Text is the authoritative state (good for source mode)
- Conversion errors affect WYSIWYG display, not data integrity (because Y.Text is canonical)
- But: collaborative editing in WYSIWYG mode requires converting ProseMirror operations to Y.Text operations in real-time, which is non-trivial

### Finding: Peritext/Loro provide a theoretical path for rich text on Y.Text, but no production Yjs binding exists
**Confidence:** CONFIRMED
**Evidence:** https://www.inkandswitch.com/peritext/, https://loro.dev/blog/loro-richtext

Peritext (Ink & Switch, 2021):
- Stores formatting spans alongside plaintext character sequence
- Spans are anchored to character positions (stable under concurrent edits)
- Deterministic merge of formatting operations
- Has a ProseMirror bridge (src/bridge.ts in the prototype)

Loro (2023+):
- Implements Peritext algorithm as a Rust-based CRDT library
- "Style anchors" (special control characters) mark formatting boundaries
- Production-quality implementation of rich text CRDT

Yjs Y.Text:
- Has `format(index, length, attributes)` for inline formatting
- Y.Text formatting attributes ARE a Peritext-like mechanism
- Used by Quill binding (y-quill) for rich text collaboration

**Implications:** Y.Text already supports inline formatting attributes (bold, italic, etc.) via its format() API. A custom Y.Text-to-ProseMirror binding could theoretically use Y.Text formatting attributes for marks AND parse the text structure for block types. This would be a Peritext-on-Yjs approach where Y.Text carries both the text content and the formatting. No production implementation of this binding exists.

### Finding: The Gravity UI editor is the closest production prior art for dual-mode editing
**Confidence:** CONFIRMED
**Evidence:** https://github.com/gravity-ui/markdown-editor

Architecture:
- ProseMirror for WYSIWYG
- CodeMirror for markup
- Markdown as canonical format (not Y.Text, not CRDT)
- markdown-it as bidirectional parser
- Extension system: each element defines spec + fromMd + toMd
- React hooks API

What it DOESN'T have:
- CRDT/Yjs collaboration
- Real-time sync between modes (it's mode-switch, not dual-view)
- Y.Text as canonical type

**Implications:** Gravity UI proves that ProseMirror + CodeMirror dual-mode works in production. Adding Yjs collaboration on top would be the novel contribution. The question is whether Y.Text or Y.XmlFragment should be canonical.

### Finding: A practical hybrid architecture would use Y.Text canonical with mode-switch conversion
**Confidence:** INFERRED
**Evidence:** Analysis of all approaches

The most practical hybrid:
1. **Canonical:** Y.Text (flat markdown text)
2. **Source mode:** CM6 bound to Y.Text via y-codemirror.next (direct, zero conversion)
3. **WYSIWYG mode:** Parse Y.Text → ProseMirror document on mode switch. User edits in ProseMirror. On mode switch back (or periodically), serialize ProseMirror → markdown text → Y.Text.
4. **Collaboration in source mode:** y-codemirror.next handles everything (proven)
5. **Collaboration in WYSIWYG mode:** Two approaches:
   a. Simple: Lock to single mode during collab (all users see same view)
   b. Complex: Real-time conversion pipeline (Y.Text changes → ProseMirror updates, and reverse)

Option 5a is pragmatic and avoids the hardest engineering. Option 5b is the "holy grail" but requires building a real-time bidirectional binding between Y.Text and ProseMirror state.

**Implications:** The hybrid gets source mode for free (CM6 + Y.Text) and gets WYSIWYG for "manageable cost" (parse markdown to ProseMirror on switch). The hard part is real-time collaboration where one user is in source mode and another is in WYSIWYG mode simultaneously — this requires the bidirectional sync pipeline.

---

## Summary: Hybrid option assessment

| Aspect | Feasibility | Effort |
|--------|-------------|--------|
| Source mode (CM6 + Y.Text) | Proven | Minimal |
| WYSIWYG mode (TipTap, mode-switch) | Proven (Gravity UI) | Moderate (bidirectional serialization) |
| Collab in source mode | Proven (y-codemirror.next) | Minimal |
| Collab in WYSIWYG mode (same mode) | Feasible | Moderate (custom Y.Text → PM binding) |
| Cross-mode collab (source + WYSIWYG simultaneously) | Theoretically possible | High (real-time bidirectional sync) |
| Y.Text formatting attributes for marks | Possible (Peritext-like) | High (custom binding, no prior art) |

---

## Gaps / follow-ups

- Performance of real-time markdown parsing for Y.Text → ProseMirror conversion during collaboration
- Whether y-prosemirror could be modified to bind to Y.Text instead of Y.XmlFragment
- PR #64 on y-prosemirror (modularizing XmlText/XmlElement) — could this be a path to Y.Text support?
- Loro's Wasm-based CRDT as a potential replacement for Yjs Y.Text with built-in Peritext semantics
