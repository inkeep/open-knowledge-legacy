# Run 2026-04-14-initial

**Status:** Closed
**Report:** codemirror-markdown-source-view-rendering
**Purpose:** Survey how CM6 ecosystem and CM6-based markdown source editors handle structured markdown constructs (tables + long lines + adjacent) — what primitives CM6 exposes, what products do, what maintainers recommend.

---

## Primary question

When a markdown source view uses CodeMirror 6 and contains a logical line much longer than the wrap width, what patterns do ecosystem products use, what primitives does CodeMirror 6 expose, and which combinations do maintainers/authoritative sources recommend?

## Stance

Factual 3P survey with synthesis (pattern matrix). No recommendations for Open Knowledge.

## Rubric (delta — only dimensions this run covers)

- D1: CodeMirror 6 primitives (P0/Deep) — Agent 1
- D2: Authoritative CM6 guidance (P0/Moderate) — Agent 1
- D3: Obsidian Source Mode & Live Preview (P0/Deep) — Agent 2
- D4: `codemirror-rich-markdoc` deep dive (P0/Deep) — Agent 1
- D5: SilverBullet (P0/Moderate) — Agent 3
- D6: Other CM-based markdown source editors (P1/Moderate) — Agent 3
- D7: TipTap ecosystem stance (P1/Light) — Agent 4
- D8: Pattern matrix (P0/Synthesis) — orchestrator
- D9: Known failure modes & edge cases (P1/Moderate) — Agent 4

## Source anchors

- `discuss.codemirror.net` — authoritative CM6 forum (Marijn Haverbeke)
- `codemirror.net/examples/` — official decoration/styling examples
- `codemirror/dev` — GitHub issue tracker
- `@lezer/markdown` — markdown grammar, provides Table/TableRow node types for syntaxTree traversal
- `github.com/segphault/codemirror-rich-markdoc` — block-widget-replace reference implementation
- `forum.obsidian.md` — Obsidian community; closed desktop app means community is dominant
- `~/.claude/oss-repos/` — locally cloned: y-codemirror.next, codemirror-collab, obsidian-git, logseq, dendron, foam, tiptap, blocknote, milkdown, plate

## Constraints

- No 1P analysis (Open Knowledge codebase out of scope per rubric non-goals)
- No MDX-specific concerns (covered elsewhere)
- No WYSIWYG rendering (covered elsewhere)
- No CRDT mechanics beyond y-codemirror.next compatibility notes

## Coverage tracking via tasks

- Agent 1: D1 + D2 + D4 (CM6 primitives, forum, rich-markdoc)
- Agent 2: D3 (Obsidian)
- Agent 3: D5 + D6 (SilverBullet + others)
- Agent 4: D7 + D9 (TipTap + edge cases)
- Orchestrator: D8 synthesis from all four

## Evidence layout

- `evidence/d1-d2-codemirror-primitives-and-guidance.md` (D1+D2 — related, same subagent)
- `evidence/d3-obsidian.md`
- `evidence/d4-codemirror-rich-markdoc.md`
- `evidence/d5-silverbullet.md`
- `evidence/d6-other-cm-editors.md`
- `evidence/d7-tiptap-stance.md`
- `evidence/d8-pattern-matrix.md` (synthesis)
- `evidence/d9-edge-cases.md`
