# Evidence: D5 — CodeMirror + Yjs for CRDT Collaboration

**Dimension:** How y-codemirror.next works, its maturity, and how text-level CRDT compares to block-level CRDT for MDX
**Date:** 2026-04-03
**Sources:** y-codemirror.next GitHub, Yjs docs, Liveblocks, Peritext paper, CRDT survey

---

## Key files / pages referenced

- https://github.com/yjs/y-codemirror.next — y-codemirror.next repository
- https://github.com/yjs/y-codemirror.next/releases — Release history
- https://docs.yjs.dev/ecosystem/editor-bindings/codemirror — Yjs CodeMirror docs
- https://liveblocks.io/docs/guides/how-to-create-a-collaborative-code-editor-with-codemirror-yjs-nextjs-and-liveblocks — Liveblocks CodeMirror guide
- https://discuss.codemirror.net/t/crdts-positions-in-codemirror-6/2571 — CRDTs & Positions in CM6
- https://marijnhaverbeke.nl/blog/collaborative-editing-cm.html — Collaborative Editing in CodeMirror
- https://www.inkandswitch.com/peritext/ — Peritext CRDT for rich text
- https://mattweidner.com/2023/09/26/crdt-survey-2.html — CRDT Survey: Semantic Techniques

---

## Findings

### Finding: y-codemirror.next is actively maintained and production-ready
**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/y-codemirror.next, releases page

- **Current version:** v0.3.5 (June 18, 2024)
- **Total releases:** 17
- **Open issues:** 8
- **Stars:** 198, Forks: 44
- **License:** MIT (Kevin Jahns, Yjs author)
- **Total commits:** 101 on main

This stands in stark contrast to slate-yjs (abandoned since July 2023, 20+ open bugs including crashes — from the WYSIWYG investigation). y-codemirror.next is maintained by the Yjs author himself and has a clean release history.

### Finding: y-codemirror.next binds Y.Text to CodeMirror 6 with three capabilities
**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/y-codemirror.next, Yjs docs

Three core features:
1. **Editor sync:** Binds a Y.Text CRDT type to the CodeMirror editor. Changes in the editor propagate to Y.Text; remote Y.Text changes update the editor.
2. **Awareness (cursors):** Renders remote users' cursor positions and selection ranges as a separate plugin. Uses Yjs awareness protocol.
3. **Shared undo/redo:** Each client gets its own undo/redo history. Undoing your edits doesn't undo other users' concurrent edits.

The binding is provided via the `yCollab` extension:
```javascript
import { yCollab } from 'y-codemirror.next'
const ytext = ydoc.getText('codemirror')
const extensions = [yCollab(ytext, awareness)]
```

### Finding: Liveblocks provides production infrastructure for y-codemirror.next
**Confidence:** CONFIRMED
**Evidence:** https://liveblocks.io/docs/guides/how-to-create-a-collaborative-code-editor-with-codemirror-yjs-nextjs-and-liveblocks

Liveblocks offers a fully managed Yjs backend with:
- Managed WebSocket infrastructure for Yjs sync
- Dashboard for viewing/inspecting Yjs documents
- Webhooks triggered on Yjs document changes
- REST API for programmatic access
- DevTools for debugging
- Works with y-codemirror.next directly via `@liveblocks/yjs`

This means a collaborative MDX text editor could use y-codemirror.next + Liveblocks for real-time collaboration without building sync infrastructure from scratch. Frameworks: React, Vue.js, Svelte, vanilla JavaScript all supported.

### Finding: Text-level CRDT on MDX source eliminates ALL conversion boundary issues from the WYSIWYG investigation
**Confidence:** CONFIRMED
**Evidence:** Architectural analysis, comparison with mdx-crdt-roundtrip-fidelity findings

