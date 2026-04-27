# Evidence: D6 — Interesting Design Choices: Where Each Product Split or Unified a Concept

**Dimension:** The design forks where the two products made opposite calls — split where the other unified, unified where the other split, took the dual surface where the other didn't.
**Date:** 2026-04-25
**Sources:** D2 + D3 evidence + D4 + D5; cross-referenced with D7 for grounding (ESLint's deliberate retreat from cascade is precedent for both directions).

---

## Approach

Each design choice below pairs a specific decision in one product with the opposite (or just-different) decision in the other. The point is not to evaluate which is better — that's not the report's stance — but to surface *where* the products diverged structurally and what tradeoff each was apparently optimizing.

---

## Choice 1: One schema with per-setting scope tags vs many files per scope

**VS Code:** Unifies all settings into a single global schema. Each setting is registered once via `contributes.configuration` with a `scope` tag (`application`, `machine`, `window`, `resource`, `language-overridable`, etc.). The same `editor.fontSize` key exists in User, Workspace, and Folder; the `scope` tag governs which writes are *accepted* at each level. [D2.3, D2.5]

**Claude Code:** Splits configuration across many files per scope. Within a single project: `.claude/settings.json`, `.claude/settings.local.json`, `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/skills/*/SKILL.md`, `.mcp.json`, `CLAUDE.md`. There is no master schema constraining "this field is project-only" — instead, the *field-validity-per-scope* is encoded in the docs' "Valid Scopes" column and enforced by the loader (D3.3). The set of "this field only works at managed scope" is essentially a hardcoded list (~18 fields).

**The trade-off:** VS Code's unified-schema approach is enforceable by the registry and discoverable via the Settings UI. Adding a new setting category means registering it once and tagging it; the surface for editing is automatic. Claude Code's many-files-per-scope approach maps each conceptual category onto its own filesystem layout, which makes each category's *shape* more flexible (markdown for skills, JSON for settings, single-file for `.mcp.json`) at the cost of central enforcement. Adding "agents" to Claude Code didn't require expanding the settings schema; it required adding a new directory convention.

**Where each shows the cost:**
- VS Code: every new feature category fights to fit into the settings schema or carves out a new file (`launch.json`, `tasks.json`, `mcp.json` are all category-files that escaped settings.json).
- Claude Code: lookup-by-feature is filesystem-walk-driven, not registry-driven; tools that want to enumerate "all configurable surfaces" must walk multiple file conventions.

## Choice 2: Object merge vs array merge as the default cross-scope semantic

**VS Code:** Objects merge across scopes (`{a:1,b:2}` ∪ `{b:3,c:4}` = `{a:1,b:3,c:4}`); primitives and arrays *override* — higher-priority scope wins entirely. [D2.2]

**Claude Code:** Arrays merge across scopes (concatenated and deduplicated); behavior for objects is implicit but follows the same documented merge intent. [D3.2]

**The trade-off:** These are the *same* categorical semantic ("merge richer types, override scalars") with the dividing line drawn differently — VS Code merges objects but overrides arrays; Claude Code merges arrays. The choice has direct consequences for security model:
- Claude Code's `permissions.deny: ["Bash(curl:*)"]` declared at project scope *adds* to a user-scope `deny: ["Bash(rm:*)"]` — both denies apply. A scope can never subtract from a higher-priority `deny`.
- VS Code's array-override means a workspace-scope override of `editor.rulers: [80, 120]` would entirely replace a user-scope `editor.rulers: [80]`. The workspace wins outright.

The reason for the difference is intent: Claude Code's headline use of arrays is permission rules (additive intent — every scope contributes restrictions); VS Code's headline use of arrays is editor-style configuration (override intent — the most-specific scope's preference wins). Each picked the merge model that fit its primary use case.

## Choice 3: Dual surface (UI ↔ file) vs file-first with fragmented per-concern UIs

**VS Code:** Maintains a true dual surface. The Settings UI (`Cmd+,`) and `settings.json` are kept in *structural* sync via `ConfigurationEditingService` — every UI write produces a deterministic JSON edit preserving comments and formatting; every schema-registered setting gets autocomplete in the JSON editor. The user can pick whichever surface they prefer for any setting. [D2.10]

**Claude Code:** File-first. `settings.json` is the canonical surface, hand-edited or scripted. UI is fragmented across per-concern slash commands: `/permissions` for permissions, `/memory` for CLAUDE.md, `/agents` for agents, `/mcp` for MCP, `/model` for the session model, `/statusline` for the status line. `/config` survives only as a credential-toggle UI. [D3.12]

**The trade-off:** Dual-surface (VS Code) requires nontrivial engineering — the editing service must round-trip through JSON without losing comments or formatting, and every schema-registered setting must render meaningfully in the UI. The payoff is a setting-discoverability story (search the Settings UI, find any setting, click to toggle). File-first (Claude Code) skips the engineering — the file is canonical, the user can use any text editor, no UI gets out of sync — at the cost of discoverability. Per-concern slash commands recover discoverability for the most common categories (permissions, memory, agents) but leave the long tail to documentation.

The pattern shows in adjacent products:
- JetBrains' `.idea/` files are also dual-surface — UI-edited, then written to disk in a structured XML format. Settings UI is the primary user surface.
- npm and git are file-first / CLI-first with no comprehensive GUI; configuration is hand-edited or set via `npm config set` / `git config`. Same end of the spectrum as Claude Code.

## Choice 4: Per-developer per-project local override as a named, supported surface vs not having one

**Claude Code:** `.claude/settings.local.json` is a named, supported, gitignored-by-convention surface. It sits at the third position in the precedence chain (above project-shared, below CLI-and-managed). The use case — "my override of this project's settings, not pushed to teammates" — has its own file. [D3.1]

**VS Code:** Has no equivalent file. To achieve the same effect, a VS Code user either (a) edits `.vscode/settings.json` and unstages — fragile, prone to accidental commit; (b) creates a per-workspace Profile — heavyweight, requires Profile management UX; or (c) sets at User scope — leaks the override to every other workspace. The use case is achievable but not first-class.

**The trade-off:** Claude Code's choice acknowledges that "I want to override the team's setting just for me, just on this project" is a real and recurring need. The cost is one more scope to teach, one more file in the precedence ladder, one more gitignore entry. VS Code's choice avoids the surface but pushes users toward the fragile alternatives.

This is the cleanest example of "Claude Code has a category VS Code doesn't" being a deliberate response to an agent-trust scenario: a teammate's project-shared `permissions.deny: ["Bash(curl:*)"]` should be *individually overridable* by a developer who has a legitimate reason to allow `curl` for their workflow, *without* pushing that override to everyone. The mechanism (project deny, local allow, settings precedence makes local win) only works because the local-personal layer exists as a named scope.

## Choice 5: Cascading config (multi-folder) vs strict project root

**VS Code:** Has a 5-scope ladder including Workspace Folder (per-folder `.vscode/settings.json` in multi-root), and the per-folder layer overrides workspace-level. [D2.5] Plus the `.code-workspace` artifact that bundles multiple folders into a single workspace.

**Claude Code:** Single-cwd-rooted. There is one project scope per `cwd`. Multi-cwd via `--add-dir` is session-scoped, not a persistent workspace artifact. (CLAUDE.md does have a recursive parent-walk + lazy subdirectory load — but that's a *concatenation* of context, not an *override* of config values.) [D3.4]

**The trade-off:** ESLint's experience is informative here (D7.2). ESLint had a cascading model (`.eslintrc.*` files in any subdirectory inherited from parents), then deliberately *removed* it in v9. The migration blog frames the change as wanting "to get rid of the directory-based config cascade" and cites the perf cost — flat config "dramatically reduces the disk access required as compared to eslintrc, which had to check each directory from the linted file location up to the root." ESLint replaced it with a single root config file using `files` glob arrays for in-config scoping.

VS Code stuck with cascading at the cost of conceptual surface area (Workspace Folder is a separate scope to teach, separate `inspect()` slot to query, separate write target). Claude Code (and ESLint's flat-config) chose simplicity — one project = one scope. The product surfaces this as: VS Code is well-suited to monorepos with mixed languages where each subfolder has different config; Claude Code is well-suited to a single project's scope.

## Choice 6: First-party sync product vs leave it to the user

**VS Code:** Settings Sync is a first-party product. Microsoft / GitHub account-backed, opt-in, syncs a fixed 7-category bundle. Per-setting `machine` scope tag for "don't sync this." User-controlled `settingsSync.ignoredSettings` for case-by-case opt-out. [D2.11, D2.12]

**Claude Code:** No sync product. Users dotfile-sync `~/.claude/` themselves (chezmoi, GNU Stow, plain git in `~`).

**The trade-off:** VS Code's choice means users get a one-toggle "my settings follow me" experience. The cost is a sync service to operate, a per-setting scope tag to teach (`machine`), and a per-setting opt-out mechanism. Claude Code's choice means no service to operate but a worse default experience for cross-machine users — and no per-setting "don't sync" hook because there's no sync.

JetBrains follows VS Code's path (Backup and Sync plugin via JetBrains Account, D7.3); git, npm, ESLint follow Claude Code's path (no sync product). The split correlates with whether the product is a UI-heavy tool with personal-preference-laden config (VS Code, JetBrains: yes) or a file-first dev tool where config is more functional than personal (git, npm, Claude Code: yes).

## Choice 7: Profiles (named bundles, per-workspace association) vs not

**VS Code:** Profiles are first-class — bundles of (settings + keybindings + snippets + tasks + extensions + UI state + MCP servers); created/exported/imported via `.code-profile` files; per-workspace association (opening a workspace activates its bound Profile); the live config is the implicit "Default Profile". [D2.12]

**Claude Code:** No first-class profiles. `CLAUDE_CONFIG_DIR` env var can relocate `~/.claude/`, which is the closest mechanism — but there's no UI for managing multiple profiles, no per-workspace binding, no `.code-profile`-equivalent import/export format.

**The trade-off:** Profiles solve the "I have multiple personas / multiple project styles / multiple side-by-side contexts and want completely different config bundles for each" problem. VS Code paid the engineering for first-class profiles (per-workspace binding requires hooks into workspace-open; bundled export requires defining the bundle format). Claude Code defers to a single env-var swap, which works for power users but isn't a UI-managed feature.

This is one of the clearer cases where VS Code's longer maturation shows — Profiles GA'd around 2023, after years of users requesting them; Claude Code is too young (~2 years) to have made that investment.

## Choice 8: CLAUDE.md as text-as-context vs no comparable category

**Claude Code:** CLAUDE.md is a first-class category — a hierarchy of long-form text instructions injected at session start, scoped per-project / per-user / per-managed-policy / per-project-local, with recursive parent-walk and `@import` syntax. [D3.4] Cursor invented its own version (`.cursor/rules/*.mdc`, D7.5) confirming this is an AI-coding-tool category — neither VS Code, JetBrains, nor any pre-LLM editor has anything analogous.

**VS Code:** No comparable category. Comments in `settings.json` survive structurally but they're metadata for humans reading the JSON, not instructions to a runtime.

**The trade-off:** This isn't a fork on the same surface — it's a category that didn't exist before LLM-runtime tools. The interesting design choice is *how* Claude Code structured the category once it had to: a separate file (CLAUDE.md), separate from settings.json; a hierarchy that *concatenates* (not overrides) so every layer's instructions all apply; a recursive parent-walk for in-tree depth; and an `@import` syntax to chain into other files. The decision to make it concatenative (not overridable) is significant — it means user-level CLAUDE.md instructions cannot be silenced by project-level CLAUDE.md instructions. They both apply.

## Choice 9: CLI flags as a first-class precedence layer vs as diagnostic switches

**Claude Code:** CLI flags sit between Managed and Local in the precedence chain (`--model`, `--permission-mode`, `--allowedTools`, `--mcp-config`, `--bare`, `--setting-sources`). Some flags shadow specific settings.json fields (one-to-one mapping); others are "load nothing" / "load only these" master switches. [D3.11]

**VS Code:** CLI flags exist (`--user-data-dir`, `--profile`, `--disable-extensions`) but they're diagnostic-oriented; they configure the *launch*, not the *settings*. There's no first-class "this CLI flag overrides this setting field" mapping.

**The trade-off:** Claude Code is also invoked programmatically — by CI scripts, by the SDK, by other agents (nest-claude pattern) — and needs flags to be a real config layer, not just launch options. VS Code is primarily an interactive editor; once it's running, flags don't continue to override settings.

## Choice 10: Single canonical settings file vs file-per-feature category

**VS Code:** Within `.vscode/`, splits into 5 distinct files for 5 different subsystems: `settings.json`, `launch.json`, `tasks.json`, `extensions.json`, `mcp.json`. Each file has its own schema and editor. [D2.7]

**Claude Code:** Consolidates most into one `settings.json` per scope, which holds `permissions`, `hooks`, `env`, `model`, `statusLine`, `mcpServers`, and dozens of other top-level fields. Separate files (`.mcp.json`, `CLAUDE.md`, `agents/*.md`, `commands/*.md`, `skills/*/SKILL.md`) exist for categories that *can't* fit cleanly into JSON config (markdown, multi-file structures, redundant agent-shareable form).

**The trade-off:** VS Code's per-feature-file model gives each subsystem its own schema, its own editor experience, and its own commit/sync semantics. The cost is multiplication of files to know about; the benefit is each file is purpose-built. Claude Code's mostly-one-file model gives a single edit surface and unified precedence resolution; the cost is `settings.json` becoming a huge schema with diverse field categories living together.

The interesting nuance: for *MCP servers*, both products ended up with category-files (`.vscode/mcp.json` and `.mcp.json`). VS Code's `mcp.json` was added later, after settings was already established as a separate file from `launch.json`/`tasks.json`. Claude Code's `.mcp.json` exists *despite* `settings.json` having an `mcpServers` block — for shareability (committed `.mcp.json` is meant to be visible without committing the full settings file). This is one place both products felt the need for a category-specific file.
