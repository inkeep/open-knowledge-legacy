---
title: "Source toggle: dual CRDT binding is infeasible"
type: evidence
sources:
  - github:yjs/y-prosemirror
  - github:yjs/y-codemirror.next
  - https://docs.yjs.dev/api/shared-types
verified: 2026-04-07
---

# Source Toggle: Dual CRDT Binding is Infeasible

## The fundamental incompatibility
- **y-prosemirror** binds to `Y.XmlFragment` (structured tree: XmlFragment → XmlElement → XmlText)
- **y-codemirror.next** binds to `Y.Text` (flat string with optional formatting attributes)
- These are **incompatible Yjs shared types**. A Y.Doc key is permanently typed once created — cannot be re-read as a different type.
- They CAN coexist in the same Y.Doc under different keys, but then they are two independent data structures with NO automatic sync.

## Prior art: none
- Zero examples found of dual-binding WYSIWYG/source toggle on a shared Y.Doc
- Searched: yjs community forum, y-prosemirror issues, y-codemirror.next issues
- The pattern people use is binding ONE editor at a time and destroying the binding before switching

## Viable approach: serialize on toggle (Option A)
Keep `Y.XmlFragment` as the collaborative source of truth.
- **Toggle to source:** XmlFragment → ProseMirror JSON → markdown string → non-collaborative CodeMirror
- **Toggle back:** markdown string → ProseMirror JSON → apply to Y.XmlFragment via `prosemirrorJSONToYDoc`
- Source view is NON-COLLABORATIVE (only one user edits raw source at a time)
- Markdown round-trip is the fidelity bottleneck

## Rejected alternatives
- **Dual keys with manual sync (Option B):** Two CRDTs representing same content, observe changes, sync via serialize/deserialize. Race-prone, merge conflicts. Not recommended.
- **CodeMirror on XmlFragment.toString() (Option C):** Returns raw XML, no deserializer back, not markdown. Not practical.

## Impact on spike validation #4
The original validation ("bind both y-prosemirror and y-codemirror.next to the same Y.Doc") is technically impossible as stated. The spike should validate the ACTUAL approach: serialize-on-toggle with Y.XmlFragment as source of truth. This is still load-bearing — round-trip fidelity through ProseMirror → markdown → ProseMirror determines whether source toggle works at all.
