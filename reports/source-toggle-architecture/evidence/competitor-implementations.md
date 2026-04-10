# Evidence: Competitor Source Toggle Implementations

**Dimension:** D5 — How competitors handle WYSIWYG ↔ source toggle
**Date:** 2026-04-07
**Sources:** GitHub repos, product docs, community forums

---

## Key sources referenced
- Obsidian forum: https://forum.obsidian.md/
- BlockSuite: https://github.com/toeverything/blocksuite
- Outline discussion #3326: https://github.com/outline/outline/discussions/3326
- HedgeDoc: https://github.com/hedgedoc/hedgedoc
- Zettlr: https://github.com/Zettlr/Zettlr
- Milkdown: https://milkdown.dev/

---

## Findings

### Finding: No block-canonical editor has shipped a source toggle
**Confidence:** CONFIRMED
**Evidence:** AFFiNE (Yjs blocks, no source view), Outline (PM JSON, explicitly rejected source view), BlockNote (TipTap blocks, no source view)

All three block-canonical editors either never attempted or explicitly rejected a markdown source toggle. The lossy round-trip between rich blocks and markdown makes it architecturally impractical for them.

**Implications:** OpenKnowledge would be the first block-canonical collaborative editor to ship a source toggle. This is differentiation, not a table-stakes feature — but it also means there's no proven pattern to follow.

### Finding: Text-canonical editors use CM6 decoration swap — zero conversion cost
**Confidence:** CONFIRMED
**Evidence:** Obsidian (3 modes, same CM6 instance, decoration swap), Zettlr (2 modes, same pattern)

Both Obsidian and Zettlr run CodeMirror 6 as the single editor. Source ↔ Live Preview is a decoration configuration swap on the same editor instance — no serialization, no parsing, instant toggle. This is only possible because markdown text is the canonical format.

**Implications:** The serialize-on-toggle approach for TipTap cannot match Obsidian's toggle speed. However, our performance research shows <30ms for 50KB documents, which is imperceptible.

### Finding: Only HedgeDoc has collaborative source editing, using OT on markdown text
**Confidence:** CONFIRMED
**Evidence:** HedgeDoc GitHub, Socket.IO + OT protocol, split-view model

HedgeDoc uses a two-panel layout: CodeMirror (left, editable) + rendered preview (right, one-way). Collaboration runs on the markdown text via OT. This is the only production system with real-time collaborative source editing.

**Implications:** Collaborative source editing requires text-canonical CRDT. Our system is tree-canonical (Y.XmlFragment). To get collaborative source editing, we'd need to flip to Y.Text-canonical (Option F) — a fundamental architecture change.

### Finding: Obsidian users report cursor/scroll position jumps on mode toggle
**Confidence:** CONFIRMED
**Evidence:** https://forum.obsidian.md/t/toggle-live-preview-source-mode-does-not-preserve-scroll/74379, https://forum.obsidian.md/t/preserve-cursor-position-when-alternating-preview-read-modes/103995

Even in Obsidian (same editor instance, decoration swap), cursor and scroll position jumps are a known pain point.

**Implications:** Cursor preservation across our toggle (which involves serialization) will be harder. Approximate cursor mapping is the realistic target — exact preservation is not achieved even by the best competitor.

---

## Summary matrix

| Editor | Canonical | Source Toggle | CRDT | Collab in Source |
|--------|-----------|---------------|------|------------------|
| Obsidian | Text | Yes (CM6 deco swap) | No | N/A |
| AFFiNE | Yjs blocks | No | Yes | — |
| Outline | PM JSON | No (rejected) | No (OT) | — |
| BlockNote | TipTap blocks | No | Optional Yjs | — |
| Milkdown | Text | No built-in | Optional Yjs | — |
| Zettlr | Text | Yes (CM6 deco swap) | No | N/A |
| HedgeDoc | Text | Split view | No (OT) | Yes |
