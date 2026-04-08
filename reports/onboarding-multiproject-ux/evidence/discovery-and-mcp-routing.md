# Evidence: Project Discovery & MCP Multi-Project Routing

**Dimension:** D5 — Project discovery & registry patterns; D6 — MCP server multi-project routing
**Date:** 2026-04-08
**Sources:** VS Code/JetBrains/Obsidian storage docs, XDG spec, Claude Code MCP docs, Cursor MCP docs, MCP spec, filesystem MCP server docs

---

## Key files / pages referenced

- [VS Code Extension Storage](https://medium.com/@krithikanithyanandam/vs-code-extension-storage-explained-the-what-where-and-how-3a0846a632ea)
- [Obsidian - How Obsidian stores data](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data)
- [XDG Base Directory Spec](https://specifications.freedesktop.org/basedir/latest/)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Cursor MCP docs](https://cursor.com/docs/context/mcp)
- [Filesystem MCP Server README](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md)
- [MCP Lifecycle Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle)

---

## Findings

### Finding: Claude Code uses 3-scope MCP config: project-shared, user-global, per-project-local
**Confidence:** CONFIRMED
**Evidence:** `.mcp.json` (project root, committed), `~/.claude.json` (user global), local scope via `claude mcp add --scope local`. Precedence: project-specific > user local > user global.

**Implications:** Open-knowledge's MCP config should follow this pattern. A project `.mcp.json` entry lets any team member's agent connect. A user-global entry lets the user connect to any KB.

### Finding: MCP Roots protocol enables dynamic multi-project scoping without server restart
**Confidence:** CONFIRMED
**Evidence:** MCP spec: clients declare roots via `roots/list` at initialization. `notifications/roots/list_changed` updates scopes at runtime. When roots are provided by client, they replace command-line directories. The filesystem MCP server supports multiple directory paths as positional args.

**Implications:** A single open-knowledge MCP server could serve multiple KBs by accepting roots dynamically. Project switching = updating roots, not restarting the server.

### Finding: Project identity in MCP is implicit (cwd/roots), not explicit (no project ID)
**Confidence:** CONFIRMED
**Evidence:** No standardized "project ID" or "project name" in MCP. Identity communicated through roots (filesystem paths). Claude Code and Cursor both use cwd to determine project context.

**Implications:** Open-knowledge should use the `.openknowledge/` directory path as the implicit project identifier. The MCP server's `instructions` field should reference the project by its root path.

### Finding: One server per project is the current norm, but multi-root is architecturally supported
**Confidence:** CONFIRMED
**Evidence:** Current pattern: each project's `.mcp.json` spawns its own server instances. But MCP Roots protocol and filesystem MCP server both support multiple roots. MCP Router/Gateway pattern (Apigene, etc.) handles tool namespacing across multiple backend servers.

**Implications:** MVP can use one-server-per-project (simplest). Future: a single long-lived MCP server managing multiple KBs via roots, with project context in each tool response.

### Finding: XDG_STATE_HOME is the right location for a project registry
**Confidence:** CONFIRMED
**Evidence:** XDG spec: `XDG_STATE_HOME` (~/.local/state) is for data that persists across restarts but isn't portable. Recent project lists, frecency scores, session state are textbook STATE_HOME use cases. macOS convention: `~/Library/Application Support/<app>/`.

**Implications:** Project registry at `~/.local/state/openknowledge/projects.json` (Linux) or `~/Library/Application Support/openknowledge/projects.json` (macOS). Cross-platform: fall back to `~/.openknowledge/projects.json`.

### Finding: Auto-population from filesystem markers is the best discovery model for CLI tools
**Confidence:** CONFIRMED
**Evidence:** zoxide auto-tracks every `cd` (frecency). ghq uses filesystem-as-registry (`~/.ghq/<host>/<owner>/<repo>`). Projectile auto-detects via `.git` markers. VS Code auto-records every opened folder. Manual-only registration (Obsidian, Warp) is higher friction.

**Implications:** `npx openknowledge` should auto-register the current directory. `openknowledge list` should scan known locations and show all discovered KBs. Frecency ordering for `openknowledge open`.

---

## Gaps / follow-ups

- Should the MCP server expose a `switch_project(path)` tool, or should project switching be entirely client-side?
- How should the registry handle KBs on external/network drives?
