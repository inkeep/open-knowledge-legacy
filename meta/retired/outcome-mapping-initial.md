---
title: "Initial outcome mapping — workstreams and beneficiaries"
type: synthesis
created: 2026-04-02
status: superseded
superseded-by: PROJECT.md stories section
reason: "W3 (compilation) and W4 (query) dissolved into skills (PQ3). Outcomes evolved from 5 workstreams to 3 outcomes."
---

## TLDR
Five workstreams emerge from the bet. Each maps to a distinct beneficiary + observable change. Cross-cutting: CRDT architecture, git storage, MCP protocol thread through all of them.

## Workstream → Outcome mapping

### W1: Rich Markdown Editor
**Beneficiary:** IC (developer or knowledge worker)
**Observable change:** Can create and edit markdown with an Obsidian-grade experience — rich rendering, flip between source and WYSIWYG, slash commands, embedded media, code blocks with syntax highlighting.
**Why it matters:** The editor IS the product for humans. Without this, it's just a folder of .md files. The editing experience is what makes someone choose this over Obsidian, VS Code, or Notion.
**OpenDesign parallel:** TipTap/ProseMirror editor ↔ OpenDesign's visual canvas. Different rendering engine, same role in the product.

### W2: Agent Integration Layer (MCP Server)
**Beneficiary:** AI agents (Claude Code, Cowork, Cursor, Codex) — and by extension, the IC who uses them
**Observable change:** An agent can read articles, search the knowledge base, write/edit articles, query across the wiki, and see the knowledge structure — all via MCP tools.
**Why it matters:** This is what makes it "agent-native" vs "agent-compatible." The agent isn't scraping files — it has structured tools for knowledge operations.
**OpenDesign parallel:** MCP filesystem bridge (Report 13). Same pattern — agent writes go through a protocol layer that syncs with the editor.

### W3: Knowledge Compilation Engine
**Beneficiary:** IC who ingests raw sources and wants structured knowledge
**Observable change:** Can point the system at raw sources (articles, PDFs, repos, notes) and get a compiled, structured, interlinked wiki. Auto-generated indexes, summaries, cross-references, categories.
**Why it matters:** This is the Karpathy vision. The LLM doesn't just assist — it builds and maintains the knowledge structure. This is the compounding loop.
**Unique to knowledge product:** No parallel in OpenDesign. This is the "compile" step that's domain-specific.

### W4: Knowledge Query & Output
**Beneficiary:** IC who needs answers or artifacts from their knowledge base
**Observable change:** Can ask complex questions against the KB and get grounded answers with citations. Can request outputs as articles, slide decks, reports, visualizations — not just chat text.
**Why it matters:** The knowledge base isn't just storage — it's an answering engine. The IC's queries and explorations compound back into the KB.
**Partial OpenDesign parallel:** The "output" rendering uses the same web UI infrastructure.

### W5: Skill/MCP Authoring & Distribution
**Beneficiary:** IC who wants to encode operational knowledge as executable agent capabilities; teams who consume those capabilities
**Observable change:** Can author a skill/MCP tool within the knowledge base, test it, publish it to a registry. Other agents can discover and use it.
**Why it matters:** This is the "reusable component" story. Knowledge isn't just text — it's capabilities. This is what differentiates from every other wiki tool.
**OpenDesign parallel:** shadcn registry for component distribution. Same pattern — author, publish, consume, update.

## Cross-cutting concerns identified
1. **Storage substrate (markdown + git):** All workstreams read/write markdown files. Git provides versioning, audit trail, collaboration foundation.
2. **CRDT layer (Yjs):** Editor and agent must be able to co-edit. Even in single-player P0, the architecture must support future multiplayer. YText per file.
3. **Web UI shell:** Editor, query interface, knowledge graph view, settings — all live in the same web UI.
4. **File watching / sync:** Changes from any source (editor, agent, external tool) must propagate to all views.

## Tensions
- W1 (rich editor) vs W2 (agent MCP) compete for P0 attention. Both feel essential but serve different interaction modes.
- W3 (compilation) is the "magic" but also the hardest to get right. Quality of LLM compilation determines product quality.
- W5 (skill registry) is the long-term differentiator but adds significant scope. May be the "Next" not "Now."
