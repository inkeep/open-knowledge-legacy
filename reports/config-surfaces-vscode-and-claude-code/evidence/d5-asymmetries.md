# Evidence: D5 — Asymmetries: What One Product Can Do That The Other Can't

**Dimension:** Surfaces, mechanisms, and per-scope features that exist in one product's topology and have no direct analog in the other.
**Date:** 2026-04-25
**Sources:** D2 + D3 evidence; cross-referenced with D4 equivalence table.

---

## Approach

Asymmetries fall into three categories:
1. **Scopes one has and the other doesn't** (e.g., per-language)
2. **Scope-aware mechanisms one has and the other doesn't** (e.g., first-party Settings Sync; CLI flags as a scope)
3. **Field categories one allows and the other doesn't** (e.g., hooks at the user-level settings file; per-language overrides for any setting; admin-locked MCP servers)

Each section below names the asymmetry, points to the evidence finding, and notes whether the absence is structural (the topology can't accommodate it) or just unbuilt (the topology *could* accommodate it but no surface exists).

---

## VS Code has, Claude Code doesn't

### A1. Per-language scoped overrides
**Evidence:** D2.9 — `[language-id]: { ... }` syntax + per-setting `language-overridable` scope tag + 4 of the 8 `inspect()` slots are language-suffixed
**Claude Code analog:** None. There is no `[python]: { permissions: { ... } }` or per-file-extension behavior modulator. Claude Code does not parameterize its config by file language.
**Type:** Structural. Claude Code's settings schema has no shape for per-language partitioning; adding it would require a parallel resolution path through the entire schema.
**When it matters:** When a developer wants different behavior in TypeScript files vs Markdown files (formatter, tab size, ruler, format-on-save). VS Code's `[typescript]: { editor.formatOnSave: true }` pattern is widely used.

### A2. Per-workspace-folder scope (multi-root)
**Evidence:** D2.5 — `.code-workspace` file plus per-folder `.vscode/settings.json` overriding workspace-level
**Claude Code analog:** None for settings.json. CLAUDE.md has a recursive parent-walk + lazy subdirectory load (D3.4), but it's a *concatenation* of context, not an *override* of config values.
**Type:** Structural. Claude Code is single-cwd-rooted; it has no concept of a workspace as a parent of multiple folders with their own override layer.
**When it matters:** A monorepo where the `frontend/` folder uses a different formatter from the `backend/` folder. VS Code: per-folder settings. Claude Code: not addressable.

### A3. First-party multi-machine cloud sync
**Evidence:** D2.11 — Settings Sync via Microsoft/GitHub account, fixed 7-category bundle, opt-in
**Claude Code analog:** None. Users who want their `~/.claude/` to follow them across machines must dotfile-sync it themselves (chezmoi, GNU Stow, plain git in `~`).
**Type:** Unbuilt. The Claude Code topology could accommodate sync; there's just no first-party product.
**When it matters:** A developer who hops between a desktop, a laptop, and a remote dev box wants `~/.claude/settings.json` and `~/.claude/agents/` everywhere. VS Code: log into Microsoft account, done. Claude Code: roll your own.

### A4. Per-setting machine-scope sync exclusion
**Evidence:** D2.11 — `machine` and `machine-overridable` scope tags + `settingsSync.ignoredSettings`
**Claude Code analog:** None. There is no per-setting "this is per-machine, don't sync me" tag because there is no first-party sync.
**Type:** Follows from A3.
**When it matters:** A developer wants their global formatter rules to sync but their local plugin paths (which differ per machine) to stay put. VS Code: scope tag does it automatically. Claude Code: split files manually.

### A5. Profiles (named bundles of configuration)
**Evidence:** D2.12 — `.code-profile` files; profile contains settings + keybindings + snippets + tasks + extensions + UI state + MCP servers; per-workspace binding
**Claude Code analog:** None. Closest is `CLAUDE_CONFIG_DIR` env var to relocate `~/.claude/`, but that's a single env-var swap, not a UI-managed multi-profile system with per-workspace association.
**Type:** Unbuilt. Claude Code's topology could support profiles by the same `CLAUDE_CONFIG_DIR` mechanism, but there's no UI for managing them, no per-workspace binding, no import/export format.
**When it matters:** A developer who works on a Python project with one set of skills/MCP servers and a TypeScript project with a different set wants those swapped automatically when opening each. VS Code: per-workspace Profile. Claude Code: manually point `CLAUDE_CONFIG_DIR` somewhere different.

### A6. Snippets, Tasks, Debug configurations as first-class config categories
**Evidence:** D2.7 — `.vscode/launch.json`, `tasks.json`, `*.code-snippets`; user-level equivalents
**Claude Code analog:** None per category. Closest analogs (skills/commands for parameterized text; hooks for event-driven shell; nothing for debug) are different mechanisms with different semantics.
**Type:** Domain-specific. These are editor-feature categories; Claude Code is not an editor.
**When it matters:** A team's project ships with `.vscode/launch.json` so anyone can press F5 and debug. Claude Code has no analog because there's no debugger.

### A7. Recommended extensions surface
**Evidence:** D2.7 — `.vscode/extensions.json` `recommendations[]`
**Claude Code analog:** None. Project `.mcp.json` declares servers that are *invoked*, not recommended for install. There's no "you should install these skills/agents/plugins" project surface.
**Type:** Unbuilt.
**When it matters:** A team wants a new contributor to be prompted "install these MCP servers" on first clone. VS Code: extensions.json prompts. Claude Code: README + manual setup.

### A8. UI ↔ JSON dual surface for the bulk of settings
**Evidence:** D2.10 — `ConfigurationEditingService` + structurally-synced Settings UI
**Claude Code analog:** Partial. `/permissions`, `/memory`, `/agents`, `/mcp`, `/model`, `/statusline` cover *parts* of the surface, but no unified "Settings UI" exists; `/config` survives only as a credential toggle (D3.12).
**Type:** Unbuilt. Claude Code's CLI nature makes a full TUI Settings editor nontrivial, but the per-concern slash commands are growing.
**When it matters:** A user who doesn't want to write JSON wants to find and toggle a setting. VS Code: Cmd+K → search → click. Claude Code: hand-edit `settings.json` (or use a per-concern slash command for a covered subset).

---

## Claude Code has, VS Code doesn't

### B1. Project-local override that's structurally separate from the committed file
**Evidence:** D3.1 — `.claude/settings.local.json` is a separate file gitignored by convention; sits *above* project settings in precedence
**VS Code analog:** Structurally different. To override workspace settings without committing, a VS Code user either (a) edits `.vscode/settings.json` and unstages, (b) creates a per-workspace Profile (heavyweight), or (c) sets at User level (which then leaks to other workspaces). None of these is "this project, this developer, not committed."
**Type:** Structural. VS Code's scope ladder doesn't have a layer between Workspace and User that says "my override of this Workspace, just for me."
**When it matters:** A developer wants to allow `Bash(curl *)` only on this project, only for themselves, not pushed to teammates. Claude Code: add to `settings.local.json`. VS Code: edit `.vscode/settings.json` and unstage (fragile) or set at User (leaks to other projects).

### B2. Text-as-context: CLAUDE.md hierarchy
**Evidence:** D3.4 — Managed/Project/User/Local CLAUDE.md, concatenated (not overridden), recursive parent-walk, `@import` syntax with depth-5 limit
**VS Code analog:** None. There is no "long-form instructions injected at session start, scoped per-project" category in VS Code. Comments in `settings.json` survive structurally but they're metadata for humans reading the JSON, not instructions to a runtime.
**Type:** Structural. VS Code has no LLM-runtime to inject context into; the category doesn't apply.
**When it matters:** A team wants "always use camelCase, never snake_case, our linter is configured per X" loaded into every Claude Code session in this repo without re-stating it. Claude Code: `CLAUDE.md`. VS Code: there's nothing to inject context into.

### B3. Permissions DSL (granular per-tool gating in settings)
**Evidence:** D3.5 — `permissions.allow`/`ask`/`deny` arrays with `Bash(specifier)`, `Read(path)`, `mcp__server__tool`, `Skill(name)`, `Agent(name)` patterns
**VS Code analog:** Workspace Trust (binary trust per folder); no granular per-tool gating in settings. Extensions declare required capabilities at install time, not at config-time.
**Type:** Structural. VS Code's threat model is "is this folder trusted?"; Claude Code's is "exactly which actions can the agent take?"
**When it matters:** A user wants to allow `Bash(npm:*)` but deny `Bash(curl:*)` and require approval for `Bash(rm:*)`. Claude Code: that's the permissions DSL. VS Code: there's no equivalent (you'd need an extension to gate execution).

### B4. Hooks declared in settings (no extension code required)
**Evidence:** D3.6 — `hooks` block in any settings layer; event taxonomy spans 30+ events; handler types include `command`, `http`, `mcp_tool`, `prompt`, `agent`
**VS Code analog:** Extensions can subscribe to events programmatically via the Extension API; not a user-authored settings construct. Closest user-facing is `tasks.json` with `runOptions.runOn: "folderOpen"`.
**Type:** Structural. VS Code doesn't expose its event bus to settings-file declarations; you must write an extension.
**When it matters:** A team wants a project-level hook to run `bun run check` after every Edit. Claude Code: `hooks` block in `.claude/settings.json`. VS Code: write an extension.

### B5. Managed/admin-locked field categories specific to agent-trust
**Evidence:** D3.3 — 18+ managed-only fields including `allowedMcpServers`, `allowManagedMcpServersOnly`, `allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`
**VS Code analog:** Per-setting `policy` opt-in for any registered setting; less category-specific. There's no first-class "admin lockdown of MCP servers" category.
**Type:** Differing surface area. Claude Code has a richer admin DSL because the agent-trust threat model is more elaborate.
**When it matters:** Enterprise IT wants to ensure no developer can add an MCP server outside an approved allowlist. Claude Code: managed `allowedMcpServers` + `allowManagedMcpServersOnly: true`. VS Code: requires per-setting policy declarations.

### B6. CLI flags as a first-class scope in the precedence chain
**Evidence:** D3.11 — `--model`, `--permission-mode`, `--allowedTools`, `--mcp-config`, `--strict-mcp-config`, `--bare`, `--setting-sources`, `--add-dir`, `--system-prompt`, etc.
**VS Code analog:** Limited. `--user-data-dir`, `--profile`, `--disable-extensions` are diagnostic; not a first-class config layer that overrides settings on a per-flag basis.
**Type:** Structural — Claude Code is also a programmatic harness called from scripts (CI, agents, SDK), so CLI flags must be a first-class layer.
**When it matters:** A CI script wants to run Claude Code with a specific model and tool subset for one invocation. Claude Code: pass flags. VS Code: there's nothing to "run for one invocation" — VS Code is an interactive editor.

### B7. `--bare` / `--setting-sources` master mute switches
**Evidence:** D3.11 — `--bare` skips auto-discovery of hooks, skills, plugins, MCP, auto memory, CLAUDE.md; `--setting-sources` allows comma-list of `{user, project, local}` to load
**VS Code analog:** `--disable-extensions` is the closest analog but it's a single binary switch, not a granular scope-source selector.
**Type:** Structural — exists because Claude Code is invoked programmatically and needs to disable filesystem auto-discovery.
**When it matters:** A test harness wants to invoke Claude Code with no auto-loaded skills/agents/MCP. Claude Code: `--bare`. VS Code: heavy lift (custom user-data-dir + disable-extensions).

### B8. Subagents as a configuration scope
**Evidence:** D3.7 — `.claude/agents/` and `~/.claude/agents/` markdown files with frontmatter; per-agent `permissionMode`, `mcpServers`, `tools`, `memory`, `isolation`
**VS Code analog:** None. Closest is "tasks" but those are shell commands.
**Type:** Structural. Subagents are LLM-prompted entities; VS Code has no LLM-prompted entity to configure.
**When it matters:** A team defines a "code-reviewer" subagent with restricted tools and a specific permission mode. Claude Code: `.claude/agents/code-reviewer.md`. VS Code: not a thing.

### B9. Array merge across scopes
**Evidence:** D3.2 — array values concatenate and deduplicate across scopes
**VS Code analog:** Arrays in VS Code *override*. Object-typed values merge (D2.2), but arrays are pure override.
**Type:** Semantic. Same key + same value-type behaves differently in the two products.
**When it matters:** Project-level `permissions.deny` adds to user-level `permissions.deny` (Claude Code) versus replacing it (VS Code). The Claude Code behavior is critical for the security model — no scope can subtract from a higher-priority deny array.

---

## Where the asymmetries cluster

Plotting the asymmetries by domain makes the design intent visible:

| Domain | VS Code-richer | Claude Code-richer |
|---|---|---|
| Editor features (per-language, per-folder, snippets, tasks, debug) | ✓ | — |
| Sync infrastructure (cloud sync, machine-scope tags, profiles) | ✓ | — |
| UI surface (Settings UI, dual-surface) | ✓ | — |
| Project-local-personal layer (developer override of project) | — | ✓ |
| Text-as-context (CLAUDE.md hierarchy) | — | ✓ |
| Agent-trust DSL (permissions, hooks, managed-MCP) | — | ✓ |
| Programmatic CLI (flags as first-class scope, mute switches) | — | ✓ |
| Markdown-defined entities (commands/skills/agents) | — | ✓ |

The clustering reflects what each product *is*: VS Code is a mature human-interactive editor that's been growing for a decade and a half along editor-feature axes; Claude Code is a 2-year-old programmatic agent harness that's grown along agent-trust and CLI axes. Neither has built much in the other's lane because the use cases don't overlap — VS Code doesn't need to gate `Bash(curl:*)` because it doesn't run shell commands as a primary workflow; Claude Code doesn't need per-language tab settings because it doesn't render files for human editing.
