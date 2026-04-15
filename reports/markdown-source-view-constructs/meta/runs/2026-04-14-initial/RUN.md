# Run 2026-04-14-initial

**Status:** Closed
**Report:** markdown-source-view-constructs
**Purpose:** Per-construct source-view rendering evidence for every non-MDX markdown element Open Knowledge supports. Complements the prior `codemirror-markdown-source-view-rendering` report (framework/primitives + tables).

## Construct scope

Block: blockquote, code (fenced), thematicBreak, list/listItem (bullet/ordered/task), html block, yaml frontmatter, definition, heading
Inline: emphasis, strong, inlineCode, link, linkReference, image, delete, highlight, wikiLink

## Excluded

- MDX constructs (user directive)
- `table` (prior report)
- Math, footnotes, alerts (not supported per CLAUDE.md §NG3)
- WYSIWYG rendering (prior report)
- CRDT mechanics (prior report)
- 1P analysis

## Competitor product set

- Obsidian (Source Mode + Live Preview)
- SilverBullet
- HedgeDoc
- Zettlr
- Typora
- MDXEditor
- HackMD
- Lapce
- Helix
- Marktext
- VS Code + markdown extensions
- codemirror-rich-markdoc (reference impl)

## Source anchors

- `@lezer/markdown` grammar — node name canonical source
- `codemirror.net/docs` + `discuss.codemirror.net` — primitives + authoritative guidance
- Product GitHub repos + forum threads
- Prior reports for cross-reference (not evidence)

## Subagent allocation

- Agent 1: blockquote (D2) + list/listItem (D4) — prefix/marker family
- Agent 2: code fenced + inlineCode (D3) + html block (D5) + yaml frontmatter (D6) — container/content family
- Agent 3: heading (D7) + thematicBreak (D8) + inline marks (D10) — short-range + cursor-reveal family
- Agent 4: link/image/linkReference/definition (D9) + composition (D11) + framework (D1) — URL + cross-cutting

Orchestrator: D12 competitor cross-cut matrix + D13 per-construct primitive stack synthesis.

## Evidence file plan

- evidence/d1-framework.md
- evidence/d2-blockquote.md
- evidence/d3-code-and-inline-code.md
- evidence/d4-list-and-listitem.md
- evidence/d5-html-block.md
- evidence/d6-yaml-frontmatter.md
- evidence/d7-heading.md
- evidence/d8-thematic-break.md
- evidence/d9-link-image-definition.md
- evidence/d10-inline-marks.md
- evidence/d11-composition-nesting.md
- evidence/d12-competitor-matrix.md
- evidence/d13-pattern-matrix.md
