# Evidence: Claude Desktop Project/Workspace Scope for MCP

**Dimension:** Does Claude Desktop (Chat + Cowork tabs) have ANY project-level or workspace-level MCP-config concept?
**Date:** 2026-04-18
**Sources:** support.claude.com, code.claude.com, modelcontextprotocol.io, github.com/anthropics/claude-code, github.com/modelcontextprotocol/mcpb

**Vendor-bias flag:** Anthropic is the vendor. All primary sources are Anthropic-authored.

---

## Bottom-line answer

**NO — Claude Desktop has no project-level MCP-config concept today.** HIGH confidence.

- **Claude Desktop "Projects" feature:** exists but is **chat / knowledge-base scoped only** (uploaded files, per-project instructions, chat history). **NOT MCP-config scoped.** No way to say "this MCP server belongs to this Project."
- **Cowork "workspaces":** exist as **filesystem folder mounts** (virtiofs) for VM access. **NOT MCP-config scoping.** MCP servers come from host `claude_desktop_config.json` regardless of which workspace folder is mounted.
- **`claude_desktop_config.json` schema:** no `cwd`, `workspaceFolder`, `projectRoot`, or `scope` fields on `mcpServers` entries. Host-global only.
- **MCP spawn cwd:** "undefined working directory (often `/` on macOS)." Claude Desktop explicitly does NOT inherit terminal cwd. MCP has no standardized way to discover user's workspace.

---

## Findings

