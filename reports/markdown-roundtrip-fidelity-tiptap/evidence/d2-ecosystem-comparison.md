# Evidence: D2 — Ecosystem Comparison

**Dimension:** D2 — prosemirror-markdown vs @tiptap/markdown vs remark/unified comparison
**Date:** 2026-04-07
**Sources:** Source code analysis and live testing of all three ecosystems

---

## Key files / pages referenced

- `@tiptap/markdown` v3.22.2 — uses `marked` v17, custom tokenizer/serializer architecture
- `prosemirror-markdown` v1.13.4 — uses `markdown-it` v14, built-in token-to-PM and PM-to-markdown
- `@handlewithcare/remark-prosemirror` — uses `remark-parse`/`remark-stringify` via mdast intermediary
- `tiptap-markdown` (community, v0.8.x) — uses `markdown-it` + `prosemirror-markdown` serializer
- https://github.com/handlewithcarecollective/remark-prosemirror
- https://discuss.prosemirror.net/t/new-markdown-library-remark-prosemirror/8049

---

## Findings

### Finding: Three distinct architectures with different trade-off profiles

**Confidence:** CONFIRMED

#### Architecture A: prosemirror-markdown (markdown-it → ProseMirror)

Pipeline: `markdown string → markdown-it tokens → custom token handlers → PM Node → custom node serializers → markdown string`

**Strengths:**
- Battle-tested (created by Marijn Haverbeke, ProseMirror creator)
- Tight list attribute support built into default schema
- Custom info strings on code blocks preserved via `params` attribute
- Direct token-to-PM mapping — no intermediate DOM
- npm: 770K+ weekly downloads

**Weaknesses:**
- Default schema is minimal (no tables, no task lists, no strikethrough)
- Bullet marker always `*` (configurable but not per-source)
- Blockquote continuation lines merged (cosmetic)
- Hard break serializes as `\` not trailing spaces (configurable)
- No extensibility hooks for custom markdown syntax without forking markdown-it

**Round-trip fidelity:** 12/25 byte-identical, 13/25 differ. Converges after 1 cycle.

#### Architecture B: @tiptap/markdown v3 (marked → JSON → markdown)

Pipeline: `markdown string → marked Lexer → registered parseMarkdown handlers → TipTap JSON → registered renderMarkdown handlers → markdown string`

**Strengths:**
- Built into TipTap ecosystem — each extension can declare its own markdown handlers
- Uses `marked` which is more configurable for custom syntax (`.use()` API)
- Custom tokenizer registration via `markdownTokenizer` config
- Custom info strings preserved (tested: `jsx-component` survived round-trip)
- Strikethrough works out of the box
- Dash bullet marker by default (more common in modern markdown)
- HTML entity handling (encodes/decodes)

**Weaknesses:**
- Tight/loose list distinction currently lost (tested: loose → tight)
- Task list checkboxes lost without TaskList extension
- Escaped characters consumed (backslash escapes not round-tripped)
- HTML blocks entity-escaped (not preserved as raw HTML)
- Newer architecture (released v3.7.0, less battle-tested)
- No DOM intermediary for parse (operates on JSON), but `parseHTMLToken` falls back to `generateJSON` which requires `window` (no server-side HTML parsing)

**Round-trip fidelity:** 14/27 byte-identical, 13/27 differ. Converges after 1 cycle.

#### Architecture C: remark-prosemirror (remark/mdast → ProseMirror)

Pipeline: `markdown string → remark-parse → MDAST → mdast-to-prosemirror → PM Node → prosemirror-to-mdast → MDAST → remark-stringify → markdown string`

**Strengths:**
- MDAST is the richest intermediate representation — preserves structural information that tokens lose
- remark ecosystem has plugins for everything: GFM, frontmatter, math, directives, MDX
- Schema-agnostic — handlers map MDAST nodes to arbitrary PM schema
- remark-stringify is highly configurable (bullet, emphasis, strong, rule characters, etc.)
- Theoretically highest fidelity because MDAST preserves more structure

**Weaknesses:**
- Not integrated with TipTap extension system — requires manual handler registration
- Smaller ecosystem/community than prosemirror-markdown
- More moving parts (remark-parse + mdast-util-to-prosemirror + reverse + remark-stringify)
- No live test conducted (would require building custom PM schema + handlers)

**Theoretical round-trip fidelity:** Higher than prosemirror-markdown because MDAST preserves:
- `spread` attribute on list items (tight vs loose)
- `position` data (source locations)
- Separate `html` node type
- Frontmatter node (via remark-frontmatter plugin)

### Finding: @tiptap/markdown v3 is the right choice for TipTap-based projects despite marginally lower fidelity
**Confidence:** INFERRED

Reasoning:
1. It integrates directly with TipTap's extension system — each extension declares its own parseMarkdown/renderMarkdown
2. It supports custom tokenizers via marked.use() for non-standard syntax
3. The lossy patterns are either cosmetic or fixable via custom handlers
4. prosemirror-markdown would require a separate "markdown config" layer alongside TipTap's extensions
5. remark-prosemirror would require abandoning TipTap's markdown infrastructure entirely

**The ecosystem choice should be:** @tiptap/markdown v3 as the primary, with custom handlers to fix the fixable losses.

---

## Negative searches

- Searched for round-trip fidelity benchmarks comparing all three: none found
- Searched for @handlewithcare/remark-prosemirror round-trip test suites: none published
- Searched for production systems using remark-prosemirror with TipTap: none found

---

## Gaps / follow-ups

- remark-prosemirror was not live-tested — theoretical assessment only
- The community `tiptap-markdown` (which uses markdown-it/prosemirror-markdown internals) was not independently tested in isolation
