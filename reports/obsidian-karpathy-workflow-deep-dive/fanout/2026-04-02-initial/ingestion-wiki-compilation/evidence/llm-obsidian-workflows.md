# Evidence: LLM + Obsidian Workflows

## MCP Servers Ecosystem

### MCPVault (Recommended)
- **GitHub**: [bitbonsai/mcpvault](https://github.com/bitbonsai/mcpvault) | [mcpvault.org](https://mcpvault.org)
- **Architecture**: Direct filesystem access. No Obsidian plugin required. Obsidian doesn't need to be running.
- **14 tools**: `read_note`, `write_note`, `patch_note`, `delete_note`, `move_note`, `move_file`, `list_directory`, `search_notes` (BM25 reranking), `read_multiple_notes`, `get_frontmatter`, `update_frontmatter`, `get_notes_info`, `get_vault_stats`, `manage_tags`, `list_all_tags`
- **Safety**: Path traversal blocking, `.obsidian` exclusion, frontmatter preservation, deletion confirmation, symlink blocking. Read-only by default. Token-optimized (40-60% smaller).
- **Latest**: v0.11.0 (March 2026)
- **Compatible with**: Claude Desktop, Claude Code, ChatGPT Desktop, Gemini CLI, Cursor, Windsurf, IntelliJ

### StevenStavrakis/obsidian-mcp
- **GitHub**: [github.com/StevenStavrakis/obsidian-mcp](https://github.com/StevenStavrakis/obsidian-mcp) | PyPI: `obsidian-mcp`
- Direct filesystem, no plugin needed. 90% less memory via streaming architecture.
- Tools: CRUD + search + tags + multi-vault discovery

### cyanheads/obsidian-mcp-server
- **GitHub**: [github.com/cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server)
- **Requires**: Obsidian running + Local REST API plugin
- Benefits from Obsidian's own search indexing. Atomic frontmatter management.

### jacksteamdev/obsidian-mcp-tools
- **GitHub**: [github.com/jacksteamdev/obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools)
- Runs as Obsidian plugin. **Unique**: Semantic search + Templater integration.
- SLSA provenance-attested. v0.2.27.

### ProfSynapse/Nexus (formerly Claudesidian)
- **GitHub**: [github.com/ProfSynapse/claudesidian-mcp](https://github.com/ProfSynapse/claudesidian-mcp)
- Two-tool architecture (`getTools` + `useTools`) replaces 40+ tools. 95% less upfront token cost.
- Native chat view inside Obsidian, inline AI editing.

### Architecture Comparison

| Approach | Obsidian Required? | Advantages | Disadvantages |
|----------|-------------------|------------|---------------|
| **Filesystem-based** (MCPVault, StevenStavrakis) | No | Works offline, simple, reliable | No access to Obsidian search index |
| **REST API-based** (cyanheads) | Yes (running) | Uses Obsidian search, safer conflict handling | Plugin dependency, Obsidian must be open |
| **Plugin-based** (MCP Tools, Nexus) | Yes (running) | Semantic search, Templater, full Obsidian API | Most complex setup, tightest coupling |

## Claude Code + Obsidian Documented Workflows

### Direct Filesystem (simplest)
Claude Code has native filesystem tools (Read, Write, Edit, Glob, Grep). Three documented methods:
1. **Working directory**: `cd` into vault or place vault in working folder
2. **Symlinks**: `ln -s ~/obsidian-vault ~/projects/my-vault`
3. **MCP bridge**: Any of the MCP servers above
- Source: [awesomeclaude.ai](https://awesomeclaude.ai/how-to/use-obsidian-with-claude)

### Real User Workflows

| Person | Approach | Key Insight | Source |
|--------|----------|-------------|--------|
| Mauricio Gomes | `CLAUDE.md` in vault root + `mdfind` for PDF search | "Compound returns are huge" — 1 hour setup | [mauriciogomes.com](https://mauriciogomes.com/teaching-claude-code-my-obsidian-vault) |
| Eric Khun | "PartnerOS" — daily notes + control files, Claude scans last 3-5 days | Pattern detection across 200+ topic notes | [erickhun.com](https://erickhun.com/posts/partner-os-claude-mcp-obsidian/) |
| Eleanor Konik | Reorganized 12M-word vault | Bulk renaming, restructuring, impossible-to-find info surfaced | [eleanorkonik.com](https://www.eleanorkonik.com/p/how-claude-obsidian-mcp-solved-my) |
| Stefan Imhoff | 6,000+ note restructure for Claude Code | Restructured to Zettelkasten + PARA hybrid for agent compatibility | [stefanimhoff.de](https://www.stefanimhoff.de/agentic-note-taking-obsidian-claude-code/) |

## kepano/obsidian-skills
- **GitHub**: [github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) — 19.2K stars, 1.2K forks
- **Author**: Steph Ango (CEO of Obsidian)
- **NOT an MCP server or plugin** — it is prompt engineering (SKILL.md files) that teach agents correct Obsidian syntax/conventions.

### 5 Skills:
1. **obsidian-markdown** — wikilinks, embeds, callouts, properties, comments
2. **obsidian-bases** — `.base` files, views, filters, formulas
3. **json-canvas** — `.canvas` files, nodes, edges, groups
4. **obsidian-cli** — 100+ CLI commands (read, create, search, append)
5. **defuddle** — clean markdown extraction from web pages

### Installation:
```bash
npx skills add git@github.com:kepano/obsidian-skills.git
```

## Obsidian AI Plugins (None Do Wiki Compilation)

| Plugin | What It Does | Wiki Compilation? |
|--------|-------------|-------------------|
| **Smart Connections** | AI embeddings for semantic similarity + RAG Q&A | No — discovers connections, doesn't generate structure |
| **Copilot** | Vault Q&A via semantic search + text modification | No — editing assistance only |
| **Text Generator** | Prompt-based text generation | No — standalone content, not structural |
| **BMO Chatbot** | Chat interface with multiple LLM providers | No — chat tool only |

## Agent-Maintained Wiki Tools

### InsightA (closest to wiki compilation)
- **GitHub**: [HongjianTang/obsidian-insighta](https://github.com/HongjianTang/obsidian-insighta)
- Transforms long articles → atomic notes + MOCs using LLMs. Zettelkasten-inspired.

### Notemd (LLM-powered linking)
- [obsidianstats.com/plugins/notemd](https://www.obsidianstats.com/plugins/notemd)
- Intelligently chunk documents, insert context-aware wiki-links, auto-generate concept notes, web research, duplicate detection.

### Automatic Linker
- [github.com/kdnk/obsidian-automatic-linker](https://github.com/kdnk/obsidian-automatic-linker)
- Rule-based (not LLM): converts text matching filenames into `[[wikilinks]]`.

### Atomizer
- [obsidianstats.com/plugins/note-atomizer](https://www.obsidianstats.com/plugins/note-atomizer)
- AI-driven: turn lengthy text into atomic notes.

### AI Knowledge Filler
- [Forum post](https://forum.obsidian.md/t/ai-knowledge-filler-turn-any-llm-into-a-structured-file-generator-for-obsidian/111443)
- Generates Obsidian-ready `.md` with validated YAML, heading hierarchy, WikiLinks. Runs from phone widget.

## Concurrent Access Issues

- Obsidian watches filesystem but with caveats:
  - Editing file externally while open in Obsidian → **won't display changes until close/reopen** ([forum](https://forum.obsidian.md/t/monitoring-for-external-changes/51660))
  - File explorer may not immediately reflect bulk operations
- **Creating new files**: Generally works. File explorer picks them up (slight delay).
- **Modifying open files**: Risky. Can overwrite LLM's changes or vice versa.
- **Obsidian Sync**: Concurrent mods generate `sync-conflict-*.md` files. No file locking.
- **Best practice**: Don't have the same file open in Obsidian while LLM modifies it.

## Karpathy's Actual Workflow

From [deepakness.com/raw/llm-knowledge-bases/](https://deepakness.com/raw/llm-knowledge-bases/) and [x.com/karpathy](https://x.com/karpathy/status/2039805659525644595):

1. **Ingest**: Raw articles/papers/repos/datasets → `/raw/` directory
2. **Compile**: LLM reads `/raw/`, synthesizes into structured wiki pages with visualizations
3. **Query**: Ask complex questions against compiled wiki
4. **Output**: New markdown files, Marp slideshows, matplotlib images → filed back into wiki
5. **Key**: "The LLM writes and maintains all of the data of the wiki. He doesn't manually edit/add anything."
6. ~100 articles on several topics currently.

### Nobody Has Fully Implemented This
The pieces exist:
- InsightA for article → atomic notes
- Notemd for wiki-link insertion
- Claude Code for ad-hoc vault maintenance
- Obsidian CLI for agent-driven operations

But **no one has published a full automated compile-loop** that watches `/raw/`, detects new content, and regenerates wiki pages. This would require custom orchestration (Python/Node.js + LLM API).