The WYSIWYG approach required FOUR conversion boundaries:
```
B1: MDX text  <-->  MDAST        (remark-mdx parse/serialize)
B2: MDAST     <-->  Editor blocks (Slate or ProseMirror conversion)
B3: Editor    <-->  Yjs types    (slate-yjs or y-prosemirror)
B4: Yjs       <-->  MDX text     (B3 + B2 + B1 in reverse)
```

Each boundary introduced data loss risks. B2 was the primary failure point (JSX component structure destroyed). B3 had abandoned bindings (slate-yjs). B4 required perfect round-trip through all three.

The text editor + CRDT approach has ONE boundary:
```
MDX text  <-->  Y.Text
```

Y.Text IS the MDX source text. There is no conversion. The CRDT operates directly on the characters of the MDX file. What you type is what's in the CRDT. What's in the CRDT is what gets compiled for preview.

This eliminates:
- MDAST conversion (B1 is only needed one-way for preview, not for storage)
- Editor block conversion (B2 is eliminated entirely)
- The "session boundary" tension (Yjs state IS the text, not a derived representation)
- The indentation drift bug in remark-mdx (text is stored as-is, not serialized through remark)
- JSX expression prop loss (text preserves everything)
- Component registration requirement (text doesn't need to know about component schemas)

### Finding: Text-level CRDT merge semantics are simpler and well-understood
**Confidence:** CONFIRMED
**Evidence:** Peritext paper, CRDT survey, Yjs docs

In a text CRDT (Y.Text):
- **Character-level operations:** Each character has a unique, stable position identifier
- **Concurrent inserts:** If two users type at different positions, both characters appear in the correct positions
- **Concurrent edits to same region:** If two users edit the same line, both edits are preserved (characters interleave based on position)
- **Delete + edit conflict:** If one user deletes a region while another edits it, the edit may be partially preserved or lost (depending on timing) — but no corruption occurs

For MDX source text specifically:
- Two users editing different paragraphs → completely independent, no conflict
- Two users editing the same component's props → characters interleave, which may produce syntactically invalid MDX temporarily, but the text itself is not corrupted
- One user deleting a component while another edits its props → the component is deleted (delete wins), edits are lost — same behavior as any text CRDT on code

This is simpler than block-level CRDT because:
- No schema to maintain (Y.Text has no schema)
- No node-type constraints (any text is valid in Y.Text)
- No attribute-level vs node-level conflict resolution needed
- Merge semantics match what developers expect from Git-style text merging

The tradeoff: text-level CRDTs can produce temporarily invalid syntax during concurrent edits. A block-level CRDT could theoretically maintain structural validity, but as the WYSIWYG investigation showed, block-level CRDTs for MDX don't exist and would require massive custom engineering.

### Finding: The architecture comparison strongly favors text CRDT for MDX
**Confidence:** CONFIRMED
**Evidence:** Synthesis across D5 findings and WYSIWYG investigation

| Aspect | WYSIWYG + Block CRDT | Text Editor + Text CRDT |
|--------|---------------------|-------------------------|
| CRDT binding | slate-yjs (abandoned) or y-prosemirror | y-codemirror.next (maintained) |
| Conversion boundaries | 4 (MDX↔MDAST↔blocks↔Yjs) | 1 (MDX text↔Y.Text) |
| Data loss risk | High (JSX destroyed at B2) | None (text is verbatim) |
| Round-trip fidelity | Unproven, multiple failure vectors | Perfect by construction |
| Session boundary | Tension (Yjs state vs MDX file) | None (Y.Text IS the file) |
| Merge semantics | Complex (node types, attributes, nesting) | Simple (character-level) |
| Time to working prototype | 3-6 months (from WYSIWYG report) | Days to weeks |
| Prior art | Zero implementations | HackMD, Liveblocks examples |

---

## Gaps / follow-ups

* Concurrent editing producing temporarily invalid MDX: how does this affect the preview panel? (Answer: the preview shows the last valid render, compilation errors are caught)
* Performance of y-codemirror.next with large MDX documents (10K+ lines) is undocumented
* Awareness protocol (remote cursors) styling and UX for MDX editing has no prior art
