# Run: 2026-04-16-initial

**Status:** Active
**Owner:** Orchestrator (parent research skill instance)

## Purpose

Initial pass on block-level selection indicator patterns in production block editors. Five subagents dispatched in parallel covering editor survey (split across 3 agents by editor clustering), WCAG a11y compliance, and CSS implementation techniques.

## Primary question

How do production block editors signal "this block is selected/focused" when the block itself already has visual chrome (borders, rounded corners, shadows, tints) — without creating a "double outline" visual collision, while remaining keyboard-accessible?

## Delta rubric

All 7 dimensions in scope on first pass. D1 (taxonomy) and D3 (double-outline problem) synthesized by orchestrator from D2/D5 findings. D2, D4, D5, D6 dispatched to subagents.

## Source anchors + owners

| Dimension | Owner | Primary sources |
|---|---|---|
| D2a — Notion, Craft, Linear, Outline | Subagent A | notion.so/help, linear.app, craft.do, getoutline.com + DOM inspection via browser |
| D2b — BlockNote, Lexical, Tiptap examples | Subagent B | blocknote.js.org, playground.lexical.dev, tiptap.dev/examples + GitHub source |
| D2c — Obsidian, Anytype, AFFiNE, Sanity, Ghost, Figma | Subagent C | obsidian.md, anytype.io, affine.pro, sanity.io/docs, ghost.org, figma.com docs |
| D4 — A11y / WCAG | Subagent D | WCAG 2.1/2.2 spec (w3.org), CSS `forced-colors` MDN, `prefers-reduced-motion` MDN, role=option ARIA 1.2 spec |
| D5 — CSS techniques + D6 drag interaction | Subagent E | MDN outline/box-shadow/has/ring, Tailwind `ring-offset` docs, CSS Tricks articles on double-border patterns |

## Subagent output contract

Each subagent returns structured Markdown with:
- **Findings table:** One row per pattern/editor/technique. Columns: Source, Finding, Confidence, Evidence URL/snippet.
- **Raw snippets:** ≥3 primary-source snippets per dimension (DOM inspection output, CSS rule quotes, spec excerpts, GitHub source).
- **Open questions:** What they couldn't confirm + negative searches performed.

Workers do NOT write files. Orchestrator extracts findings into evidence/ files.

## Coverage tracking

P0 facets tracked via tasks #37 subtasks (not created — small run). Orchestrator verifies before synthesis:
- [ ] D1: ≥6 distinct visual techniques cataloged
- [ ] D2: ≥10 editors surveyed with concrete findings
- [ ] D3: ≥3 approaches to double-outline handling documented
- [ ] D4: WCAG 2.4.7 / 2.4.11 / 2.4.13, forced-colors, reduced-motion covered
- [ ] D5: ≥5 CSS techniques with working code
