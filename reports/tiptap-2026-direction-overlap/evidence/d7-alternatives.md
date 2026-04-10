# Evidence: Alternatives to TipTap in 2026

**Dimension:** D7 — Alternatives to TipTap
**Date:** 2026-04-04
**Sources:** github.com, liveblocks.io/blog, blocknotejs.org, lexical.dev, milkdown.dev, platejs.org, prosemirror.net

---

## Key pages referenced
- https://github.com/Milkdown/milkdown — Milkdown GitHub
- https://github.com/TypeCellOS/BlockNote — BlockNote GitHub
- https://github.com/facebook/lexical — Lexical GitHub
- https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025 — Framework comparison
- https://prosemirror.net/docs/changelog/ — ProseMirror changelog

---

## Findings

### Finding: Milkdown is still maintained but at a slower pace
**Confidence:** CONFIRMED
**Evidence:** github.com/Milkdown/milkdown/releases

- Latest: v7.18.0 (January 5, 2026)
- Built on ProseMirror + Remark
- Markdown-first (ideal for markdown use cases)
- Plugin-driven architecture
- Y.js support for collaboration
- Solo maintainer (Mirone)
- React integration is bare-bones (manual UI construction required)

**Implications:** Milkdown is viable for markdown-centric use cases but has a smaller ecosystem and community than TipTap. Solo-maintainer risk.

### Finding: BlockNote is actively developing with AI features
**Confidence:** CONFIRMED
**Evidence:** github.com/TypeCellOS/BlockNote, FOSDEM 2026 talk

- Latest: v0.44.0 (late 2025 / early 2026)
- Built ON TipTap + ProseMirror (it's a layer above TipTap)
- Block-based (Notion-style) editor
- AI features in early preview (@blocknote/xl-ai)
- Liveblocks integration for collaboration
- React 19 compatible
- MPL-2.0 license (mostly)
- Active development with regular releases
- Major refactor in v0.43.0 (FloatingUI, new extension system)

**Implications:** BlockNote is TipTap-additive (not a replacement). Using BlockNote means using TipTap under the hood. Not a viable alternative — it's a higher-level abstraction layer.

### Finding: Lexical (Meta) is stable but less rich than TipTap ecosystem
**Confidence:** CONFIRMED
**Evidence:** github.com/facebook/lexical, LexKit project

- Actively maintained by Meta
- Plugin-based architecture
- React-first
- No built-in collaboration (need third-party like Liveblocks)
- No equivalent to Hocuspocus
- No markdown extension equivalent
- Growing ecosystem (LexKit launched Sep 2025)
- Used by Payload CMS (Lexical is their editor)

**Implications:** Lexical is a viable alternative for editor-only needs but lacks the collaboration/CRDT ecosystem that TipTap+Hocuspocus provides. Switching to Lexical would mean building the collaboration layer from scratch.

### Finding: ProseMirror itself continues incremental maintenance
**Confidence:** CONFIRMED
**Evidence:** prosemirror.net/docs/changelog/

- Transform module updated (v1.11.0, Jan 2026)
- Bug fixes and accessibility improvements throughout 2025
- changedRange method added
- JSON serialization for change objects
- Maintained by Marijn Haverbeke
- No major architectural changes

**Implications:** ProseMirror remains the stable foundation. TipTap adds the DX layer. Going raw ProseMirror is always possible but significantly more work.

### Finding: Plate (Slate-based) is the main non-ProseMirror alternative
**Confidence:** CONFIRMED
**Evidence:** platejs.org, Liveblocks comparison

- Built on Slate.js
- Plugin-driven with 30+ official plugins
- shadcn/ui integration
- AI features
- React-only
- Active development
- Different paradigm from ProseMirror (Slate's data model vs PM's schema model)

**Implications:** Switching to Plate would mean abandoning ProseMirror entirely. Major migration cost. Slate's CRDT story (slate-yjs) is less mature than y-prosemirror.

### Finding: AFFiNE/BlockSuite is the most ambitious alternative
**Confidence:** CONFIRMED
**Evidence:** github.com/toeverything/blocksuite

- Custom framework (not ProseMirror-based)
- Natively built on Yjs CRDT
- Block-based + canvas editing
- Built for AFFiNE (Notion+Miro alternative)
- Complex, tightly coupled to AFFiNE ecosystem
- Not designed to be embedded in other apps

**Implications:** BlockSuite is a full framework for building AFFiNE-like apps, not an embeddable editor library. Different category entirely.

---

## Summary: Alternative Viability Matrix

| Editor | ProseMirror-based | Collab built-in | Markdown | Maturity | Ecosystem | Risk |
|--------|-------------------|-----------------|----------|----------|-----------|------|
| TipTap | Yes | Hocuspocus | @tiptap/markdown | High | Large | Low (well-funded, many customers) |
| Milkdown | Yes | Via Y.js plugin | Native | Medium | Small | Medium (solo maintainer) |
| BlockNote | Yes (via TipTap) | Via Liveblocks | No | Medium | Growing | TipTap dependency |
| Lexical | No | No | No | High | Growing | No collab story |
| Plate | No (Slate) | Via slate-yjs | No | Medium | Medium | Different paradigm |
| ProseMirror | Yes (is PM) | Via y-prosemirror | No | Highest | Foundation | Most work |
| BlockSuite | No | Native Yjs | No | Medium | AFFiNE-only | Not embeddable |

---

## Gaps / follow-ups
- Detailed Milkdown vs TipTap markdown fidelity comparison
- BlockNote AI features depth assessment
- LexKit maturity and ecosystem coverage
