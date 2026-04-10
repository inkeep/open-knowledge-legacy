# Evidence: Agent + Human Simultaneous Editing in Obsidian

## How Obsidian Detects External File Changes

### Filesystem Watcher Behavior
- Obsidian uses filesystem watchers (inotify on Linux, FSEvents on macOS, etc.)
- **Root directory:** External changes (create, delete, modify) reflected instantaneously
- **Subdirectories:** Changes may go unnoticed until manually triggered
- Historical limitation: watcher only covered top-level vault directory, not subdirectories
- Feature request to expand watcher to whole vault exists since early Obsidian days

**Source:** [Obsidian Forum — Expand the file watcher capability to the whole vault](https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174)
**Source:** [Obsidian Forum — Monitoring for External Changes](https://forum.obsidian.md/t/monitoring-for-external-changes/51660)

### What Happens When an External Program Modifies a File That's Open

1. If a file is edited externally while open in Obsidian, **changes won't display** until the file is closed and reopened
2. If the user modifies the note in Obsidian before closing/reopening, **external changes get overwritten**
3. A "Note has been modified externally" notification may appear, with "merging changes automatically"
4. The automatic merge uses diff-match-patch but has reported failures:
   - Entire text of a document deleted during "merge"
   - Contents of one note replacing another

**Source:** [Obsidian Forum — "modified externally" message erasing text](https://forum.obsidian.md/t/bug-modified-externally-message-constantly-appears-erasing-my-text/26090)
**Source:** [Obsidian Forum — Obsidian Vault Files Overwritten](https://forum.obsidian.md/t/obsidian-vault-files-overwritten/72527)
**Source:** [Obsidian Forum — Content of a Note totally Replaced/overwritten](https://forum.obsidian.md/t/content-of-a-note-totally-replaced-overwritten-with-content-of-another-note/102819)

### Race Condition Scenarios

| Scenario | Outcome | Risk Level |
|----------|---------|------------|
| Agent writes while user has note closed | File updates; Obsidian picks up change on next open | Low |
| Agent writes while user has note open but idle | "Modified externally" notification; auto-merge attempted | Medium |
| Agent writes while user is actively editing | 2-second auto-save may overwrite agent changes, or auto-merge may corrupt | High |
| Agent writes to note user has never opened | Appears normally in file explorer | Minimal |

## Obsidian CLI (Official, 2026)

### Capabilities
- Read, search, and write to vault programmatically
- `obsidian create`, `obsidian read`, `obsidian search`, `obsidian daily:append`
- `obsidian serve` — starts MCP server exposing vault operations to AI assistants
- Designed explicitly for agentic use cases

### Agentic Integration Points
- "Give agentic tools access to a vault without access to your full computer"
- "Run scheduled automations — aggregate daily notes, auto-tag"
- MCP server compatible with: Claude Desktop, Claude Code, ChatGPT Desktop (Enterprise+), Gemini CLI

**Source:** [Obsidian CLI](https://obsidian.md/cli)
**Source:** [Obsidian CLI Help](https://help.obsidian.md/cli)
**Source:** [Kurtis Redux — Obsidian CLI: How the Command Line Will Change Note-Taking](https://kurtis-redux.medium.com/obsidian-cli-how-the-command-line-will-change-note-taking-26c90f03de17)

### CLI vs Direct Filesystem Access
- CLI routes writes through Obsidian's internal APIs → avoids file watcher race conditions
- Direct filesystem writes (e.g., Python script, Claude Code with filesystem MCP) bypass Obsidian's awareness → race condition risk
- CLI is the recommended path for agent-vault interaction

## MCP Servers for Obsidian (Third-Party)

### MCPVault
- Universal AI bridge for Obsidian vaults
- Version 0.11.0 (March 2026)
- Works with Claude, ChatGPT, future AI tools
- Routes operations through Obsidian's APIs

**Source:** [GitHub — bitbonsai/mcpvault](https://github.com/bitbonsai/mcpvault)

### Obsidian REST API Servers
- Multiple implementations (cyanheads, smith-and-web)
- Require Obsidian to be open (use Local REST API plugin)
- HTTP-based access to vault operations

**Source:** [GitHub — cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server)

## Claudian Plugin (Claude Code in Obsidian)

- Embeds Claude Code as sidebar chat in Obsidian
- Vault becomes Claude's working directory
- Full agentic capabilities: file read/write, search, bash commands
- Multi-step workflows within the vault

**Source:** [GitHub — YishenTu/claudian](https://github.com/YishenTu/claudian)

## Real-World Agentic Obsidian Workflows (2025-2026)

### Stefan Imhoff (Jan 2026)
- Uses Claude Code + Obsidian CLI for vault automation
- Creates skills, agents, and subagents for vault operations
- Extracts resources from notes (books, people, podcast episodes)

**Source:** [stefanimhoff.de — Agentic Note-Taking: Transforming My Obsidian Vault](https://www.stefanimhoff.de/agentic-note-taking-obsidian-claude-code/)

### Kenneth Reitz (Mar 2026)
- "A Second Brain That Thinks Back"
- Obsidian + Claude Code via MCP
- Live workspace that Claude can read, search, and modify

**Source:** [kennethreitz.org — Obsidian Vaults & Claude Code](https://kennethreitz.org/essays/2026-03-06-obsidian_vaults_and_claude_code)

## Karpathy Workflow Implications

| Aspect | Assessment |
|--------|-----------|
| Safe agent writes | Use Obsidian CLI or MCP servers — NOT direct filesystem writes |
| Simultaneous editing | High risk if agent writes while user edits same file |
| File watcher reliability | Inconsistent across subdirectories; CLI bypasses this |
| Agent attribution | Not built-in; must be encoded in commit messages or file metadata |
| Recommended architecture | Agent writes via CLI/MCP → auto-commit via Obsidian Git → human reviews diffs |
