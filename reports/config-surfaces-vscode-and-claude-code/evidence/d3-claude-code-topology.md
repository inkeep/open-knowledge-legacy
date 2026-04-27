# Evidence: D3 — Claude Code Scope Topology

**Dimension:** Full per-scope topology of Claude Code's configuration system
**Date:** 2026-04-25
**Sources:** code.claude.com/docs/en/{settings,memory,permissions,hooks,cli-reference,skills,sub-agents,mcp,statusline,authentication}; prior report `~/.claude/reports/claude-code-configuration-resolution/REPORT.md` (2026-03-28, depth on MCP/skills/agents resolution)

---

## Key files / pages referenced

- `https://code.claude.com/docs/en/settings` — settings.json reference, precedence, per-field "Valid Scopes" column, "Managed-Only Fields" section
- `https://code.claude.com/docs/en/memory` — CLAUDE.md hierarchy, recursive parent-walk, `@imports`, `/memory`
- `https://code.claude.com/docs/en/permissions` — permissions block, modes, deny-first, `/permissions`
- `https://code.claude.com/docs/en/hooks` — event taxonomy, matchers, handler types, source labels
- `https://code.claude.com/docs/en/cli-reference` — CLI flag inventory, settings overrides, `--bare`, `--setting-sources`
- `https://code.claude.com/docs/en/skills` — skills + commands merger, scope hierarchy
- `https://code.claude.com/docs/en/sub-agents` — subagent frontmatter, persistent memory, `permissionMode`, `mcpServers`
- `https://code.claude.com/docs/en/mcp` — MCP install scopes, `--scope` flag (renamed from `project`/`global`)
- `https://code.claude.com/docs/en/statusline` — statusLine configuration
- `https://code.claude.com/docs/en/authentication` — credential precedence (independent of `env` block)
- `~/.claude/reports/claude-code-configuration-resolution/REPORT.md` (2026-03-28) — prior depth on MCP/skills/agents

---

## Findings

### Finding D3.1: settings.json has a 5-position precedence chain; CLI flags sit between Managed and Local
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/settings` (verified via direct WebFetch 2026-04-25)

```text
When the same setting is configured in multiple scopes, more specific scopes take precedence:

