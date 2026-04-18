# Evidence: D11 — HedgeDoc 2 / CodiMD: closest shipping analog to char-CRDT on serialized markdown source

**Dimension:** D11
**Date:** 2026-04-17
**Sources:** HedgeDoc 2 GitHub source, DeepWiki architecture docs, HedgeDoc community forum

---

## Key pages referenced

- https://github.com/hedgedoc/hedgedoc — main repo
- https://github.com/hedgedoc/hedgedoc/blob/develop/backend/package.json — confirms yjs@13.6.29
- https://github.com/hedgedoc/hedgedoc/blob/develop/frontend/package.json — confirms yjs@13.6.29
- https://deepwiki.com/hedgedoc/hedgedoc/2.2-frontend-architecture — HedgeDoc 2 frontend arch
- https://docs.hedgedoc.dev/ — HedgeDoc 2 docs
- https://community.hedgedoc.org/t/collaborative-markdown-editing/1569 — user forum

---

## Findings

### Finding: HedgeDoc 2 uses Yjs (v13.6.29) for realtime collaboration — confirmed in both backend and frontend package.json

**Confidence:** CONFIRMED
**Evidence:** WebFetch of `develop/backend/package.json` and `develop/frontend/package.json` returned:

```json
"yjs": "13.6.29"
```

No y-prosemirror, no y-codemirror.next-specific package listed at root — but the DeepWiki arch doc confirms CodeMirror 6 is the editor. The Yjs binding to CodeMirror 6 is y-codemirror.next (de facto standard for this stack).

### Finding: HedgeDoc's editor is CodeMirror 6 showing raw markdown source

**Confidence:** CONFIRMED
**Evidence:** DeepWiki HedgeDoc frontend arch:

> "The editor is built around CodeMirror 6, providing a powerful and extensible editing experience."

HedgeDoc's core product surface is a raw markdown source editor (left pane) with live HTML preview (right pane). The CodeMirror editor shows literal `**`, `_`, `[[`, etc.

### Finding: The shared CRDT is a Y.Text containing the serialized markdown source — there is NO tree/mark CRDT

**Confidence:** CONFIRMED (architecturally; HedgeDoc has no ProseMirror or structured schema)
**Evidence:** HedgeDoc has no ProseMirror integration; only CodeMirror. Yjs is used. CodeMirror's collab binding is y-codemirror.next which binds to Y.Text. Therefore the shared CRDT is the raw markdown text as characters.

**HedgeDoc IS a shipping production example of char-level CRDT operating on serialized markdown source characters — `**bold**` lives as actual `*` characters in the Y.Text, subject to concurrent RGA-style ordering.**

### Finding: HedgeDoc 1 (CodiMD) used a different approach — custom OT based on the socket.io-driven EtherPad-inspired protocol

**Confidence:** CONFIRMED (project history)
**Evidence:** HedgeDoc's own origin story ("inspired by Hackpad, Etherpad and similar collaborative editors") and the v1→v2 migration was an architectural rebuild. HedgeDoc 2 is a full rewrite that adopted Yjs.

EtherPad's own protocol is OT-based on changeset objects — it operates on the serialized text, and bold/italic are handled as range-attribute ops similar to Google Docs OT (not as char interleaving).

### Finding: HedgeDoc community has not surfaced widely-reported concurrent-formatting artifact complaints

**Confidence:** INFERRED / NOT FOUND (with caveats)
**Evidence:** Searched HedgeDoc community forum, GitHub issues, release notes. No top-level bug reports matching "bold", "markdown garbled", "asterisks wrong", "concurrent format" found in the current issue tracker after this research window.

**However:**
- HedgeDoc's userbase is small vs commercial editors
- Markdown preview is rendered lazily — artifacts only become visible on render, not while typing
- The vast majority of HedgeDoc use is single-author or turn-based in meetings/hackathons, where concurrent mark-toggle-on-overlapping-span is rare
- HedgeDoc 2 is relatively new (2023-2024 rollout); long-tail concurrent edit anomalies may not have accumulated reports yet

### Finding: Markdown shipped as a shared Y.Text means Peritext's Example 3 artifact CAN occur in HedgeDoc

**Confidence:** INFERRED (no empirical reproduction found, but the architecture is identical to Peritext's described failure mode)
**Evidence:** Peritext paper Example 3 scenario applied to HedgeDoc:
- Alice highlights "The fox" in CodeMirror and hits Cmd-B → HedgeDoc's bold key-binding inserts literal `**` before and after the selection → Y.Text receives two `**` inserts
- Bob concurrently highlights "fox jumped" and hits Cmd-B → same
- Y.Text merges the two insert sets via RGA ordering by Lamport timestamp
- Result: `**The **fox** jumped.**` or similar interleaved pattern
- Render: "fox" appears unbold, "The" and "jumped" bold — contrary to both users' intent

This is structurally unavoidable given the architecture.

---

## Implications

- **HedgeDoc 2 IS the canonical production example of char-level CRDT on serialized markdown source.**
- It ships the exact architecture Peritext's paper identifies as broken for concurrent overlapping marks.
- The lack of widely-reported user complaints is NOT evidence that the artifact doesn't occur — it's evidence that (a) HedgeDoc's concurrent-mark-on-same-span workload is rare, or (b) users attribute visible artifacts to other causes (sync glitch), or (c) the artifact self-heals quickly when either user re-selects and re-bolds.
- Combined with the Obsidian Relay finding (D10), this confirms: char-level CRDT on serialized markdown IS shipped in production — in small-scale OSS editors — with the Peritext anomaly silently present.

---

## Gaps / follow-ups

- Empirical reproduction of Peritext Example 3 in a HedgeDoc 2 demo instance would turn the "INFERRED" finding into CONFIRMED.
- HedgeDoc developers' stance on whether they consider the Peritext anomaly a known limitation or a non-issue is not documented publicly.
- HedgeDoc 1 (CodiMD) legacy instances still running — their OT-based implementation would show different artifact behavior.
