---
title: "Component ecosystem findings — Fumadocs compatibility, Obsidian gap, shadcn opportunity"
type: synthesis
created: 2026-04-03
---

## TLDR
Fumadocs components work in Vite without modification (FrameworkProvider abstracts Next.js). Content parity with Obsidian requires ~3-4 days beyond Fumadocs. 201 shadcn registries exist, zero for knowledge/docs — real opportunity. TipTap confirmed as foundation (no competitive risk).

## Fumadocs runtime compatibility (confirmed)
All `defaultMdxComponents` are pure client React:
- Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, TypeTable, Files/File/Folder, CodeBlock
- FrameworkProvider makes Next.js optional — `Link` falls back to `<a>`, `Image` to `<img>`
- DynamicCodeBlock: `'use client'`, Shiki in browser via useEffect, pure JS regex (no WASM)
- Zero `'use server'` directives. Zero `fs`/`path`/`crypto` imports in any content component.
- `next-themes` works without Next.js (DOM manipulation only)
Source: /reports/fumadocs-full-pipeline/evidence/component-runtime-compatibility.md

## Content parity gap with Obsidian
| Feature | Status | Effort |
|---|---|---|
| Math (KaTeX) | Already in Fumadocs (remark-math + rehype-katex) | Config only |
| Mermaid | fumadocs-mermaid package + MermaidCN (shadcn) | Use existing |
| Footnotes | remark-gfm | Config + CSS |
| Collapsible callout | Compose Fumadocs Callout + Radix Collapsible | Small (~50-100 lines) |
| Inline tags | shadcn Badge + remark plugin for `#tag` | Small |
| Wiki-links + backlinks | S10 covers this | Significant (Now story) |
| Graph view | Fumadocs graph-view.tsx exists | Wire to S10 index (Later) |
| Transclusion | Nothing exists | Large (Later) |
| Block references | Nothing exists | Large (Later) |
| Dataview queries | Nothing exists | Large (Later) |
Source: /reports/obsidian-vs-fumadocs-component-inventory/

## shadcn registry landscape
- 201 registered shadcn registries (as of April 2026)
- Zero are knowledge/documentation focused
- Categories: animation, AI/chat, dashboard, theming, Web3, maps, media, marketing
- Fumadocs does NOT publish a shadcn registry — components are traditional npm package
- Opportunity: `@openknowledge/*` would be the first knowledge-focused registry
Source: shadcn registry research (April 2026)

## TipTap 2026 direction (confirmed as foundation)
- "Document infrastructure platform" — not a knowledge platform
- Zero signals of building knowledge management, agent orchestration, git persistence
- OSS core (editor, Hocuspocus, @tiptap/markdown) stays MIT, self-hostable
- Server AI Toolkit (alpha): headless REST API for agent editing — different protocol from our MCP, not competing
- v3 stable since July 2025. @tiptap/y-tiptap is maintained fork of y-prosemirror.
- Risk: vendor lock-in on paid features (AI Toolkit, tracked changes), not competition
Source: /reports/tiptap-2026-direction-overlap/
