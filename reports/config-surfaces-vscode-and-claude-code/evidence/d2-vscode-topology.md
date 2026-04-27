# Evidence: D2 — VS Code Scope Topology

**Dimension:** Full per-scope topology of VS Code's configuration system
**Date:** 2026-04-25
**Sources:** code.visualstudio.com docs (settings, settings-sync, profiles, multi-root-workspaces, contribution-points, configure/keybindings, debugtest/debugging-configuration, debugtest/tasks, copilot/customization/mcp-servers); microsoft/vscode source (vscode-dts/vscode.d.ts, configurationRegistry.ts, configurationEditingService.ts); github/gitignore Global/VisualStudioCode.gitignore

---

## Key files / pages referenced

- `https://code.visualstudio.com/docs/configure/settings` — five-scope ladder, per-OS file paths, language-override syntax, object/primitive merge rules
- `https://code.visualstudio.com/docs/configure/settings-sync` — Sync category bundle, ignored settings, conflict UX, machine-scope skip
- `https://code.visualstudio.com/docs/configure/profiles` — Profile bundle contents, default profile, per-workspace binding
- `https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces` — `.code-workspace` schema, folder-vs-workspace settings precedence
- `https://code.visualstudio.com/api/references/contribution-points` — six declarable string `scope` values
- `https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts` (~lines 6741-6960) — `ConfigurationTarget` enum, `WorkspaceConfiguration.inspect()`/`update()`
- `https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configurationRegistry.ts` (lines 129-260) — internal 7-value `ConfigurationScope` enum, `IConfigurationPropertySchema` flags
- `https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/configuration/common/configurationEditingService.ts` — UI ↔ JSON write path
- `https://code.visualstudio.com/docs/copilot/customization/mcp-servers` — MCP scope tripartite (workspace `.vscode/mcp.json`, user-profile, dev-container)
- `https://github.com/github/gitignore/blob/main/Global/VisualStudioCode.gitignore` — community-canonical commit allowlist for `.vscode/`

---

## Findings

### Finding D2.1: Five-scope ladder; eight-slot effective lookup
**Confidence:** CONFIRMED
**Evidence:** `vscode.d.ts` ~line 6759 (jsdoc on `WorkspaceConfiguration.inspect()`); `code.visualstudio.com/docs/configure/settings`

```text
The *effective* value (returned by WorkspaceConfiguration.get) is computed by overriding or merging the values in the following order:
1. defaultValue
2. globalValue          (User)
3. workspaceValue       (Workspace)
4. workspaceFolderValue (Folder, in multi-root)
5. defaultLanguageValue
6. globalLanguageValue
7. workspaceLanguageValue
8. workspaceFolderLanguageValue
Note: Only object value types are merged and all other value types are overridden.
```

The docs page enumerates the same five base scopes plus admin policy overriding everything. Language-specific variants take precedence over their non-language siblings.

**Implication:** "Where does this value come from?" is a deterministic 8-slot lookup; `inspect()` is the canonical introspection API.

### Finding D2.2: Object-typed settings merge across scopes; primitive/array settings fully override
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/settings`

```text
Note: Only object value types are merged and all other value types are overridden.

Example 3: Object Values
defaultValue = { "a": 1, "b": 2 };
globalValue  = { "b": 3, "c": 4 };
value        = { "a": 1, "b": 3, "c": 4 };
```

Docs reiterate: "Values with primitive types and Array types are overridden … But, values with Object types are merged."

**Implication:** Same key + same scope ladder produces different shapes depending on JSON type. A downstream consumer cannot uniformly say "the workspace value wins" without checking the value type.

### Finding D2.3: Per-setting `scope` tag has six declarable string values
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/api/references/contribution-points` (verified via direct WebFetch 2026-04-25)

```text
application:           "Settings that apply to all instances of VS Code and can only be configured in user settings."
machine:               "Machine specific settings that can be set only in user settings or only in remote settings."
machine-overridable:   "Machine specific settings that can be overridden by workspace or folder settings."
window:                "Windows (instance) specific settings which can be configured in user, workspace, or remote settings."  (default if scope omitted)
resource:              "Resource settings, which apply to files and folders, and can be configured in all settings levels, even folder settings."
language-overridable:  "Resource settings that can be overridable at a language level."
```

Internal source (`configurationRegistry.ts` lines 129-160) defines a 7-value `ConfigurationScope` enum that includes a private `APPLICATION_MACHINE` value not in the public string list.

**Implication:** The `scope` tag is the *contract* by which an extension constrains where its settings can be written; it directly governs which `ConfigurationTarget` writes are accepted.

### Finding D2.4: `ConfigurationTarget` enum has 3 write targets, even though `inspect()` exposes 8 read slots
**Confidence:** CONFIRMED
**Evidence:** `vscode.d.ts` lines 6741-6756