1. Managed (highest) - can't be overridden by anything
2. Command line arguments - temporary session overrides
3. Local - overrides project and user settings
4. Project - overrides user settings
5. User (lowest) - applies when nothing else specifies the setting
```

OS-specific managed paths: macOS `/Library/Application Support/ClaudeCode/managed-settings.json`; Linux/WSL `/etc/claude-code/managed-settings.json`; Windows `C:\Program Files\ClaudeCode\managed-settings.json`. There is also a drop-in directory (`managed-settings.d/*.json`), an MDM plist domain `com.anthropic.claudecode` on macOS, and Windows registry policy at `HKLM\SOFTWARE\Policies\ClaudeCode`.

**Implication:** Local (gitignored) sits *above* Project (committed) — an individual contributor's `.claude/settings.local.json` allow rule can defeat a team-shared project deny rule. Managed is the only true ceiling.

### Finding D3.2: Array settings merge across scopes (concatenated + deduplicated), not overridden
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/settings` (direct WebFetch 2026-04-25)

```text
Array settings merge across scopes. When the same array-valued setting (such as
sandbox.filesystem.allowWrite or permissions.allow) appears in multiple scopes,
the arrays are concatenated and deduplicated, not replaced. This means
lower-priority scopes can add entries without overriding those set by
higher-priority scopes, and vice versa.

Example:
managed: allowWrite: ["/opt/company-tools"]
user:    allowWrite: ["~/.kube"]
result:  ["/opt/company-tools", "~/.kube"]
```

**Implication:** This is a key architectural difference from VS Code (where arrays *override*). Lower-priority scopes additively contribute — no scope can subtract from a higher-priority array. For a denial array (`permissions.deny`), this means *every* scope's denials apply.

### Finding D3.3: 18+ "Managed-only" fields exist; an additional 9 fields are project-disallowed for security
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/settings` "Managed-Only Fields" section + per-field "Valid Scopes" column (verified via direct WebFetch 2026-04-25)

```text
Managed-only (function only in managed settings; ignored elsewhere):
- allowManagedPermissionRulesOnly
- allowManagedHooksOnly
- allowManagedMcpServersOnly
- allowedMcpServers / deniedMcpServers
- strictKnownMarketplaces / blockedMarketplaces
- allowedChannelPlugins / channelsEnabled
- pluginTrustMessage
- forceLoginMethod / forceLoginOrgUUID / forceRemoteSettingsRefresh
- sandbox.failIfUnavailable
- sandbox.filesystem.allowManagedReadPathsOnly
- sandbox.network.allowManagedDomainsOnly
- disableSkillShellExecution
- wslInheritsWindowsSettings
- allowedHttpHookUrls
```

A separate "User, Local, Managed" only set (project-disallowed): `apiKeyHelper`, `awsCredentialExport`, `awsAuthRefresh`, `otelHeadersHelper`, `permissions.skipDangerousModePermissionPrompt`, `autoMode`, `useAutoModeDuringPlan`, `autoMemoryDirectory`, `sshConfigs`. The rationale for excluding project scope is documented for `autoMemoryDirectory`:

```text
"It is not accepted from project settings (.claude/settings.json) to prevent
a shared project from redirecting auto memory writes to sensitive locations"
```

**Implication:** Field validity is enforced asymmetrically — high-trust fields (credential helpers, auto-memory redirection) are excluded from project (committed) scope to prevent supply-chain-style attacks via PRs. VS Code does not have an equivalent threat model.

### Finding D3.4: CLAUDE.md hierarchy has 4 scopes that *concatenate* (not override), with recursive parent-walk and lazy subdirectory loading
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/memory`

```text
Scope hierarchy:
- Managed policy CLAUDE.md  (e.g. /Library/Application Support/ClaudeCode/CLAUDE.md)
- Project instructions      (./CLAUDE.md or ./.claude/CLAUDE.md)
- User instructions         (~/.claude/CLAUDE.md)
- Local instructions        (./CLAUDE.local.md, gitignored)

"All discovered files are concatenated into context rather than overriding each other.
 Within each directory, CLAUDE.local.md is appended after CLAUDE.md..."

"Claude Code reads CLAUDE.md files by walking up the directory tree from your current
 working directory, checking each directory along the way..."

"Claude also discovers CLAUDE.md and CLAUDE.local.md files in subdirectories under
 your current working directory. Instead of loading them at launch, they are included
 when Claude reads files in those subdirectories."
```

Imports use `@path/to/file` syntax with max depth 5 hops; both relative and absolute paths permitted; relative paths resolve relative to the importing file. First time an external import appears in a project, Claude prompts for approval. Nested-subdirectory CLAUDE.md does *not* survive `/compact`; only the project-root CLAUDE.md is re-injected after compaction. A `claudeMdExcludes` array (any settings layer) skips ancestor CLAUDE.md files by absolute-path glob — except managed policy CLAUDE.md which cannot be excluded.

**Implication:** Unlike settings.json (override semantics with array-merge), CLAUDE.md is purely additive — every layer's content all enters context. This is "instructions-as-context," not "instructions-as-config." VS Code has no analog.

### Finding D3.5: Permissions use deny > ask > allow ordering within a scope; cross-scope follows settings precedence (so local-allow can defeat project-deny)
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/permissions`

```text
Within a scope:
"Rules are evaluated in order: deny -> ask -> allow.
 The first matching rule wins, so deny rules always take precedence."

Across scopes (settings precedence):
"If you have file in user settings allow Bash(curl *), but the project settings
 deny it ... add the allow rule to .claude/settings.local.json instead. Local
 scope (priority 3) beats project scope (priority 4), so your local allow
 overrides the project deny."

Hard floor (managed):
"a managed settings deny cannot be overridden by --allowedTools, and
 --disallowedTools can add restrictions beyond what managed settings define."
```

Permission rule syntax: `Tool` or `Tool(specifier)` — `Bash(npm run *)`, `Read(./.env)`, `WebFetch(domain:example.com)`, `mcp__puppeteer__*`, `Agent(Explore)`, `Skill(name)`. Read/Edit follow gitignore semantics with four prefix forms: `//absolute`, `~/home`, `/project-root`, `./cwd`. Symlinks are checked against both link and target paths.

Permission modes (`permissions.defaultMode`): `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`. `/permissions` is a UI surface listing rules with source files. Managed-only `allowManagedPermissionRulesOnly: true` blocks user/project from defining `allow`/`ask`/`deny`.

**Implication:** Two precedence axes interact: (1) within-scope deny>ask>allow; (2) cross-scope managed>CLI>local>project>user (with array-merging from D3.2). The cross-scope rule cuts both directions — a project deny *can* be overridden by a local allow. Plus arrays merge (D3.2), so `deny` rules from every scope all apply. Net: hardest to escape are managed denies; easiest is anything local can allow.

### Finding D3.6: Hooks valid in 6 scope locations including managed; settings layer source is *labeled* on hook output; admin lockdown via `allowManagedHooksOnly`
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/hooks`; `code.claude.com/docs/en/settings`

```text
| Location                              | Scope                                |
| ~/.claude/settings.json               | All your projects (user-level)       |
| .claude/settings.json                 | Single project (committed)           |
| .claude/settings.local.json           | Single project (gitignored)          |
| Managed policy settings               | Organization-wide                    |
| Plugin hooks/hooks.json               | When plugin enabled                  |
| Skill/agent frontmatter               | While component active               |

Resolution order: Managed -> user -> project -> local -> plugin -> skill/agent

Hook source labels (shown in permission decisions):
[User] [Project] [Local] [Plugin] [Session] [Built-in]

Admin lockdown:
"allowManagedHooksOnly": true  -> blocks user/project/non-force-enabled-plugin
                                  hooks; only managed + SDK + force-enabled-plugin
                                  hooks load.

"disableAllHooks": true        -> disables all hooks; respects hierarchy:
                                  user-level disableAllHooks cannot disable
                                  managed hooks.
```

There is **no per-hook approval prompt** — hooks from settings files run immediately without confirmation. Trust comes from the scope of origin (project hooks vetted via `git diff` review; managed hooks IT-controlled). Compare with `@import` external-file CLAUDE.md prompt — hooks intentionally do not have that gate.

Event taxonomy: session-level (`SessionStart`, `SessionEnd`, `InstructionsLoaded`); per-turn (`UserPromptSubmit`, `Stop`); tool execution (`PreToolUse`, `PostToolUse`, `PermissionRequest`); agent lifecycle (`SubagentStart`, `TaskCreated`); environment (`ConfigChange`, `CwdChanged`, `FileChanged`); compaction (`PreCompact`, `PostCompact`); MCP elicitation; worktree events. Handler types: `command` (default), `http`, `mcp_tool`, `prompt`, `agent`. HTTP hooks gate egress via `allowedHttpHookUrls` allowlist.

**Implication:** Project-level hooks in `.claude/settings.json` run without an "approve this hook?" prompt — provenance preserved via labels but no consent gate. `allowManagedHooksOnly` is the enterprise off-switch. Meaningful asymmetry against VS Code (no concept of hooks at the settings layer).

### Finding D3.7: Subagents (`.claude/agents/`, `~/.claude/agents/`) have rich frontmatter that creates a scope-inside-a-scope
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/sub-agents`

```text
Frontmatter fields:
- name (required)         - description (required)
- tools                   - disallowedTools
- model (sonnet|opus|haiku|<full-id>|inherit; default inherit)
- permissionMode (default|acceptEdits|auto|dontAsk|bypassPermissions|plan)
- maxTurns                - skills (preloaded into subagent context)
- mcpServers (server-name reference OR inline definition)
- hooks (subagent-lifecycle scoped)
- memory (user|project|local — enables persistent cross-session memory)
- background (true => always run as background task)
- effort (low|medium|high|xhigh|max)
- isolation (worktree => run in temp git worktree)
- color                   - initialPrompt
```

Scope precedence: SDK `agents` > CLI `--agents` > project `.claude/agents/` > user `~/.claude/agents/` > plugin agents.

**Deltas since 2026-03-28 prior report:** `permissionMode` is now an explicit subagent frontmatter field; `mcpServers` accepts inline definitions; `memory` field enables persistent cross-session memory; `background: true`; `isolation: worktree`; `color`, `initialPrompt`, `effort`. Plugin-agent restrictions still hold: `hooks`, `mcpServers`, `permissionMode` are silently ignored on plugin-sourced agents.

**Implication:** Subagents are essentially configurable mini-Claude-Code instances whose configuration lives in the agent's markdown frontmatter alongside settings.json. Per-agent `permissionMode` and `mcpServers` blocks duplicate settings.json shape *inside* the agent's frontmatter — the scope topology is recursive.

### Finding D3.8: Custom slash commands have been merged into Skills; `.claude/commands/` is now a legacy alias
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/skills`

```text
"Custom commands have been merged into skills. A file at .claude/commands/deploy.md
 and a skill at .claude/skills/deploy/SKILL.md both create /deploy and work the same way.
 Your existing .claude/commands/ files keep working. Skills add optional features:
 a directory for supporting files, frontmatter to control whether you or Claude
 invokes them, and the ability for Claude to load them automatically when relevant."

"if a skill and a command share the same name, the skill takes precedence."

Scope hierarchy (skills/commands):
| Location   | Path                                       | Applies to                |
| Enterprise | managed settings                           | All users in org          |
| Personal   | ~/.claude/skills/<name>/SKILL.md           | All your projects         |
| Project    | .claude/skills/<name>/SKILL.md             | This project              |
| Plugin     | <plugin>/skills/<name>/SKILL.md            | Where plugin enabled      |

"When skills share the same name across levels, enterprise overrides personal,
 and personal overrides project."

Plugin skills use plugin-name:skill-name namespace, so they cannot conflict.
```

Custom slash commands now use the same frontmatter shape as skills with flags `disable-model-invocation` and `user-invocable` to control whether Claude or the user can trigger.

**Implication:** This is the most significant change since the prior 2026-03-28 report. The split between `.claude/commands/` and `.claude/skills/` — historically a clean separation between user-invoked commands and Claude-invoked skills — has collapsed into a single skills surface controlled by frontmatter flags.

### Finding D3.9: MCP servers can be defined in 7 surfaces; `.mcp.json` is a separate file from settings.json with its own trust gate
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/mcp`; `code.claude.com/docs/en/settings`; prior 2026-03-28 report

```text
MCP scope ladder:
1. Managed/enterprise (allowedMcpServers, deniedMcpServers, allowManagedMcpServersOnly)
2. CLI flags (--mcp-config, --mcp-server, --strict-mcp-config)
3. Local settings (.claude/settings.local.json with mcpServers)
4. Project settings (.claude/settings.json with mcpServers)
5. User settings (~/.claude/settings.json with mcpServers)
6. claude.ai connectors (web-managed; toggled via ENABLE_CLAUDEAI_MCP_SERVERS env)
7. Plugin .mcp.json (lowest priority; namespaced)

Project .mcp.json (committed, separate from settings.json) trust controls:
- enableAllProjectMcpServers: bool (auto-approve all)
- enabledMcpjsonServers: string[] (allowlist by name)
- disabledMcpjsonServers: string[] (denylist by name)

CLI scope flag at install time:
"--scope local"   (default; current project only, gitignored) [renamed from "project"]
"--scope project" (shared via .mcp.json)
"--scope user"    (all projects)                              [renamed from "global"]

Managed-only:
- allowedMcpServers (allowlist)
- deniedMcpServers (denylist)
- allowManagedMcpServersOnly (lockdown)
```

**Delta since 2026-03-28:** install-time `--scope` values renamed (`project` → `local`, `global` → `user`); old values still accepted as aliases. CLI subcommands `claude mcp add|list|get|remove` are canonical management; in-session `/mcp` shows live status.

**Implication:** A project's `.mcp.json` is functionally a *separate* config surface from `.claude/settings.json` even though both can declare `mcpServers`. The trust gate (`enableAllProjectMcpServers` + per-name allowlist/denylist) lives in regular settings — a dual-file model unique to Claude Code.

### Finding D3.10: `env` settings.json block sets per-session env vars; credential resolution has its own dedicated precedence ladder
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/settings`; `code.claude.com/docs/en/authentication`; `code.claude.com/docs/en/cli-reference`

```text
"env": {
  "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
  "CUSTOM_VAR": "value"
}

Authentication credential precedence (independent of env block):
1. Cloud provider (CLAUDE_CODE_USE_BEDROCK | CLAUDE_CODE_USE_VERTEX | CLAUDE_CODE_USE_FOUNDRY)
2. ANTHROPIC_AUTH_TOKEN env var (Authorization: Bearer header)
3. ANTHROPIC_API_KEY env var (X-Api-Key header)
4. apiKeyHelper script output (TTL: 5min default)
5. CLAUDE_CODE_OAUTH_TOKEN env var (long-lived OAuth)
6. /login OAuth credentials (default for Pro/Max/Team/Enterprise)
```

Behavioral env vars beyond credentials: `CLAUDE_CONFIG_DIR` (relocates `~/.claude/`), `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`, `MCP_TIMEOUT`, `MAX_MCP_OUTPUT_TOKENS`, `ENABLE_TOOL_SEARCH`, `ENABLE_CLAUDEAI_MCP_SERVERS`, `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, `CLAUDE_CODE_NEW_INIT=1`.

**Implication:** The `env` block in settings.json layers into the session environment but does *not* override credential resolution, which has its own precedence chain. A user setting `ANTHROPIC_API_KEY` in settings.json `env` will not override an actual exported `ANTHROPIC_API_KEY` in the shell.

### Finding D3.11: CLI flags shadow settings.json on a per-flag basis; `--bare` and `--setting-sources` are master mute switches
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/cli-reference`

```text
Flag                       Settings field overridden
--model                    model
--permission-mode          permissions.defaultMode
--allowedTools             permissions.allow (additive)
--disallowedTools          permissions.deny (additive)
--add-dir                  permissions.additionalDirectories
--mcp-config <path>        mcpServers (merged from file)
--strict-mcp-config        IGNORES all other mcpServers sources
--settings <path|json>     Loads additional settings layer
--setting-sources          Comma list of {user, project, local} (default: all)
--plugin-dir               Loads plugin from path, bypassing cache
--agents '<json>'          Defines subagents inline
--bare                     SKIPS auto-discovery of hooks, skills, plugins, MCP,
                           auto memory, CLAUDE.md (sets CLAUDE_CODE_SIMPLE)
--dangerously-skip-permissions
                           Equivalent to --permission-mode bypassPermissions
--append-system-prompt[-file]   Appends to default system prompt
--system-prompt[-file]          REPLACES default system prompt
--exclude-dynamic-system-prompt-sections
                           Moves per-machine sections out of system prompt
                           (improves prompt-cache reuse for multi-user workloads)
```

**Implication:** Where VS Code uses launch flags only for diagnostics (`--disable-extensions`, `--user-data-dir`), Claude Code's CLI flags are a first-class config layer between command-line and local-settings in the precedence chain. `--bare` and `--setting-sources` are unique to Claude Code and exist because Claude Code is also a programmatic harness invoked from scripts, not just an interactive CLI.

### Finding D3.12: `/config` is no longer the canonical settings UI; per-concern slash commands and direct settings.json edits are the surfaces
**Confidence:** INFERRED
**Evidence:** `code.claude.com/docs/en/cli-reference`; `code.claude.com/docs/en/permissions`; `code.claude.com/docs/en/memory`; `code.claude.com/docs/en/skills`; sole `/config` mention in `code.claude.com/docs/en/authentication`:

```text
"To change [the API key approval] later, use the 'Use custom API key' toggle in /config."
```

That single mention of `/config` in the 2026 docs survives only as a credential-toggle UI. Dedicated commands per concern: `/permissions` (manages permission rules with source labels), `/memory` (lists CLAUDE.md/CLAUDE.local.md/rules + auto-memory toggle), `/agents` (subagents), `/hooks`, `/mcp` (MCP server status), `/model` (session model selector), `/statusline`, `/skills`. CLI-level: `claude agents`, `claude mcp`.

**Implication:** Settings UX is partitioned by concern, with the file (`settings.json`) as source of truth. This contrasts strongly with VS Code's universal `Cmd+,` Settings UI as primary edit surface. There is no single "Settings" UI in Claude Code — the surface is fragmented by domain.

---

## Negative searches

* **Searched:** `/config` deprecation announcement in 2026 → NOT FOUND. Inferred from feature partitioning + sole-surviving credential-toggle reference. The slash command may still exist for legacy paths but is not documented as a general settings UI in the 2026 docs.
* **Searched:** per-hook approval prompt for project-scoped hooks → NOT FOUND. Hooks docs describe scope/labeling/`allowManagedHooksOnly` but no first-use confirmation flow analogous to the `@import` external-file CLAUDE.md prompt. Confirmed absence: hook safety relies on scope provenance and admin lockdown, not user-prompt-on-first-run.
* **Searched:** enterprise SSO or RBAC inside `permissions` block → NOT FOUND. Enterprise controls operate at file-deployment level (`forceLoginOrgUUID`, `forceLoginMethod`) plus managed-only flags; no per-user role tagging within a single settings file.
* **Confirmed:** `https://json.schemastore.org/claude-code-settings.json` is the canonical schema reference.

---

## Gaps / follow-ups

* The split between `mcpServers` in `.claude/settings.json` (project scope) vs the project-scope `.mcp.json` file is documented loosely; the relationship for a single server name (does settings.json win, does .mcp.json win, do they merge?) is not explicit in the 2026 docs.
* `extraKnownMarketplaces` is documented as Project + User scope only (not Local); the rationale is undocumented.
* Plugin scope precedence within hooks (`force-enabled-plugin-hooks` vs `regular-plugin-hooks`) is referenced in `allowManagedHooksOnly` but the mechanism for "force enable" via `enabledPlugins` in managed settings is only indirectly described.
* `claudeMdExcludes` array merge semantics across scopes — the field uses array-merge per D3.2, but whether matching in one scope can be re-included by another is not explicit.
