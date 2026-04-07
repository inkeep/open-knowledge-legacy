---
title: "Source of truth architecture — transferred from OpenDesign analysis"
type: synthesis
created: 2026-04-02
---

## TLDR
Hybrid model: ProseMirror document in Yjs is the editing source of truth (block-level CRDT). Markdown is the durable format — serialized to .md files in git on save, parsed back on load. Same architecture as AFFiNE (CRDT-canonical during editing) but with markdown committed to git (not the block model).

## The three camps (from OpenDesign source-of-truth report)

1. **Platform-primary** (Figma, Notion): Platform model is truth. Export is derived. No round-trip problem. But data isn't portable.
2. **Git-primary** (Onlook): Files on disk are truth. No collaboration.
3. **Dual-primary** (Lovable, v0): Both accept writes. Nobody has solved this cleanly.

## Our architecture: hybrid

```
During editing (in memory):
  ProseMirror doc ↔ Yjs (y-prosemirror) = editing truth
  Human: rich editor → ProseMirror transactions → Yjs
  Agent: markdown via MCP → parse to PM nodes → Yjs
  
Persistence (periodic):
  Yjs doc → serialize to markdown → .md file → git

Load (on open):
  .md file → parse to ProseMirror → init Yjs
```

## Why this works

- Git contains .md files (human-readable, agent-writable, portable)
- Rich editing is native during editing (no round-trip while working)
- CRDT merges are block-level (y-prosemirror), not character-level
- Agents write markdown naturally via MCP
- Same Yjs infrastructure as OpenDesign

## Where the risk lives (updated 2026-04-03)

**Standard markdown round-trip:** Low risk. ProseMirror → markdown → ProseMirror is well-proven (Milkdown, TipTap, Outline in production).

**JSX/MDX component round-trip:** RESOLVED by void node architecture. JSX components are stored as raw strings in void nodes — the raw string goes in and the same string comes out. No conversion boundaries for JSX. No round-trip issue. This was the highest-risk area; the mdx-crdt-roundtrip-fidelity research (7 sub-reports) proved full WYSIWYG MDX round-trip has 6 failure vectors. Void nodes sidestep all of them.

**Remaining low-risk items:**
- Frontmatter (YAML): needs custom pre/post-processing (extract before parse, reattach after serialize)
- Standard markdown whitespace normalization: content-equivalent, not byte-identical (acceptable)

## Key insight from OpenDesign Report 12 (TSX Round-Trip)

"Recast is the only tool that achieves perfect parse→print round-trip." For us, the equivalent is: we need a markdown parser/serializer for ProseMirror that achieves perfect round-trip for the block types we support. TipTap's markdown extension is the starting point.

## OpenDesign decisions that transfer directly

- One Yjs document per file (Report 11 §9)
- All writes through CRDT — no backdoor file writes (Replit principle)
- DirectConnection for agent writes (Hocuspocus)
- Awareness protocol for presence
- Per-origin undo via trackedOrigins
- Git auto-persistence via Hocuspocus afterStoreDocument hook
