---
title: "Zero-Friction Onboarding & Multi-Project UX for Open Knowledge"
description: "How should open-knowledge implement developer onboarding (init, scaffolding), multi-project switching, and progressive agent context loading? Evidence from 20+ tools, MCP spec patterns, and cognitive load research."
createdAt: 2026-04-08
updatedAt: 2026-04-08
subjects:
  - Open Knowledge
  - Claude Code
  - Obsidian
  - Cursor
  - MCP
topics:
  - developer onboarding
  - multi-project UX
  - agent context loading
  - CLI scaffolding
---

# Zero-Friction Onboarding & Multi-Project UX for Open Knowledge

**Purpose:** Inform the implementation of Bucket 6 (STORIES.md) — specifically the `npx openknowledge init` experience, multi-project switching, `.openknowledge/` config shape, and how agents load KB context without overwhelming their context windows. A developer reading this report should be able to make grounded design decisions for each of these surfaces.

---

## Executive Summary

The central design tension for open-knowledge's UX is: **the tool must work in any directory a developer already has, not just greenfield projects** — while also acting as a universal knowledge substrate across all of a user's projects. No existing tool solves both problems together.

Research across 20+ developer tools, the MCP specification, and cognitive load research reveals three convergent patterns that should guide implementation:

**Key Findings:**

