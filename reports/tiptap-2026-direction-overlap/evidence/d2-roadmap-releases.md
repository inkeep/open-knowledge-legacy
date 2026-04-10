# Evidence: TipTap 2026 Roadmap & Recent Releases

**Dimension:** D2 — TipTap's 2026 roadmap and recent releases
**Date:** 2026-04-04
**Sources:** tiptap.dev/blog/release-notes, tiptap.dev/roadmap, tiptap.dev/tiptap-editor-v3, github.com/ueberdosis/tiptap/releases, github.com/ueberdosis/hocuspocus

---

## Key pages referenced
- https://tiptap.dev/blog/release-notes/our-roadmap-for-2026 — 2026 strategic roadmap
- https://tiptap.dev/roadmap — public roadmap with status
- https://tiptap.dev/tiptap-editor-v3 — v3 feature list
- https://tiptap.dev/blog/release-notes — all blog posts chronologically

---

## Findings

### Finding: TipTap's 2026 mission is "the document layer around the database"
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/blog/release-notes/our-roadmap-for-2026

Three strategic bets for 2026:
1. **AI in Documents** — AI Toolkit + Server AI Toolkit for agent-driven editing
2. **Document Conversion** — Workflow-complete DOCX/PDF with round-tripping
3. **Tiptap Flex** — AI-native writing UI, dogfooding the platform

Quote: "making Tiptap the document layer around the database... product teams can treat documents like first-class objects in their product's data model, queryable, versioned, permissioned, and validated server-side"

### Finding: TipTap v3 shipped stable in July 2025
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/tiptap-editor-v3, blog post "Tiptap 3.0 is stable" (Jul 12, 2025)

Key v3 features:
- Floating UI (replaces tippy.js)
- MarkViews for React & Vue 3
- y-tiptap package (extends y-prosemirror with TipTap-specific enhancements)
- Consolidated extension packages (e.g., TableKit)
- Server-side rendering support
- Static renderer (@tiptap/static-renderer for HTML/markdown without DOM)
- Deletion event tracking
- JSX support
- Enhanced TypeScript

### Finding: Public roadmap shows clear trajectory
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/roadmap

**Available now:**
- Tiptap Shorthand (compression format, up to 80-90% token reduction)
- Server AI Toolkit (headless document editing)
- Pages (page-based layout with headers/footers)
- AI Toolkit

**Next (in progress):**
- AI Toolkit + Version History (time travel for AI edits)
- Decorations API (visual overlays)
- Pages & Conversion enhancements
- Redlining / Tracked Changes (native suggestion mode)

**Future:**
- Unified Authentication (single App ID + JWT)
- Dashboard & Account Management
- Page-Aware AI Agents

### Finding: @tiptap/markdown is open-source and production-ready
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap

- Open-source (MIT), installable via npm
- Uses MarkedJS for parsing (CommonMark-compliant)
- Bidirectional: Markdown -> TipTap JSON -> Markdown with round-trip support
- Modular MarkdownManager architecture
- Custom tokenizer support for non-standard syntax
- Launched October 2025

### Finding: Hocuspocus is actively maintained at v3.x
**Confidence:** CONFIRMED
**Evidence:** npmjs.com, github.com/ueberdosis/hocuspocus

- Latest: @hocuspocus/server 3.4.4 (published ~February 2026)
- Key feature: Multiplexing (multiple documents over single WebSocket)
- Still the Yjs CRDT WebSocket backend
- Can be self-hosted or used via TipTap Cloud

### Finding: Blog post timeline shows rapid product expansion in 2025
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/blog/release-notes

2025 blog posts (chronological):
- Mar 25: AI Suggestion
- Apr 15: UI Components
- May 5: Tiptap 3.0 beta
- Jun 4: AI Agent
- Jun 6: Open-sourcing Pro extensions + New pricing model
- Jun 13/24: DOCX import/export improvements
- Jul 12: Tiptap 3.0 stable
- Jul 24: Notion-style editor template
- Sep 23: Tiptap Pages alpha
- Oct 1: AI Toolkit beta
- Oct 15: Bidirectional Markdown
- Nov 19: AI Toolkit GA

2026 blog posts:
- Jan 13: 2026 Roadmap
- Mar 10: Q1 2026 Recap

---

## Gaps / follow-ups
- Q1 2026 recap post content not fully extracted
- GitHub release cadence for patch versions not catalogued
- y-tiptap divergence from y-prosemirror specifics not fully documented
