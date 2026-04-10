# Evidence: Obsidian Agent Ecosystem Map (April 2026)

## Agent-in-Obsidian Solutions

### 1. Claudian
- **Source:** https://github.com/YishenTu/claudian
- **Stars:** ~5,700
- **What:** Obsidian plugin embedding Claude Code as sidebar chat
- **Capabilities:**
  - Full agentic: read/write/edit files, search, bash commands
  - Vault directory becomes Claude's working directory
  - Inline editing with word-level diff preview
  - Vision support (analyze images)
  - Context: focused note auto-attached, @-mention files, exclude by tag, editor selection
  - External directory access
- **Agent interaction:** Claude Code runs as subprocess with vault as CWD
- **Concurrent editing:** Inline diffs with accept/reject per change
- **Limitation:** No concurrent pending edits across multiple selections (feature request exists)

### 2. Agent Client (RAIT-09/obsidian-agent-client)
- **Source:** https://github.com/RAIT-09/obsidian-agent-client
- **Forum:** https://forum.obsidian.md/t/new-plugin-agent-client-bring-claude-code-codex-gemini-cli-inside-obsidian/108448
- **What:** Brings Claude Code, Codex CLI, and Gemini CLI into Obsidian
- **Built on:** Agent Client Protocol (ACP) by Zed
- **Capabilities:**
  - Switch between multiple agents (Claude Code, Codex, Gemini CLI, custom)
  - Change models and agent modes from chat
  - @notename for note references
  - Image attachments
  - Slash commands from agent
  - Multi-agent + multi-session support
  - Floating chat (persistent access)
  - Terminal integration (agents execute shell commands)
  - File editing with permission controls
  - Chat export
- **Notable:** Multi-agent/multi-session is unique; most mature agent client

### 3. Obsidian AI CLI (BlackDragonBE/Obsidian-AI-CLI)
- **Source:** https://github.com/blackdragonbe/obsidian-ai-cli
- **What:** Integrate Claude Code and Gemini CLI into Obsidian workflow

### 4. Obsidian Copilot (logancyang/obsidian-copilot)
- **Source:** https://github.com/logancyang/obsidian-copilot
- **What:** AI assistant with RAG capabilities, not a full agent but provides Q&A

## Agent Skills / Instructions

### kepano/obsidian-skills
- **Source:** https://github.com/kepano/obsidian-skills
- **Stars:** 19,200+
- **What:** 5 skill files teaching agents Obsidian conventions
- **Skills:** obsidian-markdown, obsidian-bases, json-canvas, obsidian-cli, defuddle
- **Compatible with:** Claude Code, Codex CLI, OpenCode
- **Installation:** Marketplace, npx, or manual copy to `.claude/` folder

## MCP as Agent Interface Layer

### Architecture Pattern
```
Agent (Claude Code / Codex / Gemini) 
  ↓ MCP protocol
MCP Server (mcpvault / cyanheads / etc.)
  ↓ filesystem or REST API
Obsidian Vault (files on disk)
  ↑ file watcher
Obsidian App (UI, cache, plugins)
```

### What MCP Enables for Agents
- Read vault contents (notes, frontmatter, tags)
- Create new notes with correct formatting
- Modify existing notes (append, prepend, patch, overwrite)
- Search vault (text, BM25, regex, some semantic)
- Manage metadata (frontmatter, tags)
- Navigate knowledge graph (backlinks, outlinks, traversal)
- Execute templates (via obsidian-mcp-tools)

### What MCP CANNOT Do
- ❌ Subscribe to real-time vault change events
- ❌ Lock files for exclusive editing
- ❌ Get notification when user edits a file
- ❌ Coordinate with other MCP clients (no mutex/semaphore)
- ❌ Execute Obsidian commands (open file, toggle sidebar) — except via REST API servers
- ❌ Access Obsidian's UI state (which file is open, cursor position)
- ❌ Trigger plugin operations (Smart Connections reindex, Dataview refresh)
- ❌ Read Obsidian's search index directly
- ❌ Access Canvas/Bases views programmatically (except obsidian-mcp-pro for Canvas)

## Permissions Model

### Current State: NONE
- All MCP servers (except dp-veritas read-only) grant full read/write/delete
- No per-file or per-folder restrictions
- No audit log of agent actions
- No agent attribution in file history
- No confirmation dialogs for destructive operations
- Only dp-veritas/mcp-obsidian-tools is read-only (4 stars, minimal adoption)

### What's Needed for Safe Agent Use
1. Read-only mode for Q&A workflows (only dp-veritas provides this)
2. Per-folder write restrictions (e.g., agent can only write to `/wiki/`)
3. Audit log: what did the agent create/modify/delete?
4. Attribution: metadata in frontmatter indicating agent-generated content
5. Confirmation flow for destructive operations (delete, rename)
6. File locking for concurrent access safety
