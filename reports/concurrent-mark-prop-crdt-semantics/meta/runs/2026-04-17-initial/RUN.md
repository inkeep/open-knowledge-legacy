# Run: 2026-04-17-initial

**Status:** Active
**Orchestrator:** Research subagent (headless)
**Purpose:** Populate the initial REPORT.md on concurrent mark and structured-attr CRDT semantics across production collaborative editors. 3P-factual framing. Informs STORY.md A2/A2b for text-only CRDT PM projection decision.

## Central research question

When two users concurrently edit overlapping ranges — specifically (a) toggling bold/italic/link on the same text span, and (b) editing the same attribute on the same structured element — what CRDT / OT semantics do production editors ship? Is character-level resolution (marks as serialized source chars like `**bold**` sharing a text CRDT) EVER shipped, or have editors converged on tree/attr-LWW semantics?

## Rubric dimensions

| # | Dimension | Priority |
|---|-----------|----------|
| D1 | Notion — sync model + mark/attr composition | P0 |
| D2 | Linear — Sync Engine + description marks/issue-attr merge | P0 |
| D3 | Google Docs — OT-based mark composition | P0 |
| D4 | Figma — CRDT text properties composition | P0 |
| D5 | Confluence/Atlassian — ProseMirror CRDT migration, mark composition | P0 |
| D6 | TipTap + y-prosemirror — canonical reference, Y.XmlText attrs, source-trace | P0 Deep |
| D7 | Quill + y-quill — Delta format, mark merging under concurrency | P0 |
| D8 | Diamond-types / ethersync — operational CRDTs with text+format | P1 |
| D9 | Peritext — boundary semantics, implementations, theoretical baseline | P0 Deep |
| D10 | Obsidian — experimental collab, CodeMirror-based | P1 |
| D11 | HedgeDoc/CodiMD — text-OT with literal source chars (closest shipping analog to char-RGA marks) | P0 Deep |
| D12 | Academic — Peritext (Litt & Kleppmann 2021), Fugue (Weidner & Kleppmann 2023), RGASplit, Eg-walker | P0 |

## Delta questions (drive synthesis)

- Q1: Is char-RGA mark composition shipped anywhere in production?
- Q2: What specific visual artifacts occur when concurrent mark toggles produce garbled markdown (e.g., `**a*bc**def*`)? Transient, self-healing, or persistent?
- Q3: Has the boundary-expansion problem (Peritext's core concern) been user-visible in shipped y-prosemirror-based editors?
- Q4: For structured attrs (MDX-style or Notion block attrs): char-level merging shipped anywhere, or ecosystem converged on attr-LWW?
- Q5: Is there a "semantic mark emitter" pattern anywhere (whole-attribute replacement atomically)?

## Source anchors

- Peritext paper (Litt & Kleppmann 2021): https://www.inkandswitch.com/peritext/
- Fugue paper (Weidner & Kleppmann 2023): https://arxiv.org/abs/2305.00583
- Notion engineering blog: https://www.notion.so/blog/data-model-behind-notion
- Linear engineering: https://linear.app/blog/scaling-the-linear-sync-engine
- Linear Tuomas Artman talk: https://www.youtube.com/watch?v=Wo2m3jaJixU
- Figma multiplayer blog: https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- y-prosemirror repo: https://github.com/yjs/y-prosemirror
- y-quill repo: https://github.com/yjs/y-quill
- Y.Text docs: https://docs.yjs.dev/api/shared-types/y.text
- Quill Delta docs: https://github.com/slab/delta
- HedgeDoc: https://github.com/hedgedoc/hedgedoc
- CodiMD / old HackMD: https://github.com/hackmdio/codimd
- Confluence NCCC (Atlassian): https://developer.atlassian.com/cloud/ (search "collaborative editing" / "NCCC" / "Synchrony")
- Diamond-types: https://github.com/josephg/diamond-types
- Ethersync: https://github.com/ethersync/ethersync
- Obsidian Sync: official docs + forum
- Automerge Peritext: https://github.com/automerge/automerge-peritext

## Coverage tracking

- [x] D1 Notion — via web-research subagent
- [x] D2 Linear — via web-research subagent
- [x] D3 Google Docs — via web-research subagent
- [x] D4 Figma — via web-research subagent
- [x] D5 Confluence — via web-research subagent
- [x] D6 y-prosemirror — via source-code subagent (Opus)
- [x] D7 y-quill — via source-code subagent
- [x] D8 Diamond-types — via web-research subagent
- [x] D9 Peritext — via web-research subagent + prior report re-verification
- [x] D10 Obsidian — via web-research subagent
- [x] D11 HedgeDoc — via source-code subagent
- [x] D12 Academic — via web-research subagent

## Fanout plan

Three parallel subagent dispatch groups (run in parallel):

1. **Group A — Production closed/proprietary editors (web-first):** Notion, Linear, Google Docs, Figma, Confluence, Obsidian
2. **Group B — OSS bindings + source trace (code-first):** y-prosemirror, y-quill, HedgeDoc, Diamond-types/ethersync
3. **Group C — Academic + theoretical (web-first):** Peritext paper, Fugue, RGASplit, Eg-walker

## Status: Closed

Run completed. REPORT.md written.