- **Additive init is the winning pattern.** Tools that add a single config directory to existing projects (Obsidian's `.obsidian/`, Cursor's `.cursor/`, Storybook's `.storybook/`) have the lowest adoption friction. Tools that scaffold entire project structures (Next.js, Docusaurus) work only for greenfield. Open-knowledge should follow the Obsidian model: `npx openknowledge init` adds `.openknowledge/` + `AGENTS.md` and treats existing markdown as content.

- **Project switching should be a context swap, not a server restart.** The MCP Roots protocol supports dynamic multi-root scoping without restarting the server. Combined with a lightweight project registry (~/.openknowledge/projects.json), this enables sub-1-second switching — the threshold where cognitive load research shows developers maintain flow.

- **Agents should orient via catalog files, not dump-all context.** Every mature agent context system (Claude Code's path-scoped rules, llms.txt's summary→full hierarchy, Karpathy's librarian pattern) converges on index-then-retrieve. The catalog file hierarchy (`_INDEX.md` at each level) is exactly this pattern. Root catalog under 200 lines; per-folder catalogs provide progressive depth.

**Critical Caveats:**
- The KB-in-existing-repo question (T6.8) directly affects init behavior. The sidecar pattern (subdir, parent's git) is the recommended default based on docs-as-code topology research, but standalone repo must remain an option.
- Multi-project switching UX is explicitly deferred in PROJECT.md. This report provides the architectural foundation so the decision doesn't paint the team into a corner.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|---|---|---|
| D1 | CLI init/scaffolding patterns in comparable tools | Deep | P0 |
| D2 | Multi-project / workspace switching UX | Deep | P0 |
| D3 | Agent context loading strategies (avoiding context bloat) | Deep | P0 |
| D4 | KB-in-existing-repo vs standalone repo patterns | Moderate | P0 |
| D5 | Project discovery & registry patterns | Moderate | P1 |
| D6 | MCP server multi-project routing | Moderate | P1 |

**Non-goals:** Publishing/deployment UX, permission model design (Bucket 5), editor component architecture (Bucket 1), specific MCP tool signatures (Bucket 2 XQ1).

---

## Detailed Findings

### D1: CLI Init/Scaffolding Patterns

**Finding:** Developer tools fall on a spectrum from "own the directory" to "add a config sidecar" — and the sidecar model has strictly lower adoption friction for existing projects.

**Evidence:** [evidence/cli-init-patterns.md](evidence/cli-init-patterns.md)

Eight tools compared across additive-init support, files created, and interactivity:

| Model | Examples | Init in existing repo? |
|-------|---------|----------------------|
| **Config sidecar** (hidden dir) | Obsidian (`.obsidian/`), Cursor (`.cursor/`), Storybook (`.storybook/`) | YES — zero disruption |
| **Single config + dep** | Turborepo (`turbo.json`), ESLint (`.eslintrc`) | YES — additive but manual |
| **Full project scaffold** | Next.js, Astro, Docusaurus, Fumadocs | NO — greenfield only |

The evolution from single file to config directory is universal: Cursor (`.cursorrules` → `.cursor/rules/*.mdc`), Mintlify (`mint.json` → `docs.json` with `$ref`), Claude Code (`CLAUDE.md` → `.claude/rules/*.md`). Starting with a directory avoids a migration later.

[Next.js](https://nextjs.org/docs/app/api-reference/cli/create-next-app) now scaffolds `AGENTS.md` alongside code — a signal that init is evolving to serve both human and AI consumers.

CLI best practices from [clig.dev](https://clig.dev/) and [Atlassian](https://www.atlassian.com/blog/it-teams/10-design-principles-for-delightful-clis): never require interactive input (always provide flag alternatives), provide `--yes`/`--dry-run`, suggest next commands after scaffolding.

**Implications:**

`npx openknowledge init` should:
1. Detect whether it's in an existing repo with existing markdown (additive) or empty directory (greenfield)
2. Create `.openknowledge/` config directory + `AGENTS.md` at the target root
3. NOT create a new `package.json`, `node_modules/`, or project scaffold
4. Work non-interactively with `--yes` flag; prompt for minimal choices otherwise
5. Complete in under 10 seconds (Obsidian is sub-second; 30s target per STORIES.md U6.1 is conservative)

**Decision triggers:**
- If the team decides KB needs its own `package.json` (for Hocuspocus deps), init should add it alongside existing `package.json` — not replace it
- If the team promotes S7 (skills alongside articles), init should scaffold a `skills/` directory

---

### D2: Multi-Project / Workspace Switching UX

**Finding:** Three discovery models exist (manual register, auto-history, account-based), and auto-discovery combined with a lightweight registry produces the best balance of low friction and intentional curation.

**Evidence:** [evidence/multi-project-switching.md](evidence/multi-project-switching.md)

| Tool | Discovery | Switch Speed | UX Pattern |
|------|-----------|-------------|------------|
| Obsidian | Manual register | 1-3s (new window) | Modal vault picker |
| VS Code | Auto from history | 1-2s (reload) | Cmd+R fuzzy search |
| Notion | Account-based | Near-instant | Sidebar dropdown |
| JetBrains | Auto from history | Instant (open projects) | Welcome screen + groups |
| Raycast/Alfred | Aggregates IDEs | <2s total | Global hotkey + fuzzy |

Cognitive load research establishes clear thresholds: 100ms feels instant, 1 second keeps attention, 10 seconds risks losing the user. Context switching costs developers an average of 9.5 minutes to return to productive flow ([Qatalog/Cornell study](https://www.uxmatters.com/mt/archives/2024/12/cognitive-distance-streamlining-context-switching-in-ux.php)). Notion's near-instant sidebar swap and VS Code's Cmd+R fuzzy search are the gold standard patterns.

Launcher tools (Raycast, Alfred) solve the "universal view" problem better than any individual tool by aggregating across multiple IDE registries into one fuzzy-searchable list.

**Implications:**

The recommended architecture for multi-project:

1. **Project registry:** `~/.openknowledge/projects.json` — auto-populated when `openknowledge init` or `openknowledge` runs. JSON format readable by launchers.
2. **Discovery:** `openknowledge list` scans the registry + optionally scans common paths for `.openknowledge/` markers. Frecency ordering (most-recently/frequently-used first).
3. **Switching UX (MVP):** `openknowledge open <name-or-path>` — if server is running, swap active root (context swap, not restart). If not, start server for that project.
4. **Switching UX (future):** In-editor project switcher (sidebar dropdown or command palette). Preserves open files and scroll positions per project.
5. **Architecture constraint:** Project switching MUST be a lightweight context swap (<1s), not a full server restart. This means the Hocuspocus server should support changing its document root at runtime.

**Decision triggers:**
- If the editor is always localhost (Now phase), switching = opening a different browser tab per project (one server per project is acceptable)
- If the editor becomes a persistent app (Next phase), a single server managing multiple roots via MCP Roots protocol becomes important

---

### D3: Agent Context Loading (Avoiding Context Bloat)

**Finding:** Every mature agent context system converges on tiered loading — minimal orientation upfront, detail loaded on demand via path-scoping or search. The index-then-retrieve pattern consistently outperforms dump-all approaches.

**Evidence:** [evidence/agent-context-loading.md](evidence/agent-context-loading.md)

The comparison reveals a clear design spectrum:

| Approach | Example | Trade-off |
|----------|---------|-----------|
| **Dump-all** | Codex AGENTS.md (32KB cap, all loaded) | Simple but wasteful; hard cap forces brevity |
| **Two-tier** | Cursor (alwaysApply + glob-scoped) | Good balance; most tools converge here |
| **Progressive hierarchy** | Claude Code (root + subdirectory + path-scoped rules) | Most flexible; highest implementation complexity |
| **Summary → detail** | llms.txt (summary + optional → full) | Explicit progressive disclosure; agent decides depth |

[JetBrains NeurIPS research](https://blog.jetbrains.com/research/2025/12/efficient-context-management/) provides the strongest empirical evidence: observation masking (rolling window) outperformed LLM summarization in 4/5 settings, and both reduced costs by 50%+ vs unmanaged baselines. Context elongation is actively harmful — more context does not mean better performance.

[Anthropic's context engineering guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) recommends finding the smallest possible set of high-signal tokens, using metadata-driven navigation, and sub-agent architectures (1,000-2,000 token summaries).

The [MCP instructions field](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/) improved GitHub MCP testing from 20% to 80% task success for GPT-4 Mini, but it's a single upfront string with no progressive disclosure.

**Implications:**

Open-knowledge's context loading should follow a three-tier model:

**Tier 1 — Always loaded (orientation):**
- `AGENTS.md` at KB root: navigation conventions, tool guidance, KB structure overview
- MCP `instructions` field: "read the root catalog first, then use search/grep, then read specific files"
- Target: under 200 lines / ~4K tokens combined

**Tier 2 — Loaded on directory access (progressive):**
- Per-folder `_INDEX.md` catalog files: title, description, and list of children with one-line summaries
- Loaded when agent `list_directory()` or navigates to that folder
- Each catalog: under 100 lines

**Tier 3 — Loaded on explicit request (on-demand):**
- Individual article content via `read_file()`
- Backlink/forward-link data via link-graph tools
- Full-text search results via `search_files()`

This mirrors the llms.txt pattern (summary → optional sections → full content) and Claude Code's path-scoped rules (root context always loaded, subdirectory context loaded on access).

**Decision triggers:**
- If the KB has <50 articles, Tier 1 could include a full file listing (still under token budget)
- If the KB has >500 articles, the root catalog should be a category-level summary, not a file listing
- The catalog generation pipeline (T2.5, `onStoreDocument` hook) is the mechanism for keeping Tier 2 current

---

### D4: KB-in-Existing-Repo vs Standalone Repo

**Finding:** The sidecar pattern (KB as a subdirectory in an existing code repo, using the parent's git) is the recommended default. Standalone repo should be supported but not the primary path.

**Evidence:** [evidence/kb-in-repo-patterns.md](evidence/kb-in-repo-patterns.md)

The [docs-as-code topologies taxonomy](https://passo.uno/docs-as-code-topologies/) identifies four patterns. Sidecar (same repo) is the universal starting point for content alongside code. Git submodules are universally disliked (seven documented pain points). Nested `.git` is an anti-pattern (creates broken gitlinks). Git worktrees are the emerging pattern for branch isolation.

The `.gitignore` convention is consistent across all tools: committed = source of truth, ignored = derived artifacts.

**Implications:**

The three supported configurations for T6.8 (KB-git-vs-parent-project):

| Config | When to use | `init` behavior |
|--------|-------------|-----------------|
| **Sidecar (default)** | KB is part of a code project | `init` in subdir creates `.openknowledge/` + `AGENTS.md`. Uses parent git. |
| **Root-level** | KB IS the project (standalone knowledge base) | `init` at root creates `.openknowledge/` + `AGENTS.md`. Optionally `git init` if no git. |
| **Monorepo package** | KB alongside apps in a monorepo | `init` in `packages/knowledge/` or `apps/docs/`. Uses monorepo git. |

**What gets committed vs ignored:**

```
.openknowledge/
  config.json          # COMMITTED — project settings
  permissions.yaml     # COMMITTED — permission model (Bucket 5)
  component-meta.ts    # COMMITTED — component overrides
  cache/               # IGNORED — backlinks, component cache, search index
    backlinks.json
    component-cache.json
  worktrees/           # IGNORED — draft branch worktrees
AGENTS.md              # COMMITTED — agent guidance
_INDEX.md              # COMMITTED — root catalog (useful for git readers too)
```

**Decision triggers:**
- If the team decides KB needs its own `package.json`, the sidecar pattern still works — many tools (Docusaurus, Storybook) add their own `package.json` alongside the parent's
- If worktree-based drafts are used (TQ22), the `.openknowledge/worktrees/` directory should be gitignored and listed in `.git/info/exclude`

---

### D5: Project Discovery & Registry Patterns

**Finding:** Auto-population from filesystem markers, stored in a platform-appropriate state directory, with frecency ordering, is the optimal pattern for a CLI-first tool.

**Evidence:** [evidence/discovery-and-mcp-routing.md](evidence/discovery-and-mcp-routing.md)

Every tool stores its project registry slightly differently, but the pattern is consistent:

| Tool | Format | Location | Registration |
|------|--------|----------|-------------|
| VS Code | SQLite | App Support dir | Auto on open |
| JetBrains | XML | App Support dir | Auto on open |
| Obsidian | JSON | App Support dir | Manual (GUI) |
| zoxide | Binary DB | XDG_DATA_HOME | Auto on `cd` |

**Implications:**

Recommended registry design:

```jsonc
// ~/.openknowledge/projects.json
{
  "version": 1,
  "projects": [
    {
      "path": "/Users/me/my-project/knowledge",
      "name": "my-project",        // derived from directory name or config
      "lastOpened": "2026-04-08T10:00:00Z",
      "openCount": 12,
      "type": "sidecar"            // sidecar | standalone | monorepo-package
    }
  ]
}
```

Location priority:
1. `~/.openknowledge/projects.json` (cross-platform, simple)
2. `$XDG_STATE_HOME/openknowledge/projects.json` (XDG-compliant on Linux)
3. `~/Library/Application Support/openknowledge/projects.json` (macOS-native)

For MVP, option 1 is sufficient. The `~/.openknowledge/` directory serves double duty as user-level config home and state directory.

---

### D6: MCP Server Multi-Project Routing

**Finding:** The MCP Roots protocol provides a built-in mechanism for dynamic project scoping. A single MCP server can serve multiple KBs without restart.

**Evidence:** [evidence/discovery-and-mcp-routing.md](evidence/discovery-and-mcp-routing.md)

Claude Code uses 3-scope MCP config: `.mcp.json` (project, committed), `~/.claude.json` (global), local scope. The filesystem MCP server supports multiple root directories as positional args, and the MCP Roots protocol allows clients to update scopes at runtime via `notifications/roots/list_changed`.

**Implications:**

**MVP (one server per project):**
```jsonc
// .mcp.json in project root
{
  "mcpServers": {
    "openknowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["openknowledge", "mcp", "--root", "."]
    }
  }
}
```

Agent connects, reads `AGENTS.md` + root `_INDEX.md`, navigates from there.

**Future (multi-project via single server):**
```jsonc
// ~/.claude.json (global MCP config)
{
  "mcpServers": {
    "openknowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["openknowledge", "mcp", "--multi"],
      "env": { "OK_REGISTRY": "~/.openknowledge/projects.json" }
    }
  }
}
```

The server reads the registry, exposes a `list_projects()` tool, and scopes all other tools to the active project root. Project switching via `switch_project(path)` tool or MCP Roots update.

**Decision triggers:**
- If Cursor's 40-tool cap is a concern, tool count per project should stay under 10 (the Bucket 2 M2' decision)
- If agents need cross-project queries ("find all articles about X across all my KBs"), the multi-project MCP server becomes essential

---

## Synthesis: The Recommended UX Flow

Combining findings across all six dimensions, here is the recommended end-to-end developer experience:

### Day 0: Init (existing project)

```bash
$ cd ~/my-project
$ npx openknowledge init

  Detected existing repo with 47 markdown files in docs/
  
  Created:
    .openknowledge/config.json    # project settings
    AGENTS.md                     # agent guidance (cross-agent compatible)
    docs/_INDEX.md                # root catalog (auto-generated from existing files)
  
  Added to .gitignore:
    .openknowledge/cache/
    .openknowledge/worktrees/
  
  Next steps:
    npx openknowledge              # start the editor
    Add to your MCP config:        # one-line agent connection
      claude mcp add openknowledge -- npx openknowledge mcp
```

Time: <10 seconds. Zero prompts with `--yes`. Existing content untouched.

### Day 0: Init (new KB)

```bash
$ mkdir research && cd research
$ npx openknowledge init --standalone

  Created new knowledge base:
    .openknowledge/config.json
    AGENTS.md
    _INDEX.md
    getting-started.md            # starter article
  
  Initialized git repository.
  
  Next steps:
    npx openknowledge              # start the editor
```

### Day 1+: Start editing

```bash
$ npx openknowledge
  
  Editor running at http://localhost:3000
  MCP server available for agent connections
```

### Multi-project switching

```bash
$ openknowledge list
  
  RECENT PROJECTS
  1. my-project          ~/my-project           (last: 2 hours ago)
  2. research            ~/research             (last: yesterday)
  3. work-docs           ~/work/docs            (last: 3 days ago)

$ openknowledge open research     # switches active project
```

### Agent experience (first connection)

```
Agent reads AGENTS.md → learns: "Read _INDEX.md first, then use search, then read specific files"
Agent reads _INDEX.md → sees: category-level summary with file counts and descriptions
Agent uses search_files("authentication") → gets: ranked results across KB
Agent reads specific article → gets: content + frontmatter + backlinks
```

Total upfront context: ~4K tokens (AGENTS.md + MCP instructions + root _INDEX.md). Everything else loaded on demand.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Empirical token budgets for catalog files:** The 200-line / 4K-token recommendation is based on analogies (CLAUDE.md, AGENTS.md, llms.txt) rather than empirical testing with open-knowledge's specific content shapes. Needs testing with real KBs of 10, 100, and 1000 articles.
- **Windows support:** Most evidence comes from macOS/Linux tools. Windows path conventions, `.openknowledge/` visibility in Explorer, and WSL interop need separate verification.

### Out of Scope (per Rubric)

- Permission model design (Bucket 5 — affects `init` defaults via PQ12)
- Editor component architecture (Bucket 1)
- Specific MCP tool signatures (Bucket 2 — XQ1 decision)
- Publishing/deployment UX (Later phase)

### Open Decisions This Report Informs

| Decision | Options | This report's evidence points to |
|----------|---------|----------------------------------|
| T6.8: KB git relationship | sidecar / standalone / worktree / submodule | **Sidecar as default**, standalone as option. Never submodules. |
| T6.6: `.openknowledge/` as namespace | Yes / alternative | **Yes** — consistent with Obsidian (`.obsidian/`), Cursor (`.cursor/`), Storybook (`.storybook/`) |
| T6.9: Starting dir convention | `init .` / `init <path>` / auto-detect | **Auto-detect** existing markdown, default to cwd |
| CC6: Catalog file naming | `llms.txt` / `_INDEX.md` / `CATALOGUE.md` | **`_INDEX.md`** — serves as both llms.txt-style summary and agent navigation aid |
| CC7: AGENTS.md content | Minimal / comprehensive | **Minimal orientation** (~100 lines) + per-folder catalogs for progressive depth |
| PQ23: Multi-project | One instance per project / switcher / workspace | **One instance per project (MVP)** with registry for switching; future: single multi-root server |

---

## References

### Evidence Files
- [evidence/cli-init-patterns.md](evidence/cli-init-patterns.md) — 8 tools compared for init/scaffolding patterns
- [evidence/multi-project-switching.md](evidence/multi-project-switching.md) — 9 tools + cognitive load research on project switching
- [evidence/agent-context-loading.md](evidence/agent-context-loading.md) — 7 agent systems + context engineering research
- [evidence/kb-in-repo-patterns.md](evidence/kb-in-repo-patterns.md) — 7 patterns for content-in-code-repos
- [evidence/discovery-and-mcp-routing.md](evidence/discovery-and-mcp-routing.md) — project registries + MCP multi-project routing

### External Sources
- [clig.dev](https://clig.dev/) — Command Line Interface Guidelines
- [llms.txt Specification](https://llmstxt.org/) — Progressive context disclosure for LLMs
- [AGENTS.md Specification](https://agents.md/) — Cross-agent project guidance (Linux Foundation)
- [MCP Lifecycle Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle) — Server init, roots, lifecycle
- [Anthropic - Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Agent context management best practices
- [JetBrains Research - Efficient Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/) — NeurIPS empirical findings on context strategies
- [Passo.uno - Docs-as-code topologies](https://passo.uno/docs-as-code-topologies/) — Four topology patterns for docs in repos
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) — Standard directory conventions