```text
export enum ConfigurationTarget {
  /** Global configuration */
  Global = 1,
  /** Workspace configuration */
  Workspace = 2,
  /** Workspace folder configuration */
  WorkspaceFolder = 3
}

update(section, value, configurationTarget?: ConfigurationTarget | boolean | null, overrideInLanguage?: boolean): Thenable<void>;
  - If true updates Global settings.
  - If false updates Workspace settings.
  - If undefined/null updates WorkspaceFolder if resource-specific, otherwise Workspace.
```

Language overrides are written via the `overrideInLanguage` flag, not as a separate target.

**Implication:** Read and write surfaces differ in dimensionality — the 8 slots collapse to 3 write targets at the API.

### Finding D2.5: Multi-root `.code-workspace` files introduce a 4th physical config surface between User and Folder
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces`

```text
The Workspace file can also contain Workspace global settings under `settings`
and extension recommendations under `extensions`.

User settings form the baseline → Workspace-level settings override user settings →
Folder-specific settings override both workspace and user settings.

"Global Workspace settings override User settings and folder settings can override
Workspace or User settings."
```

The `folders` array holds absolute or relative paths and may include a display `name`. Workspace-level `launch` and `tasks` blocks are namespaced under their basename.

**Implication:** A tool scanning only `.vscode/settings.json` will miss workspace-file overrides in multi-root setups.

### Finding D2.6: User settings live at OS-XDG paths; Workspace settings at `.vscode/settings.json`; Profile settings under a `profiles/<id>/` sibling
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/settings`

```text
User Settings:
- Windows: %APPDATA%\Code\User\settings.json
- macOS:   $HOME/Library/Application Support/Code/User/settings.json
- Linux:   $HOME/.config/Code/User/settings.json

Profile Settings:
- Windows: %APPDATA%\Code\User\profiles\<profile ID>\settings.json
- macOS:   $HOME/Library/Application Support/Code/User/profiles/<profile ID>/settings.json
- Linux:   $HOME/.config/Code/User/profiles/<profile ID>/settings.json

Workspace Settings: located under the .vscode folder in your root folder.
```

Multi-root workspace settings live inside the `.code-workspace` file itself.

**Implication:** Each scope binds to a different filesystem location and identity model (user-XDG vs project-tree vs profile-id vs in-band-JSON).

### Finding D2.7: `.vscode/` is the canonical project-tree config dir; GitHub's official template ignores it except a known whitelist
**Confidence:** CONFIRMED
**Evidence:** `github.com/github/gitignore/blob/main/Global/VisualStudioCode.gitignore`

```text
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets
```

Per-feature file roles (verified):
- `settings.json` — workspace settings
- `launch.json` — debug configurations
- `tasks.json` — task configurations
- `extensions.json` — recommended extensions (`recommendations`, `unwantedRecommendations`)
- `mcp.json` — MCP server configurations at workspace scope

`.vscode/` does **not** host `keybindings.json` (user-only).

**Implication:** Five distinct files share one tree-local directory across five feature subsystems; the GitHub "ignore-then-allowlist" pattern is the de facto industry default for what to commit.

### Finding D2.8: `keybindings.json` is user-only, OS-located, with append-and-negate override semantics
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/keybindings`

```text
Per-OS file paths (mirror of User settings layout):
- Windows: %APPDATA%\Code\User\keybindings.json
- macOS:   $HOME/Library/Application Support/Code/User/keybindings.json
- Linux:   $HOME/.config/Code/User/keybindings.json

"The additional keybindings.json rules are appended at runtime to the bottom of the
default rules, thus allowing them to overwrite the default rules."

"To remove a keyboard shortcut by using the keybindings.json file, add a `-` to the
`command` and the rule will be a removal rule."

Schema fields per rule: { key, command, when? }
```

`keybindings.json` is profile-bound (Settings Sync syncs it per-platform). VS Code does not expose a workspace-scoped `keybindings.json`.

**Implication:** Keybindings break the "every file has a workspace counterpart" pattern — they are categorically user/profile only, with append-and-negate semantics differing structurally from settings (which use scope-precedence).

### Finding D2.9: Language-scoped overrides use `[language-id]: { ... }` and are gated by `language-overridable` scope tag
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/settings`; `IConfigurationPropertySchema`

```text
Syntax:
{
  "[typescript]": { "editor.formatOnSave": true, "editor.formatOnPaste": true },
  "[markdown]":   { "editor.wordWrap": "on" }
}
Multiple at once: "[javascript][typescript]": { ... }

"Language-specific editor settings always override non-language-specific editor
settings, even if the non-language-specific setting has a narrower scope."

Only settings declared with scope LANGUAGE_OVERRIDABLE accept these per-language overrides.
```

**Implication:** Language overrides are not a "scope" in the ladder sense — they are a parallel dimension that multiplies each scope by the set of language IDs declared. Settings not tagged `language-overridable` silently ignore them.

### Finding D2.10: Settings UI ↔ JSON dual surface kept in sync by `ConfigurationEditingService`
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/settings`; `microsoft/vscode/.../configurationEditingService.ts`

```text
"Settings Editor (UI): graphical interface accessible via File > Preferences > Settings
or Ctrl+,. Presents settings grouped by category."

