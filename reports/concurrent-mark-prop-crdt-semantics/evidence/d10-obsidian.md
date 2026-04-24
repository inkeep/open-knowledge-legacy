# Evidence: D10 — Obsidian collaborative editing (Relay, Peerdraft plugins)

**Dimension:** D10
**Date:** 2026-04-17
**Sources:** Obsidian forum, Relay plugin docs, Peerdraft plugin GitHub

---

## Key pages referenced

- https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058 — long-running feature request thread
- https://forum.obsidian.md/t/relay-multiplayer-plugin-for-obsidian-collaborative-editing-and-folder-sharing/87170 — Relay announcement
- https://github.com/No-Instructions/Relay — Relay plugin source
- https://docs.relay.md/introduction/ — Relay docs
- https://github.com/peerdraft/obsidian-plugin — Peerdraft plugin

---

## Findings

### Finding: Obsidian has no official realtime multi-user collab; live collaboration is plugin-driven (Relay, Peerdraft)

**Confidence:** CONFIRMED
**Evidence:** Obsidian's official Sync is file-level with last-writer-wins on conflict; the "Live team collaboration" feature request remains open at the time of this research.

### Finding: Relay uses Yjs + y-codemirror.next for realtime merge on the markdown source Y.Text

**Confidence:** CONFIRMED
**Evidence:** Relay plugin docs + Obsidian forum thread:

> "Relay uses Conflict-Free Replicable Data Types (CRDTs) provided by the Yjs library."

Relay server is a fork of y-sweet. The Obsidian editor is CodeMirror-based; Relay binds Yjs Y.Text to the CodeMirror editor via y-codemirror.next.

### Finding: Relay's CRDT is on the RAW MARKDOWN SOURCE (Y.Text), NOT a tree CRDT

**Confidence:** CONFIRMED (architecturally; via y-codemirror.next's design — it binds Y.Text to CodeMirror)
**Evidence:** y-codemirror.next README: "This binding binds a Y.Text to a CodeMirror editor." Obsidian's editor pane is a CodeMirror text editor showing raw markdown (with in-line decorations for preview rendering).

**Therefore: Relay IS an example of char-CRDT-on-serialized-markdown-source shipped in production.**

### Finding: Relay's user forum messaging emphasizes "conflict-free block editing" — but the CRDT is char-level, not block-level

**Confidence:** INFERRED
**Evidence:** Marketing language ("conflict-free block editing and quick updates upon reconnecting") is a UX claim; the underlying CRDT is Y.Text character-level.

### Finding: No public user reports of garbled-markdown artifacts from concurrent bold toggles in Relay

**Confidence:** INFERRED / NOT FOUND
**Evidence:** Searched forum threads; no user complaints of `**` interleaving or malformed markdown syntax after concurrent edits found. Most reported friction is with file-watcher conflicts and sync reconnect UX, not mark composition.

Possible reasons:
- Relay user base is small relative to Notion/Figma/Google Docs
- Concurrent-bold-on-overlapping-span is a rare workflow (most Obsidian use is solo or sequentially coordinated)
- Markdown is forgiving — `**a**b**c**` still renders as bold-a, b, bold-c which is often close enough to user intent
- Users may attribute artifacts to "sync glitch" without filing issues

### Finding: Peerdraft also uses CRDTs (likely Yjs) for Obsidian

**Confidence:** INFERRED
**Evidence:** Peerdraft plugin README emphasizes CRDT-based merge; uses similar architectural pattern.

---

## Implications

- Obsidian's Relay plugin is a **shipping example** of char-level Yjs CRDT operating on raw markdown source characters.
- This is the closest production analog to "char-RGA of serialized marks" — though it uses Yjs's Y.Text (which stores characters with CRDT ItemIDs, not a pure RGA, and does NOT format marks via inline characters — Relay users bold by typing `**` literally, which ARE stored as characters).
- No widely-documented user complaints of garbled markdown from concurrent bold toggles have surfaced in the Relay forum — but also: no formal product-quality research evaluating the artifact rate exists.

---

## Gaps / follow-ups

- Relay's user base and concurrent-bold-per-span rate are unknown; absence of complaints is not evidence of absence of problem.
- No empirical reproduction of Peritext's Example 3 in Relay has been published.
- Relay's server is y-sweet-forked; its merge semantics are unchanged from Yjs Y.Text.
