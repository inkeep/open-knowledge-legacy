---
name: Agent Retrieval Patterns in Production
description: How Claude Code, Cursor, Windsurf, Devin, and other AI tools retrieve knowledge in practice
type: evidence
dimension: D6-supplement
confidence: high
sources:
  - title: "Claude Code's approach — no indexing"
    authors: "Vadim (blog)"
    venue: "Blog post"
    date: "2026"
    url: "https://vadim.blog/claude-code-no-indexing"
  - title: "Cursor Rules documentation"
    authors: "Cursor"
    venue: "Cursor docs"
    date: "2025"
    url: "https://docs.cursor.com/context/rules"
  - title: "Windsurf Context Awareness"
    authors: "Windsurf"
    venue: "Windsurf docs"
    date: "2025"
    url: "https://docs.windsurf.com/context-awareness/overview"
  - title: "Devin Agents 101"
    authors: "Devin"
    venue: "Devin docs"
    date: "2025-2026"
    url: "https://devin.ai/agents101"
  - title: "Why I'm Against Claude Code's Grep-Only Retrieval"
    authors: "Milvus blog"
    venue: "Milvus/Zilliz blog"
    date: "2025-2026"
    url: "https://milvus.io/blog/why-im-against-claude-codes-grep-only-retrieval-it-just-burns-too-many-tokens.md"
---

# Agent Retrieval Patterns in Production

## Claude Code: Agentic Search Without Indexing

**Three-tool hierarchy**:
1. **Glob** — Pattern matching, returns file paths only (near-zero token cost)
2. **Grep** — Regex content search via ripgrep (lightweight, returns matching lines)
3. **Read** — Full file content into context (500-5,000 tokens per file)

**Sub-agent pattern**: Spawns an "Explore sub-agent" (Haiku-class model with isolated context) for deep codebase exploration. The sub-agent searches and returns summaries — not raw content — preserving the main agent's context budget.

**Key design decision**: No vector DB, no embeddings, no pre-indexing. The agent decides when and what to search.

**Quote from Boris Cherny** (creator): "Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better."

**Counterargument**: Token burn on common terms, struggles with semantic/conceptual queries. The Milvus blog argues for adding semantic search as a complement. The Claude Context MCP plugin adds vector search via Milvus/Zilliz.

## Cursor: RAG-Based with Layered Context

Five context layers:
1. `.cursorrules` / `.mdc` files (always loaded)
2. Notepads (persistent, user-referenced)
3. `@Docs` (external documentation)
4. `@Files` / `@Codebase` (project-specific, RAG-indexed)
5. Current conversation

**Key distinction from Claude Code**: Cursor **does** index the codebase and uses RAG for `@Codebase` queries. Rules files (`.cursor/rules/`) use `.mdc` format with metadata and path-scoping.

## Windsurf: RAG + Memories

- Indexes the entire codebase (including unopened files)
- "Optimized RAG approach" for retrieval
- **Memories system**: AI automatically identifies and stores important facts during conversations, loads relevant ones in future sessions
- Teams/Enterprise: Google Docs can be pulled as shared context

## Devin: Three-Layer Knowledge

1. **Direct documentation links** in prompts — "Explicitly point it to the latest docs"
2. **Playbooks** — Reusable prompt templates for repetitive tasks
3. **Persistent knowledge stores**:
   - Devin Wiki: Machine-generated project documentation
   - Devin Search: Code query engine
   - Configurable via `.devin/wiki.json`

## The Spectrum of Production Approaches

| Tool | Indexing | Retrieval | Agent Control |
|------|---------|-----------|---------------|
| Claude Code | None | Agentic (glob/grep/read) | Full agent control |
| Cursor | Pre-indexed RAG | Hybrid (RAG + context layers) | Partial agent control |
| Windsurf | Pre-indexed RAG | RAG + memories | Partial agent control |
| Devin | Mixed | Links + wiki + search | Agent selects from sources |

**The trend**: Moving from pre-indexed RAG toward giving agents more control over retrieval strategy. Claude Code represents one extreme (pure agentic), Cursor the other (structured RAG), with the field converging on a hybrid.

## Implications for Knowledge Platform Design

1. **Support both search and direct access** — Agents need `search(query)` AND `get(id)` patterns
2. **Metadata-first discovery** — Return titles/summaries before full content (like Glob before Read)
3. **Let agents iterate** — Don't assume one search will suffice; support refinement
4. **Keep it simple** — Claude Code's success with grep suggests simple keyword search is a strong baseline
5. **Don't hide the structure** — Topics, tags, cross-references help agents navigate