"settings.json (Direct): editable directly via 'Preferences: Open User Settings (JSON)'.
Offers IntelliSense with completions and validation."

"workbench.settings.editor" can be set to "json" to make keyboard shortcuts default
to JSON editing.
```

Source-side `ConfigurationEditingService.writeConfiguration(...)` accepts a target scope, computes formatted JSON edits using the workspace's `insertSpaces`/`tabSize`, and writes back to the corresponding `settings.json` file. Schema-driven IntelliSense in the JSON editor is supplied by the configuration registry.

**Implication:** UI ↔ JSON parity is structural, not lossy: every UI write produces a deterministic JSON edit (preserving comments and formatting); every schema-registered setting gets autocomplete in the JSON editor; there is no "UI-only" surface for registered settings.

### Finding D2.11: Settings Sync covers a fixed 7-category bundle; `machine`-scoped settings are skipped by default
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/settings-sync`

```text
Settings Sync syncs:
- Settings, Keyboard shortcuts (per-platform by default), User snippets, User tasks,
  UI State (display language, Activity Bar, panel visibility, notifications),
  Extensions (and enablement state), Profiles.

"Settings marked with `machine` or `machine-overridable` scopes don't synchronize."
Override via: settingsSync.ignoredSettings, settingsSync.ignoredExtensions.
Auth: Microsoft account or GitHub account (GitHub Enterprise not supported).
Conflict UX: Accept Local | Accept Remote | Show Conflicts (diff editor).
```

The internal `IConfigurationPropertySchema` (configurationRegistry.ts lines 187-195) exposes `ignoreSync` and `disallowSyncIgnore` flags so extensions can opt individual settings out of sync (or pin them in).

**Implication:** The `machine` scope tag is the unit of "don't sync" enforcement; Sync is opt-in cloud sync of user-level config across machines.

### Finding D2.12: Profiles bundle 7 categories incl. MCP servers; bind per-workspace; live config is the implicit "Default Profile"
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/profiles`

```text
Profile bundles:
- Settings, Keyboard shortcuts, Snippets, Tasks, Extensions, UI State, MCP servers.

"VS Code treats your current configuration as the Default Profile."
"When you create or select a profile, it is associated with the current folder
or workspace. Whenever you open that folder, the workspace's profile becomes active."
".code-profile" file extension for local export/import; Profiles can also sync
when "Profiles" is checked under "Settings Sync: Configure".
```

**Implication:** Profiles and Sync are orthogonal *and* composable: Profiles partition a single user's config space; Sync ships partitions across machines. Per-workspace profile binding gives VS Code something Claude Code lacks — the same physical user can flip an entire config bundle by opening a different repo.

### Finding D2.13: MCP server config exists at three scopes: workspace `.vscode/mcp.json`, user-profile `mcp.json`, dev-container customizations
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/copilot/customization/mcp-servers`

```text
Workspace level:    create or open `.vscode/mcp.json` in your project.
User profile level: "MCP: Open User Configuration" command opens the mcp.json file in your user profile location.
Dev container:      added to devcontainer.json under customizations.vscode.mcp;
                    "VS Code automatically writes the MCP server configurations to the remote mcp.json file"
                    when the container is created.
```

User-level MCP configurations are profile-bound — "each profile maintains its own separate MCP server configuration."

**Implication:** MCP integration follows the same scope tripartite (user-profile / workspace / dev-container) but addresses each by command + path, not by filename suffix.

---

## Negative searches

* **Searched:** `requiresReload` setting metadata flag in vscode (Google + grep on `configurationRegistry.ts` lines 161-260)
  * **Result:** NOT FOUND. The "Reload Required" prompt visible in the Settings UI is a reactive UX (extension activation/feature-flag transition), not a per-setting opt-in field. Public schema fields confirmed in source: `restricted`, `included`, `tags`, `ignoreSync`, `disallowSyncIgnore`, `disallowConfigurationDefault`, `enumItemLabels`, `keywords`, `editPresentation`, `order`, `policy`, `experiment`.

---

## Gaps / follow-ups

* **User-level Tasks composition rules** — docs confirm `Tasks: Open User Tasks` exists and that user properties "will be used for specific tasks unless they define the same property with a different value," but explicit precedence rules between user `tasks.json` and workspace `tasks.json` are not enumerated.
* **Per-folder `launch.json` vs workspace-file `launch` block** — both surfaces exist but the docs don't spell out which wins in a multi-root workspace when both define the same configuration.
* **Remote settings file path on disk** — docs name "Remote settings" as a scope but don't give an on-disk path equivalent to User/Workspace; this is host-extension-specific (Remote-SSH, Dev Containers, WSL each manage their own `settings.json` location).
* **MCP server precedence between workspace `.vscode/mcp.json` and user/profile `mcp.json`** — docs say workspace "takes precedence for specific projects" but don't describe whether servers merge by name, fully override, or both load.
* **`APPLICATION_MACHINE` scope** — internal enum value, no public string; not documented in extension authoring guides.