### Finding 1: Claude "Projects" is chat/knowledge-base scoped, not MCP-config scoped
**Confidence:** CONFIRMED
**Evidence:** [support.claude.com/articles/9517075 — What are projects?](https://support.claude.com/en/articles/9517075-what-are-projects)

> "Projects allow you to create self-contained workspaces with their own chat histories and knowledge bases. Within each project, you can upload documents, provide context, and have focused chats with Claude."

Each project gets:
- Upload-based knowledge base (PDF, DOCX, CSV, TXT, HTML — up to 30MB/file)
- Per-project instructions that load on every conversation
- Chat history

**Projects do NOT include:**
- Per-project MCP server configuration
- Per-project `claude_desktop_config.json` override
- A way to associate an MCP server with a specific Project

**Implication:** When a user switches Projects in Claude Desktop Chat, MCP servers are the SAME across all Projects. `claude_desktop_config.json` is a single host-global file; Projects don't layer on top of it.

### Finding 2: Cowork workspaces are folder mounts, not MCP scopes
**Confidence:** CONFIRMED
**Evidence:** [support.claude.com/articles/13345190 — Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork), [github.com/anthropics/claude-code/issues/25163 — Allow folder selection mid-session](https://github.com/anthropics/claude-code/issues/25163)

> "With projects in Cowork, you can organize related tasks into persistent, self-contained workspaces with their own files, links, instructions, and memory. Workspace folders can be added by opening Claude Desktop, clicking the 'Cowork' menu, and selecting '+ Add Folder' to choose your working directory."

**Architecture:** Cowork runs Claude Code inside a Linux VM (Ubuntu 22.04) with user folders exposed via **virtiofs share mounted at `/mnt/.virtiofs-root/shared`**, re-exposed to the sandbox via FUSE. The workspace folder IS mounted inside the VM — that's where `ls` / `cat` / agent bash tools operate.

**But MCP servers come from host.** Per [support.claude.com/articles/10949351](https://support.claude.com/en/articles/10949351) + corroborated by dev.to/murat-a-a:

> "MCP servers from Claude Desktop are dynamically passed through to the VM... as `type: 'sdk'` — meaning Desktop proxies them transparently."

**Cowork does NOT read `.mcp.json` from the mounted workspace folder.** All MCP config originates from host `claude_desktop_config.json`. Switching Cowork workspace folders changes what the agent can read/write — does NOT change which MCPs are available.

**Implication:** Cowork's "project" concept (mounted folder) buys the agent filesystem context for file tools, but not for MCP routing. A host-side MCP bridged into Cowork has no awareness of which workspace folder is active.

### Finding 3: `claude_desktop_config.json` has no project-scoping fields
**Confidence:** CONFIRMED
**Evidence:** [modelcontextprotocol.io/docs/develop/connect-local-servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers), [support.claude.com/articles/10949351](https://support.claude.com/en/articles/10949351)

Schema is:
```json
{
  "mcpServers": {
    "<name>": {
      "command": "...",
      "args": [...],
      "env": {...}
    }
  }
}
```

No `cwd`, `workspaceFolder`, `projectRoot`, or `scope` fields. No way to bind an entry to a project directory.

### Finding 4: MCP spawn cwd is "undefined" / "often `/`"
**Confidence:** CONFIRMED
**Evidence:** [modelcontextprotocol/python-sdk#1520](https://github.com/modelcontextprotocol/python-sdk/issues/1520), [ran-bajra.medium.com — Fixing Failed to Spawn Process](https://ran-bajra.medium.com/fixing-the-failed-to-spawn-process-error-in-claude-desktop-mcp-da706adbb139)

> "Claude Desktop starts MCP servers from an undefined working directory (often `/` on macOS). Relative paths in args break silently, so you should use full absolute paths everywhere."

> "Claude Desktop does not inherit your Terminal's environment variables."

> "There appears to be no standardized way (via the SDK or protocol) to obtain the actual working directory of the Claude Code session. As a result, any file or project-level operation inside the MCP server loses context of the user's workspace."

**Implication:** `process.cwd()` inside a Claude-Desktop-spawned MCP is meaningless for project discovery. Our current MCP's `projectDir = process.cwd()` pattern CANNOT work when invoked from `claude_desktop_config.json`.

### Finding 5: MCPB `user_config` is user-level, not per-project dynamic routing
**Confidence:** CONFIRMED
**Evidence:** [MCPB MANIFEST.md](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [blog.modelcontextprotocol.io/posts/2025-11-20-adopting-mcpb](https://blog.modelcontextprotocol.io/posts/2025-11-20-adopting-mcpb/)

MCPB manifests support a `user_config` field that prompts the user for values (directory paths, API keys, etc.) at install time. Values are stored per-install via `${user_config.KEY}` interpolation — e.g., `${user_config.allowed_directories}` bakes a directory into the server's launch args.

**But this is STATIC PER-INSTALL, not dynamic per-project.** The user picks a directory (or set of directories) when installing the bundle. Every invocation of the bundled MCP sees the same configured paths. No mechanism for "route to this project when the user is in Project A vs Project B."

**Implication:** MCPB doesn't solve the project-routing problem — it defers it to install time (user picks one primary directory) which is Option A of our earlier analysis (pin via user-level config).

### Finding 6: No open Anthropic issue / roadmap item for project-scoped Claude Desktop MCP
**Confidence:** INFERRED (searched; not found)
**Evidence:** Searched `github.com/anthropics/claude-code` for issues mentioning "workspace"+"project"+"cwd" in Claude Desktop / Cowork context; found [#25163](https://github.com/anthropics/claude-code/issues/25163) (folder-selection mid-session — filesystem scope, not MCP scope), [#27697](https://github.com/anthropics/claude-code/issues/27697) (allow folder selection outside home — filesystem), [#30364](https://github.com/anthropics/claude-code/issues/30364) (silent file loss in Cowork — filesystem bug). **No issue found requesting project-scoped MCP config for Claude Desktop.**

**Implication:** Not on Anthropic's public roadmap. If it's planned internally, it's not signaled via issues.

---

## What this means for our spec

1. **`--project <abs-path>` baked in at install time (Option B) is the correct approach.** Claude Desktop provides no alternative — spawn cwd is undefined, config shape has no project field, MCPB `user_config` is per-install-static.

2. **There is no "defer to Claude Desktop's project system"** — the Projects feature doesn't extend to MCP config. We must solve project-routing ourselves via args or user-level config.

3. **Cowork workspace folder mount is useful for the agent's file tools** (bash ops against `/mnt/.virtiofs-root/shared`) but does NOT route MCP servers. Our host-side MCP wouldn't benefit from knowing which folder is mounted — it needs explicit project input.

4. **Multi-project Claude Desktop users** can be handled two ways in our installer:
   - **One entry, overwritten on re-init** (simplest): user runs `init` in their "current active project" — that's the one in Claude Desktop. If they switch, they re-run.
   - **Multiple entries with suffixed names** (Option B-multi): `open-knowledge-proj-a`, `open-knowledge-proj-b`. Each pinned to its project via `--project`. Claude Desktop shows all of them in the MCP list.

5. **MCPB path** (future work) could use `user_config.allowed_directories` to prompt the user for their project — but still one project per install, not dynamic routing.

---

## Negative searches / NOT FOUND

- Per-project MCP scoping in Claude Desktop Chat's Projects feature — not documented; Projects docs consistently scope to chats + knowledge base + instructions
- Any `.mcp.json` in Cowork's workspace folder being honored — not documented; docs consistently point back to `claude_desktop_config.json`
- Any `workspaceFolder` / `projectRoot` / `scope` field on `mcpServers` entries — no vendor docs mention such a field
- Any MCP spec RFC / issue on per-session or per-workspace MCP registration from a host-global client — nothing current

---

## Sources (all accessed 2026-04-18)

- [support.claude.com/articles/9517075 — What are projects?](https://support.claude.com/en/articles/9517075-what-are-projects)
- [support.claude.com/articles/10949351 — Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351)
- [support.claude.com/articles/13345190 — Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [modelcontextprotocol.io/docs/develop/connect-local-servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [github.com/anthropics/claude-code/issues/25163](https://github.com/anthropics/claude-code/issues/25163) — folder selection mid-session
- [github.com/anthropics/claude-code/issues/27697](https://github.com/anthropics/claude-code/issues/27697) — folders outside home
- [github.com/anthropics/claude-code/issues/30364](https://github.com/anthropics/claude-code/issues/30364) — Cowork file-loss
- [github.com/modelcontextprotocol/mcpb — MANIFEST.md](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
- [modelcontextprotocol/python-sdk#1520 — access cwd when MCP server launched](https://github.com/modelcontextprotocol/python-sdk/issues/1520)
- [ran-bajra.medium.com — Fixing Failed to Spawn Process in Claude Desktop MCP](https://ran-bajra.medium.com/fixing-the-failed-to-spawn-process-error-in-claude-desktop-mcp-da706adbb139)
- [claudecn.com/en/blog/claude-cowork-architecture](https://claudecn.com/en/blog/claude-cowork-architecture/) — Cowork VM architecture (community deep-dive)
- [dev.to/murat-a-a — Local MCPs in Cowork](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) — vendor-bias community source
- [pvieito.com/2026/01/inside-claude-cowork](https://pvieito.com/2026/01/inside-claude-cowork) — Cowork VM reverse engineering
- [blog.modelcontextprotocol.io/posts/2025-11-20-adopting-mcpb](https://blog.modelcontextprotocol.io/posts/2025-11-20-adopting-mcpb/)
