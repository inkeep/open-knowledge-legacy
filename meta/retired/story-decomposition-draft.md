---
title: "Story decomposition — first draft across all three outcomes"
type: synthesis
created: 2026-04-02
status: superseded
superseded-by: PROJECT.md stories section
reason: "Stories rewritten multiple times. S1 is now unified WYSIWYG with void nodes. S2 is now source toggle. Story numbering changed."
---

## TLDR
Three outcomes decompose into ~8-10 stories. The substrate (storage/org) is cross-cutting infrastructure, not a separate story stream — it's the delivery grouping that enables the first editor and MCP stories.

## Decomposition logic

The three outcomes are:
1. Rich markdown editor (human surface)
2. MCP server (agent surface)
3. Storage + organization (substrate)

Outcome 3 (substrate) is NOT a separate story stream — it's cross-cutting infrastructure that enables 1 and 2. This follows the quality-examples guidance: "define the unified type system" is an anti-pattern; the substrate surfaces as delivery groupings and cross-cutting concerns, not as independent stories.

The stories should be framed as: "When we're done, [who] can [what]."

## Draft stories

### S1: IC can create and edit markdown articles with rich rendering
The core editing experience. Create a new article, edit with WYSIWYG rendering (headings, lists, tables, code blocks, images, links), flip to raw markdown source. Slash commands for inserting blocks. The "Obsidian-grade" baseline.
- Requires: editor framework (TQ4), markdown round-trip (TQ3), web UI shell
- Enables: everything else — this is the foundation humans interact with

### S2: IC can organize articles in a navigable project structure
Browse articles in a sidebar/file tree. Create folders. Tag articles via frontmatter. Search across articles (full-text at minimum). Navigate between linked articles.
- Requires: S1 (articles exist to organize), project structure convention
- Enables: agent discovery (S5), knowledge graph view (later)

### S3: IC can see their AI agent's edits appear in real-time with presence indicators
The human+AI co-editing UX. When an external agent writes via MCP, the human sees: AI cursor in the editor, "AI is typing" indicator, sidebar presence showing which files the agent is editing, origin shading on agent-written content.
- Requires: CRDT layer (TQ1), editor (S1), MCP server (S4)
- This is the differentiating UX — no other product has this

### S4: An external AI agent can read, write, and search articles via MCP tools
The agent interface. MCP server exposes tools: read_article, write_article, edit_article, list_articles, search_articles, read_frontmatter, update_frontmatter. Agent connects via MCP protocol. Writes go through CRDT layer and appear in the editor in real-time.
- Requires: CRDT layer (TQ1), storage conventions
- Enables: co-editing (S3), all skill-based workflows

### S5: An external AI agent can discover and understand the KB structure
The agent can list all articles, read frontmatter metadata, understand the organization (folders, tags, relationships). The KB is legible to the agent — not just a bag of files.
- Requires: frontmatter conventions (TQ6), MCP tools (S4)
- This is what makes the KB a "brain" vs a "filesystem"

### S6: IC's edits and agent's edits are version-controlled in git automatically
Every change (human or agent) is persisted to git. Auto-commits on idle. The IC can see version history, diff changes, revert. Git is the durability and audit layer.
- Requires: CRDT layer (TQ1), git auto-persistence (OpenDesign Report 46 architecture)
- Enables: collaboration (later — PRs, branches), trust in the system

### S7: IC can flip between rich editing and raw markdown source
The mode toggle. View the same article as rendered WYSIWYG blocks OR as raw markdown text. Edits in either mode are reflected in the other. This is the "IDE" quality — power users can drop to source.
- Requires: editor (S1), markdown round-trip fidelity (TQ3)
- This is what differentiates from Notion (no source view) and VS Code (no rich rendering)

### S8: IC can author and store skills alongside knowledge articles
Skills (SKILL.md files with optional scripts) live in the same project as knowledge articles. The IC can create, edit, and organize skills using the same editor. Skills are just markdown files with conventions — the product doesn't execute them.
- Requires: editor (S1), project structure (S2)
- Enables: external agents discovering and using skills from the KB

## Potential Later stories (not P0)
- Knowledge graph visualization (see relationships between articles)
- Multi-project management (multiple KBs)
- Publishing to a docs site (Mintlify replacement)
- Team collaboration (multi-human multiplayer)
- Cloud hosting
- Skill distribution registry
