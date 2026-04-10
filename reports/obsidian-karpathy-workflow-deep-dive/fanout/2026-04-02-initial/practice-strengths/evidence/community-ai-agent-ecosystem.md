# Evidence: Obsidian + AI Agent Community Ecosystem (2025-2026)

## Key Projects and Plugins

### 1. obsidian-skills (Official — by kepano)
- **Source:** [github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- 5 agent skills teaching Claude Code/Codex how to work with Obsidian formats
- MIT licensed, open Agent Skills specification
- First officially maintained agent skills by a tool vendor

### 2. Agent Client Plugin
- **Source:** [Obsidian Forum announcement](https://forum.obsidian.md/t/new-plugin-agent-client-bring-claude-code-codex-gemini-cli-inside-obsidian/108448)
- Brings Claude Code, Codex, and Gemini CLI inside Obsidian
- Embeds terminal-like AI agent interface within the app

### 3. Agentfiles Plugin
- **Source:** [github.com/Railly/agentfiles](https://github.com/Railly/agentfiles)
- **Launch:** March 28, 2026 (311 GitHub stars quickly)
- Discovers, organizes, and edits AI agent skills across 13+ coding assistants
- Three-panel interface: sidebar filters, skill list, preview panel
- Analytics dashboard with burn rates, context usage, health metrics
- Marketplace integration with skills.sh registry
- Smart filtering: stale, oversized, conflicting skills

### 4. Claudian Plugin
- **Source:** [github.com/YishenTu/claudian](https://github.com/YishenTu/claudian)
- Embeds Claude Code as AI collaborator in vault
- Reusable skill modules compatible with Claude Code skill format
- Custom agents that Claude can invoke

### 5. Obsidian Claude Code MCP
- **Source:** [github.com/iansinnott/obsidian-claude-code-mcp](https://github.com/iansinnott/obsidian-claude-code-mcp)
- Dual-transport MCP server (WebSocket for Claude Code, HTTP/SSE for Claude Desktop)
- Port 22360 default, auto-discovery
- File operations, workspace context, multiple client support
- Claude Code connects via `/ide` command

### 6. Obsidian MCP Server (cyanheads)
- **Source:** [github.com/cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server)
- Comprehensive tool suite: read, write, search, manage notes/tags/frontmatter
- Bridges to Obsidian Local REST API plugin

### 7. Smart Connections MCP
- **Source:** [github.com/dan6684/smart-connections-mcp](https://github.com/dan6684/smart-connections-mcp)
- Exposes Smart Connections vector database to Claude Code via semantic search

### 8. Copilot for Obsidian
- **Source:** [github.com/logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot)
- In-vault AI assistant with chat-based vault search
- Vault QA with RAG (optional indexing for semantic search)
- Agent Mode (Plus) with autonomous tool calling
- Free core features, premium for advanced RAG

### 9. Notemd
- **Source:** [github.com/Jacobinwwey/obsidian-NotEMD](https://github.com/Jacobinwwey/obsidian-NotEMD)
- Auto-generates wiki-links for key concepts
- Creates corresponding concept notes
- Web search summarization (Tavily/DuckDuckGo)
- Duplicate detection and cleanup
- Batch Mermaid/LaTeX syntax correction
- "Extract Concepts" feature for creating concept notes without altering originals

### 10. LLM Workspace
- **Source:** [obsidianstats.com/plugins/llm-workspace](https://www.obsidianstats.com/plugins/llm-workspace)
- Custom workspaces per project/topic
- Granular control over prompts and responses
- Integrates LLMs directly into note-taking workflow

## Integration Approaches (3 Paradigms)

### Paradigm A: Plugin-Internal AI
- AI runs inside Obsidian via plugin
- Examples: Copilot, Smart Connections, Notemd
- **Pro:** Integrated UI, vault-aware
- **Con:** Limited by Obsidian's plugin sandbox, can't run background processes

### Paradigm B: MCP Bridge
- External AI agent connects to vault via MCP protocol
- Examples: Obsidian Claude Code MCP, Smart Connections MCP, cyanheads MCP server
- **Pro:** Full agent capabilities, not limited by Obsidian's sandbox
- **Con:** Requires external tool (Claude Code, Claude Desktop)

### Paradigm C: Agent Skills (Format Teaching)
- Teaches agents Obsidian file formats; agents work directly on filesystem
- Examples: obsidian-skills, Agentfiles
- **Pro:** Zero runtime dependency, works with any compatible agent
- **Con:** No live vault awareness, no hot-reload in Obsidian

## Community Sentiment
- **Source:** [Thread by @Hesamation](https://x.com/Hesamation/status/2026801420872093708)
- "Obsidian + AI is the new hot combo"
- Rapid growth in MCP-based integrations
- Tension between plugin-based AI and external-agent AI
- Community largely positive but fragmented across approaches
- [3 Ways to Use Obsidian with Claude Code](https://awesomeclaude.ai/how-to/use-obsidian-with-claude) — guide documenting the convergence
